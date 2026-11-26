import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { ApiError } from "./api";
import { captainAssignedKey, captainReleasedKey, offerNoticeKey, riderCancelledKey, searchExpiredKey } from "../deliveryClaim";
import { notify, recoverQueuedNotices, pricePair, priceRide, type CityVehicle, type Place } from "./bookings";
import { noticeCopy } from "../delivery";
import { cityReceipt } from "../receipt";
import { rememberReceipt } from "./deliveryStore";
import { dispatchCityReceiptEmail } from "./receiptDispatch";
import type { Row } from "./data";
import { db } from "./db";
import { loadtestBlocks } from "../loadtestGuard";
import { observe } from "./observe";
import { assignmentWinner, bookingPhase, canTransition, clampSettings, eligibleCaptains, nearPickup, offRoute, parseRadii, searchExpired, searchRadiusKm, type DispatchSettings } from "./dispatch";
import { dayFeeFromRpc } from "../dayFee";
import { DEFAULT_RIDE_PLAN, normalizeRidePlan, rideBill, type RidePlan } from "../ridePlan";
import { locationFixBelievable } from "./locationFix";
import { captainDocuments, saveRating } from "./phoneDesk";
import { beginGatewayAttempt } from "./razorpay";
import { bookingPaymentAllowed } from "./rideStartSecurity";
import { kickConsumers } from "./rides";
import { leaseExpired, leaseOwned, leaseStamp, SWEEP_LEASE_KEY } from "./sweepLease";

import { acceptCode, deliverCode } from "./otpDelivery";

const SETTING_KEYS = ["dispatch_offer_seconds", "dispatch_search_seconds", "dispatch_gps_fresh_seconds", "dispatch_batch", "dispatch_radius_km"];

type App = "rider" | "captain";
type Session = { sub: string; app: App; kind: "access" | "refresh"; exp: number; jti?: string };
type QuoteBody = { riderId: string; pickup: Place; drop: Place; bike: Awaited<ReturnType<typeof priceRide>>; auto: Awaited<ReturnType<typeof priceRide>>; exp: number };

type Booked = { id: string; code: string; otp: string; fare: number; distanceKm: number; etaMin: number };
const bookedQuotes = new Map<string, { riderId: string; fingerprint: string; result: Booked }>();
const bookingNow = new Map<string, Promise<Booked>>();
let settingsCache: { at: number; settings: DispatchSettings } | null = null;
let offerExpiredStatus: "expired" | "rejected" = "expired";

export async function loadDispatchSettings() {
  if (settingsCache && Date.now() - settingsCache.at < 15_000) return settingsCache.settings;
  const { data } = await db().from("platform_settings").select("key,value").in("key", SETTING_KEYS);
  const values = new Map(((data ?? []) as Row[]).map((row) => [String(row.key), String(row.value)]));
  const settings = clampSettings({
    offerSeconds: Number(values.get("dispatch_offer_seconds")),
    searchSeconds: Number(values.get("dispatch_search_seconds")),
    gpsFreshSeconds: Number(values.get("dispatch_gps_fresh_seconds")),
    batch: Number(values.get("dispatch_batch")),
    radiiKm: values.get("dispatch_radius_km") ? parseRadii(String(values.get("dispatch_radius_km"))) : undefined,
  });
  settingsCache = { at: Date.now(), settings };
  return settings;
}

export async function saveDispatchSetting(key: string, raw: string) {
  if (!SETTING_KEYS.includes(key)) throw new ApiError("That dispatch setting is not recognised.", 400);
  const current = await loadDispatchSettings();
  const next = clampSettings({
    ...current,
    offerSeconds: key === "dispatch_offer_seconds" ? Number(raw) : current.offerSeconds,
    searchSeconds: key === "dispatch_search_seconds" ? Number(raw) : current.searchSeconds,
    gpsFreshSeconds: key === "dispatch_gps_fresh_seconds" ? Number(raw) : current.gpsFreshSeconds,
    batch: key === "dispatch_batch" ? Number(raw) : current.batch,
    radiiKm: key === "dispatch_radius_km" ? parseRadii(raw) : current.radiiKm,
  });
  const value = key === "dispatch_radius_km" ? next.radiiKm.join(",") : String(next[key === "dispatch_offer_seconds" ? "offerSeconds" : key === "dispatch_search_seconds" ? "searchSeconds" : key === "dispatch_gps_fresh_seconds" ? "gpsFreshSeconds" : "batch"]);
  const { error } = await db().from("platform_settings").upsert({ key, value, updated_at: new Date().toISOString() }).select("key").single();
  if (error) throw new ApiError("The dispatch setting could not be saved.", 400);
  settingsCache = null;
  return loadDispatchSettings();
}

async function remember(tripId: string, kind: string, detail: string) {
  const { error } = await db().from("booking_events").insert({ trip_id: tripId, kind, detail, at: new Date().toISOString() });
  if (error && !/booking_events|schema cache|relation|does not exist/i.test(error.message)) console.error("booking event", kind);
}

async function closeOffer(id: string, kind: "expired" | "rejected" | "withdrawn") {
  const status = kind === "expired" ? offerExpiredStatus : kind;
  const result = await db().from("trip_offers").update({ status, decided_at: new Date().toISOString() }).eq("id", id).eq("status", "offered").select("id");
  if (result.error && kind === "expired") {
    offerExpiredStatus = "rejected";
    const again = await db().from("trip_offers").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("id", id).eq("status", "offered").select("id");
    return Boolean(again.data?.length);
  }
  return Boolean(result.data?.length);
}

const secret = () => {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new ApiError("The ride service is not configured.", 500);
  return key;
};

const sign = (payload: Session) => {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
};

const readToken = (header: string | null, kind: Session["kind"]) => {
  const token = header?.replace(/^Bearer\s+/i, "") ?? "";
  const [body, mac] = token.split(".");
  if (!body || !mac) throw new ApiError("Sign in to continue.", 401);
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new ApiError("Sign in to continue.", 401);
  const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as Session;
  if (payload.kind !== kind || payload.exp * 1000 < Date.now()) throw new ApiError("Your session has ended. Please sign in again.", 401);
  return payload;
};

export const session = (header: string | null, app?: App) => {
  const payload = readToken(header, "access");
  if (app && payload.app !== app) throw new ApiError("Sign in to continue.", 401);
  return payload;
};

const tokens = (sub: string, app: App) => {
  const expiresAt = Math.floor(Date.now() / 1000) + 2 * 60 * 60;
  const jti = randomUUID();
  const refreshExp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  return {
    accessToken: sign({ sub, app, kind: "access", exp: expiresAt, jti }),
    refreshToken: sign({ sub, app, kind: "refresh", exp: refreshExp, jti }),
    expiresAt,
    userId: sub,
  };
};

const revoked = new Map<string, number>();

async function countAttempt(phone: string) {
  const { allow } = await import("./rateLimit");
  await allow("otp", phone, 8, 600, "Too many tries. Wait ten minutes and try again.");
}

async function markRevoked(jti: string, exp: number) {
  revoked.set(jti, exp);
  await db().from("platform_settings").upsert({ key: `revoke_${jti}`, value: String(exp), updated_at: new Date().toISOString() });
}

async function assertLive(payload: Session) {
  if (!payload.jti) return payload;
  const remembered = revoked.get(payload.jti);
  const now = Math.floor(Date.now() / 1000);
  if (remembered && remembered > now) throw new ApiError("Your session has ended. Please sign in again.", 401);
  if (remembered === 0) return payload;
  const { data } = await db().from("platform_settings").select("value").eq("key", `revoke_${payload.jti}`).maybeSingle();
  const exp = Number(data?.value ?? 0);
  revoked.set(payload.jti, exp > now ? exp : 0);
  if (exp > now) throw new ApiError("Your session has ended. Please sign in again.", 401);
  return payload;
}

export async function revokeSession(header: string | null, refreshToken?: string) {
  try {
    const payload = readToken(header, "access");
    if (payload.jti) await markRevoked(payload.jti, payload.exp);
  } catch {
    // Signing out with no access token still clears the phone.
  }
  if (refreshToken) {
    try {
      const refresh = readToken(`Bearer ${refreshToken}`, "refresh");
      if (refresh.jti) await markRevoked(refresh.jti, refresh.exp);
    } catch {
      // An already expired refresh token cannot be used again.
    }
  }
  return { ok: true };
}

export async function openSession(header: string | null, app?: App) {
  return assertLive(session(header, app));
}

const digitsOf = (phone: string) => phone.replace(/\D/g, "").slice(-10);

const kmBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const rad = (value: number) => (value * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const FRESH_MS = 120_000;

const cleanEmail = (value: string) => {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) throw new ApiError("Enter a valid email address.", 400);
  return email;
};

type Channel = { kind: "phone"; value: string } | { kind: "email"; value: string };

function targetOf(input: { phone?: string; email?: string }): Channel {
  if (input.email?.trim()) return { kind: "email", value: cleanEmail(input.email) };
  const digits = digitsOf(input.phone ?? "");
  if (!/^[6-9]\d{9}$/.test(digits)) throw new ApiError("Enter a 10-digit mobile number.", 400);
  return { kind: "phone", value: digits };
}

async function peopleFor(target: Channel) {
  const riders = target.kind === "phone"
    ? await db().from("riders").select("user_id,name,phone,email,status").or(`phone.eq.${target.value},phone.eq.+91${target.value}`).maybeSingle()
    : await db().from("riders").select("user_id,name,phone,email,status").eq("email", target.value).maybeSingle();
  const captains = target.kind === "phone"
    ? await db().from("captains").select("*").or(`phone.eq.${target.value},phone.eq.+91${target.value}`).maybeSingle()
    : await db().from("captains").select("*").eq("email", target.value).maybeSingle();
  return { rider: (riders.data ?? null) as Row | null, captain: (captains.data ?? null) as Row | null };
}

function samePerson(rider: Row | null, captain: Row | null) {
  if (rider?.user_id && captain?.user_id && rider.user_id !== captain.user_id) throw new ApiError("This sign-in could not be completed.", 409);
  return String(rider?.user_id ?? captain?.user_id ?? "");
}

async function openAccount(target: Channel, app: App) {
  const found = await peopleFor(target);
  let userId = samePerson(found.rider, found.captain);
  if (!userId) {
    const created = target.kind === "phone"
      ? await db().auth.admin.createUser({ phone: `+91${target.value}`, phone_confirm: true })
      : await db().auth.admin.createUser({ email: target.value, email_confirm: true });
    if (created.error || !created.data.user) throw new ApiError("This sign-in could not be opened. Try the other method.", 400);
    userId = created.data.user.id;
    const inserted = await db().from("riders").insert({
      user_id: userId,
      phone: target.kind === "phone" ? target.value : null,
      email: target.kind === "email" ? target.value : null,
      name: "ROVEYA rider",
      status: "active",
    }).select("user_id,name,phone,email,status").single();
    if (inserted.error || !inserted.data) {
      await db().auth.admin.deleteUser(userId);
      throw new ApiError("This sign-in could not be opened. Try the other method.", 400);
    }
    found.rider = inserted.data as Row;
  } else if (app === "rider" && !found.rider) {
    const inserted = await db().from("riders").insert({
      user_id: userId,
      phone: target.kind === "phone" ? target.value : found.captain?.phone ?? null,
      email: target.kind === "email" ? target.value : found.captain?.email ?? null,
      name: "ROVEYA rider",
      status: "active",
    }).select("user_id,name,phone,email,status").single();
    if (!inserted.error && inserted.data) found.rider = inserted.data as Row;
  }
  return { userId, ...found };
}

export async function sendOtp(input: { phone?: string; email?: string }) {
  const target = targetOf(input);
  await countAttempt(target.value);
  await deliverCode({ key: target.value, to: target.value, channel: target.kind });
  return { ok: true, channel: target.kind };
}

export async function verifyOtp(input: { phone?: string; email?: string; code: string }, app: App) {
  const target = targetOf(input);
  await countAttempt(target.value);
  await acceptCode(target.value, input.code);
  const account = await openAccount(target, app);
  if (account.rider?.status && account.rider.status !== "active") throw new ApiError("This account is blocked.", 403);
  if (app === "captain") {
    return { ...tokens(account.captain?.user_id ?? account.userId, "captain"), profile: account.captain, isNew: !account.captain };
  }
  if (!account.rider) throw new ApiError("Sign in to continue.", 401);
  const named = account.rider.name && account.rider.name !== "ROVEYA rider" ? String(account.rider.name) : "";
  return { ...tokens(account.userId, "rider"), profile: named ? { name: named } : null, isNew: !named };
}

// Adds the other contact on the same account. It stays unverified until the code matches.
export async function sendContactCode(userId: string, input: { phone?: string; email?: string }) {
  const target = targetOf(input);
  await countAttempt(`link:${userId}:${target.value}`);
  await deliverCode({ key: `link:${userId}:${target.value}`, to: target.value, channel: target.kind });
  return { ok: true, channel: target.kind };
}

export async function confirmContact(userId: string, input: { phone?: string; email?: string; code: string }) {
  const target = targetOf(input);
  await countAttempt(`link:${userId}:${target.value}`);
  await acceptCode(`link:${userId}:${target.value}`, input.code);
  const found = await peopleFor(target);
  const owner = samePerson(found.rider, found.captain);
  if (owner && owner !== userId) throw new ApiError("This contact could not be added.", 409);
  const patch = target.kind === "phone" ? { phone: target.value } : { email: target.value };
  const saved = await db().from("riders").update(patch).eq("user_id", userId).select("user_id").maybeSingle();
  if (!saved.data) throw new ApiError("Sign in to continue.", 401);
  await db().from("captains").update(patch).eq("user_id", userId);
  if (target.kind === "phone") await db().auth.admin.updateUserById(userId, { phone: `+91${target.value}`, phone_confirm: true });
  else await db().auth.admin.updateUserById(userId, { email: target.value, email_confirm: true });
  return { ok: true, channel: target.kind, verified: true };
}

export async function refreshSession(refreshToken: string) {
  const payload = await assertLive(readToken(`Bearer ${refreshToken}`, "refresh"));
  if (payload.jti) await markRevoked(payload.jti, payload.exp);
  return tokens(payload.sub, payload.app);
}

export async function riderMe(userId: string) {
  const { data } = await db().from("riders").select("name,phone,email").eq("user_id", userId).maybeSingle();
  if (!data) throw new ApiError("Sign in to continue.", 401);
  return { rider: { name: data.name, phone: data.phone, email: data.email ?? null } };
}

export async function renameRider(userId: string, name: string) {
  const clean = name.trim().slice(0, 40);
  if (clean.length < 2) throw new ApiError("Enter your name.", 400);
  const { error } = await db().from("riders").update({ name: clean }).eq("user_id", userId);
  if (error) throw new ApiError("The name could not be saved.", 400);
  return { ok: true };
}

const line = (pickup: Place, drop: Place) => [
  [pickup.latitude, pickup.longitude],
  [drop.latitude, drop.longitude],
];
export async function closeAccount(userId: string) {
  const open = await db().from("trips").select("id").or(`rider_id.eq.${userId},captain_id.eq.${userId}`).in("status", ["searching", "assigned", "arrived", "on_trip"]).limit(1);
  if (open.data?.length) throw new ApiError("Finish or cancel the open ride before closing the account.", 409);
  const seats = await db().from("seat_bookings").select("id").eq("rider_id", userId).in("status", ["Pending", "Confirmed"]).limit(1);
  if (seats.data?.length) throw new ApiError("Cancel the open seat before closing the account.", 409);
  const payout = await db().from("payout_requests").select("id").eq("captain_id", userId).eq("status", "requested").limit(1);
  if (payout.data?.length) throw new ApiError("A bank transfer is still waiting. Close the account after it is paid.", 409);
  const wallet = await db().from("wallets").select("balance_paise").eq("owner_id", userId).maybeSingle();
  if (Number(wallet.data?.balance_paise ?? 0) >= 100) throw new ApiError("Redeem the wallet balance before closing the account.", 409);
  const now = new Date().toISOString();
  await db().from("captain_presence").update({ online: false, updated_at: now }).eq("captain_id", userId);
  await db().from("push_tokens").delete().eq("user_id", userId);
  const closedPhone = `0${userId.replace(/-/g, "").slice(0, 9)}`;
  const rider = await db().from("riders").update({ name: "Deleted account", phone: closedPhone, email: null, status: "deleted" }).eq("user_id", userId);
  if (rider.error) throw new ApiError("The account could not be closed. Try again.", 400);
  await db().from("captains").update({ name: "Deleted account", phone: closedPhone, email: null, status: "deleted", bank_holder: null, bank_last4: null, ifsc: null, upi: null, emergency_name: null, emergency_phone: null }).eq("user_id", userId);
  const removed = await db().auth.admin.deleteUser(userId);
  if (removed.error) throw new ApiError("The account could not be closed. Try again.", 400);
  return { ok: true };
}

const sealQuote = (body: QuoteBody) => {
  const raw = Buffer.from(JSON.stringify(body)).toString("base64url");
  const mac = createHmac("sha256", secret()).update(`quote.${raw}`).digest("base64url");
  return `${raw}.${mac}`;
};

const openQuote = (token: string) => {
  const [raw, mac] = token.split(".");
  if (!raw || !mac) throw new ApiError("This fare has expired. Check the price and book again.", 409);
  const expected = createHmac("sha256", secret()).update(`quote.${raw}`).digest("base64url");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new ApiError("This fare has expired. Check the price and book again.", 409);
  const body = JSON.parse(Buffer.from(raw, "base64url").toString()) as QuoteBody;
  if (!body.exp || body.exp < Date.now()) throw new ApiError("This fare has expired. Check the price and book again.", 409);
  return body;
};

export async function quoteRide(riderId: string, pickup: Place, drop: Place) {
  const started = Date.now();
  let bike: Awaited<ReturnType<typeof pricePair>>[0];
  let auto: Awaited<ReturnType<typeof pricePair>>[1];
  try {
    [bike, auto] = await pricePair(pickup, drop);
  } catch (error) {
    observe("quote", { ms: Date.now() - started, outcome: "error", status: error instanceof ApiError ? error.status : 500 });
    throw error;
  }
  observe("quote", { ms: Date.now() - started, source: bike.source });
  const exp = Date.now() + 10 * 60 * 1000;
  return {
    quoteId: sealQuote({ riderId, pickup, drop, bike, auto, exp }),
    expiresAt: new Date(exp).toISOString(),
    distanceKm: bike.km,
    durationMin: bike.etaMin,
    route: line(pickup, drop),
    pickupName: pickup.name,
    options: [
      { vehicle: "bike", fare: bike.farePaise / 100, fullFare: bike.farePaise / 100, discount: 0, etaMin: bike.etaMin },
      { vehicle: "auto", fare: auto.farePaise / 100, fullFare: auto.farePaise / 100, discount: 0, etaMin: auto.etaMin },
    ],
    coupon: null,
  };
}

const offerRuns = new Map<string, Promise<void>>();
const offerSlots: Promise<void>[] = [];
let sweepRunning: Promise<void> | null = null;

async function holdOfferLock(tripId: string) {
  const key = `offer_lock_${tripId}`;
  const now = new Date().toISOString();
  const inserted = await db().from("platform_settings").insert({ key, value: now, updated_at: now });
  if (!inserted.error) return key;
  if (inserted.error.code !== "23505") return null;
  const existing = await db().from("platform_settings").select("updated_at").eq("key", key).maybeSingle();
  const age = Date.now() - Date.parse(String(existing.data?.updated_at ?? ""));
  if (!existing.data || age < 15_000) return null;
  const stolen = await db().from("platform_settings").update({ value: now, updated_at: now }).eq("key", key).eq("updated_at", existing.data.updated_at).select("key");
  return stolen.data?.length ? key : null;
}

// One free captain of the same vehicle, inside the current search radius. The next captain is offered only after this one misses or rejects.
export function offerNext(tripId: string) {
  const existing = offerRuns.get(tripId);
  if (existing) return existing;
  const run = (async () => {
    for (;;) {
      if (offerSlots.length < 4) break;
      await Promise.race(offerSlots);
    }
    let release: () => void = () => undefined;
    const slot = new Promise<void>((resolve) => { release = resolve; });
    offerSlots.push(slot);
    const started = Date.now();
    try {
      await offerNextOnce(tripId);
      observe("match", { ms: Date.now() - started });
    } catch (error) {
      observe("match_error", { ms: Date.now() - started });
      console.error(JSON.stringify({ event: "match_error", message: error instanceof Error ? error.message.slice(0, 180) : "failed" }));
    } finally {
      release();
      const index = offerSlots.indexOf(slot);
      if (index >= 0) offerSlots.splice(index, 1);
      offerRuns.delete(tripId);
    }
  })();
  offerRuns.set(tripId, run);
  return run;
}

async function offerNextOnce(tripId: string) {
  const lock = await holdOfferLock(tripId);
  if (lock === null) return;
  try {
    await offerOneTrip(tripId);
  } finally {
    if (lock) await db().from("platform_settings").delete().eq("key", lock);
  }
}

async function offerOneTrip(tripId: string) {
  const settings = await loadDispatchSettings();
  const { data } = await db().from("trips").select("id,status,vehicle,captain_id,rider_id,pickup_lat,pickup_lng,distance_km,code,requested_at").eq("id", tripId).maybeSingle();
  const trip = data as Row | null;
  if (!trip || trip.status !== "searching" || trip.captain_id) return;
  const requested = Date.parse(String(trip.requested_at));
  const elapsed = Number.isFinite(requested) ? Math.max(0, (Date.now() - requested) / 1000) : 0;
  const now = new Date().toISOString();
  if (searchExpired(elapsed, settings)) {
    const closed = await db().from("trips").update({ status: "expired", cancel_reason: "No captain accepted in time", cancelled_at: now }).eq("id", tripId).eq("status", "searching").select("id");
    if (closed.data?.length) {
      await db().from("trip_offers").update({ status: "withdrawn", decided_at: now }).eq("trip_id", tripId).eq("status", "offered");
      await remember(tripId, "expired", "Search ended with no acceptance");
      void notify(String(trip.rider_id), "rider", "No captain was free", `${trip.code} ended. Please book again.`, { tripId, code: trip.code, kind: "ride_cancelled", eventId: searchExpiredKey(tripId) });
    }
    return;
  }
  const stale = await db().from("trip_offers").select("id,captain_id").eq("trip_id", tripId).eq("status", "offered").lt("expires_at", now);
  if ((stale.data ?? []).length) observe("offers_expired", { count: (stale.data ?? []).length });
  for (const offer of (stale.data ?? []) as Row[]) {
    const closed = await closeOffer(String(offer.id), "expired");
    if (closed) {
      const eventId = offerNoticeKey(String(offer.id), "expired");
      if (eventId) void notify(String(offer.captain_id), "captain", "Request expired", `${trip.code} moved to the next captain.`, { tripId, offerId: offer.id, kind: "offer_expired", eventId }, "offers");
    }
  }
  const open = await db().from("trip_offers").select("id").eq("trip_id", tripId).eq("status", "offered").gt("expires_at", now);
  if ((open.data?.length ?? 0) >= 1) return;
  const [past, busy, pending, presence] = await Promise.all([
    db().from("trip_offers").select("captain_id").eq("trip_id", tripId),
    db().from("trips").select("captain_id").in("status", ["assigned", "arrived", "on_trip"]).not("captain_id", "is", null),
    db().from("trip_offers").select("captain_id").eq("status", "offered").gt("expires_at", now),
    db().from("captain_presence").select("captain_id,latitude,longitude,updated_at,auto_accept").eq("online", true).eq("vehicle", trip.vehicle),
  ]);
  const skip = new Set(((past.data ?? []) as Row[]).map((row) => String(row.captain_id)));
  const busyIds = new Set(((busy.data ?? []) as Row[]).map((row) => String(row.captain_id)));
  const pendingIds = new Set(((pending.data ?? []) as Row[]).map((row) => String(row.captain_id)));
  const fresh = ((presence.data ?? []) as Row[]).filter((row) => !skip.has(String(row.captain_id)) && row.latitude != null && Date.parse(String(row.updated_at)) > Date.now() - settings.gpsFreshSeconds * 1000);
  if (!fresh.length) return;
  // Authoritative IST day fee: unpaid Captains cannot receive new offers (existing rides untouched).
  // Staging field test can waive the fee so online captains stay matchable without wallet credit.
  let feeEligible = fresh;
  if (!dayFeeWaived()) {
    let paidToday = await captainsPaidForIstDay(fresh.map((row) => String(row.captain_id)));
    for (const row of fresh) {
      const id = String(row.captain_id);
      if (paidToday.has(id)) continue;
      await renewOnlineDayFee(id, settings.gpsFreshSeconds);
    }
    paidToday = await captainsPaidForIstDay(fresh.map((row) => String(row.captain_id)));
    feeEligible = fresh.filter((row) => paidToday.has(String(row.captain_id)));
  }
  if (!feeEligible.length) return;
  const { data: captains } = await db().from("captains").select("user_id").in("user_id", feeEligible.map((row) => row.captain_id)).eq("status", "active");
  const active = new Set(((captains ?? []) as Row[]).map((row) => String(row.user_id)));
  const pickup = { lat: Number(trip.pickup_lat), lng: Number(trip.pickup_lng) };
  const radius = searchRadiusKm(elapsed, settings);
  const ranked = eligibleCaptains(
    feeEligible.map((row) => ({
      id: String(row.captain_id),
      vehicle: String(trip.vehicle),
      pickupKm: kmBetween(pickup, { lat: Number(row.latitude), lng: Number(row.longitude) }),
      approved: active.has(String(row.captain_id)),
      fresh: true,
      busy: busyIds.has(String(row.captain_id)),
      pending: pendingIds.has(String(row.captain_id)),
    })),
    String(trip.vehicle),
    radius,
    Number(trip.distance_km),
  );
  const first = ranked[0];
  const spot = first ? fresh.find((row) => String(row.captain_id) === first.id) : null;
  let skipped = 0;
  if (first && spot?.auto_accept) {
    if (await assignTrip(tripId, first.id)) {
      await db().from("trip_offers").insert({ trip_id: tripId, captain_id: first.id, status: "accepted", pickup_km: Math.round(first.pickupKm * 10) / 10, expires_at: now, decided_at: now });
      await tellRiderAssigned(tripId, first.id);
      return;
    }
    skipped = 1;
  }
  const offerTtl = dayFeeWaived() ? Math.max(settings.offerSeconds, 45) : settings.offerSeconds;
  const expires = new Date(Date.now() + offerTtl * 1000).toISOString();
  let placed = open.data?.length ?? 0;
  for (const captain of ranked.slice(skipped)) {
    if (placed >= 1) break;
    const inserted = await db().from("trip_offers").insert({ trip_id: tripId, captain_id: captain.id, status: "offered", pickup_km: Math.round(captain.pickupKm * 10) / 10, expires_at: expires }).select("id").maybeSingle();
    if (inserted.error?.code === "23505" || !inserted.data) continue;
    placed += 1;
    await remember(tripId, "offered", captain.id);
    const eventId = offerNoticeKey(String(inserted.data.id), "created");
    if (eventId) void notify(captain.id, "captain", "New ride request", `${trip.code} is waiting for ${offerTtl} seconds.`, { tripId, offerId: inserted.data.id, kind: "offer_created", eventId }, "offers");
  }
}

async function claimSweepLease() {
  const token = randomUUID();
  const now = new Date().toISOString();
  const value = leaseStamp(token, now);
  const inserted = await db().from("platform_settings").insert({ key: SWEEP_LEASE_KEY, value, updated_at: now });
  if (!inserted.error) return token;
  if (inserted.error.code !== "23505") return null;
  const existing = await db().from("platform_settings").select("updated_at").eq("key", SWEEP_LEASE_KEY).maybeSingle();
  if (!existing.data || !leaseExpired(String(existing.data.updated_at ?? ""), Date.now())) return null;
  const stolen = await db().from("platform_settings").update({ value, updated_at: now }).eq("key", SWEEP_LEASE_KEY).eq("updated_at", existing.data.updated_at).select("key");
  return stolen.data?.length ? token : null;
}

async function sweepStillOwns(token: string) {
  const row = await db().from("platform_settings").select("value").eq("key", SWEEP_LEASE_KEY).maybeSingle();
  return leaseOwned(row.data?.value ? String(row.data.value) : null, token);
}

export function sweepSearching() {
  if (sweepRunning) return sweepRunning;
  sweepRunning = (async () => {
    const started = Date.now();
    const token = await claimSweepLease();
    if (!token) {
      observe("sweep", { skipped: true, ms: Date.now() - started });
      return;
    }
    const { data } = await db().from("trips").select("id").eq("status", "searching").order("requested_at", { ascending: true }).limit(30);
    const rows = (data ?? []) as Row[];
    for (const trip of rows) {
      if (!(await sweepStillOwns(token))) break;
      await offerNext(String(trip.id)).catch(() => undefined);
    }
    const memory = process.memoryUsage();
    observe("sweep", { skipped: false, considered: rows.length, ms: Date.now() - started, heapMb: Math.round(memory.heapUsed / 1_048_576), rssMb: Math.round(memory.rss / 1_048_576) });
  })().finally(() => {
    sweepRunning = null;
  });
  return sweepRunning;
}

const sweepGlobal = globalThis as typeof globalThis & { __roveyaOfferSweep?: ReturnType<typeof setInterval> };
if (!sweepGlobal.__roveyaOfferSweep && process.env.NEXT_PHASE !== "phase-production-build") {
  sweepGlobal.__roveyaOfferSweep = setInterval(() => {
    void recoverQueuedNotices().catch(() => undefined);
    void sweepSearching().catch(() => undefined);
  }, 5_000);
  sweepGlobal.__roveyaOfferSweep.unref?.();
}

async function assignTrip(tripId: string, captainId: string) {
  if (!canTransition("searching", "assigned")) return false;
  const now = new Date().toISOString();
  const settings = await loadDispatchSettings();
  const presence = await db().from("captain_presence").select("online,updated_at").eq("captain_id", captainId).maybeSingle();
  const seen = Date.parse(String(presence.data?.updated_at ?? ""));
  if (!presence.data?.online || !Number.isFinite(seen) || seen <= Date.now() - settings.gpsFreshSeconds * 1000) return false;
  // Staging field test: do not renew/charge day fee or block assignment when waived.
  if (!dayFeeWaived()) {
    await renewOnlineDayFee(captainId, settings.gpsFreshSeconds);
    const paid = await captainsPaidForIstDay([captainId]);
    if (!paid.has(captainId)) return false;
  }
  const held = await db().from("trips").select("id").eq("captain_id", captainId).in("status", ["assigned", "arrived", "on_trip"]).neq("id", tripId).limit(1);
  if (held.data?.length) return false;
  const updated = await db().from("trips").update({ captain_id: captainId, status: "assigned", assigned_at: now }).eq("id", tripId).eq("status", "searching").is("captain_id", null).select("id,assigned_at").maybeSingle();
  if (updated.error || !updated.data) return false;
  const others = await db().from("trips").select("assigned_at").eq("captain_id", captainId).in("status", ["assigned", "arrived", "on_trip"]).neq("id", tripId);
  const otherTimes = ((others.data ?? []) as Row[]).map((row) => String(row.assigned_at ?? now));
  if (otherTimes.length && !assignmentWinner(String(updated.data.assigned_at ?? now), otherTimes)) {
    await db().from("trips").update({ status: "searching", captain_id: null, assigned_at: null }).eq("id", tripId).eq("captain_id", captainId).eq("status", "assigned");
    return false;
  }
  await db().from("trip_offers").update({ status: "withdrawn", decided_at: now }).eq("trip_id", tripId).eq("status", "offered");
  await remember(tripId, "assigned", captainId);
  return true;
}

export async function bookingKeyExists(riderId: string, requestedKey: string) {
  const trimmed = requestedKey.trim();
  if (!/^[A-Za-z0-9_.:-]{8,80}$/.test(trimmed)) return false;
  const { data, error } = await db().from("trips").select("id").eq("request_key", trimmed).eq("rider_id", riderId).maybeSingle();
  if (error) return false;
  return Boolean(data?.id);
}

const requestKeyOf = (requested: string, quoteId: string) => {
  const trimmed = requested.trim();
  if (!trimmed) return createHash("sha256").update(quoteId).digest("hex");
  if (!/^[A-Za-z0-9_.:-]{8,80}$/.test(trimmed)) throw new ApiError("The booking key is not valid. Use 8 to 80 letters, numbers, or . _ : -", 400);
  return trimmed;
};

async function savedBooking(riderId: string, requestKey: string, fingerprint: string): Promise<Booked | null> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data } = await db().from("trips").select("id,code,rider_id,fare_paise,distance_km,eta_min,request_fingerprint").eq("request_key", requestKey).maybeSingle();
    if (!data) return null;
    if (data.rider_id !== riderId || data.request_fingerprint !== fingerprint) throw new ApiError("This booking key was already used for a different ride.", 409);
    const secret = await db().from("trip_secrets").select("otp").eq("trip_id", data.id).maybeSingle();
    if (secret.data?.otp) {
      return { id: String(data.id), code: String(data.code), otp: String(secret.data.otp), fare: Number(data.fare_paise) / 100, distanceKm: Number(data.distance_km), etaMin: Number(data.eta_min) };
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return null;
}

export function bookRide(riderId: string, vehicle: CityVehicle, quoteId: string, payment: string, requestedKey = "") {
  const requestKey = requestKeyOf(requestedKey, quoteId);
  const running = bookingNow.get(requestKey);
  if (running) return running;
  const started = Date.now();
  const work = bookRideOnce(riderId, vehicle, quoteId, payment, requestKey).then(
    (result) => {
      observe("booking", { ms: Date.now() - started, outcome: "ok" });
      return result;
    },
    (error: unknown) => {
      observe("booking", { ms: Date.now() - started, outcome: "error", status: error instanceof ApiError ? error.status : 500 });
      throw error;
    },
  ).finally(() => bookingNow.delete(requestKey));
  bookingNow.set(requestKey, work);
  return work;
}

async function bookRideOnce(riderId: string, vehicle: CityVehicle, quoteId: string, payment: string, requestKey: string): Promise<Booked> {
  if (vehicle === "cab") throw new ApiError("ROVEYA Taxi is coming soon. Book a bike or an auto.", 400);
  const held = openQuote(quoteId);
  if (held.riderId !== riderId) throw new ApiError("This fare has expired. Check the price and book again.", 409);
  const price = vehicle === "bike" ? held.bike : held.auto;
  if (!bookingPaymentAllowed(payment)) throw new ApiError("Choose cash or UPI paid to the captain.", 400);
  const fingerprint = createHash("sha256").update(JSON.stringify({
    riderId,
    vehicle,
    payment,
    farePaise: price.farePaise,
    pickup: [held.pickup.name, held.pickup.latitude, held.pickup.longitude],
    drop: [held.drop.name, held.drop.latitude, held.drop.longitude],
  })).digest("hex");
  const prior = bookedQuotes.get(requestKey);
  if (prior?.riderId === riderId && prior.fingerprint === fingerprint) return prior.result;
  if (prior) throw new ApiError("This booking key was already used for a different ride.", 409);
  const inserted = await db()
    .from("trips")
    .insert({
      rider_id: riderId,
      vehicle,
      pickup_name: held.pickup.name,
      pickup_lat: held.pickup.latitude,
      pickup_lng: held.pickup.longitude,
      drop_name: held.drop.name,
      drop_lat: held.drop.latitude,
      drop_lng: held.drop.longitude,
      distance_km: price.km,
      eta_min: price.etaMin,
      fare_paise: price.farePaise,
      bonus_paise: 0,
      payment,
      payment_status: "due",
      status: "searching",
      route_source: price.source ?? "estimate",
      request_key: requestKey,
      request_fingerprint: fingerprint,
    })
    .select("id,code")
    .single();
  if (inserted.error?.code === "23505") {
    const saved = await savedBooking(riderId, requestKey, fingerprint);
    if (saved) return saved;
    throw new ApiError("You already have a ride in progress.", 409);
  }
  if (inserted.error?.code === "23514") throw new ApiError("That payment is not available yet. Choose cash.", 400);
  if (inserted.error || !inserted.data) {
    const timedOut = /abort|timeout|timed out/i.test(inserted.error?.message ?? "");
    const saved = await savedBooking(riderId, requestKey, fingerprint);
    if (saved) return saved;
    throw new ApiError(timedOut ? "The booking took too long. Retry with the same booking key." : "We could not book the ride. Try again.", timedOut ? 503 : 400);
  }
  const otp = String(randomInt(1000, 10000));
  const secretRow = await db().from("trip_secrets").insert({ trip_id: inserted.data.id, otp }).select("trip_id").single();
  if (secretRow.error) {
    const saved = await savedBooking(riderId, requestKey, fingerprint);
    if (saved) return saved;
    await db().from("trips").delete().eq("id", inserted.data.id).eq("request_key", requestKey);
    throw new ApiError("We could not book the ride. Try again.", 400);
  }
  const result = { id: String(inserted.data.id), code: String(inserted.data.code), otp, fare: price.farePaise / 100, distanceKm: price.km, etaMin: price.etaMin };
  if (bookedQuotes.size > 500) bookedQuotes.delete(bookedQuotes.keys().next().value as string);
  bookedQuotes.set(requestKey, { riderId, fingerprint, result });
  void remember(result.id, "searching", vehicle);
  void offerNext(result.id);
  void kickConsumers();
  return result;
}

const place = (row: Row, which: "pickup" | "drop") => ({
  name: String(row[`${which}_name`]),
  latitude: Number(row[`${which}_lat`]),
  longitude: Number(row[`${which}_lng`]),
});

export async function rideForPassenger(riderId: string, tripId: string) {
  const { data } = await db().from("trips").select("*").eq("id", tripId).eq("rider_id", riderId).maybeSingle();
  if (!data) throw new ApiError("Ride not found.", 404);
  const trip = data as Row;
  if (trip.status === "searching") void offerNext(tripId);
  const secretRow = await db().from("trip_secrets").select("otp").eq("trip_id", tripId).maybeSingle();
  const offered = trip.status === "searching" ? await db().from("trip_offers").select("id").eq("trip_id", tripId).eq("status", "offered").gt("expires_at", new Date().toISOString()).limit(1) : { data: [] };
  let captain: Row | null = null;
  let location: { latitude: number; longitude: number; heading: number; updatedAt: string | null } | null = null;
  if (trip.captain_id) {
    const [{ data: person }, { data: spot }] = await Promise.all([
      db().from("captains").select("name,rating,vehicle_no,vehicle_model").eq("user_id", trip.captain_id).maybeSingle(),
      db().from("captain_presence").select("latitude,longitude,heading,updated_at").eq("captain_id", trip.captain_id).maybeSingle(),
    ]);
    captain = person as Row | null;
    if (spot?.latitude != null) {
      location = {
        latitude: Number(spot.latitude),
        longitude: Number(spot.longitude),
        heading: Number(spot.heading ?? 0),
        updatedAt: spot.updated_at ? String(spot.updated_at) : null,
      };
    }
  }
  const here = location ? { lat: location.latitude, lng: location.longitude } : null;
  const pickup = { lat: Number(trip.pickup_lat), lng: Number(trip.pickup_lng) };
  const drop = { lat: Number(trip.drop_lat), lng: Number(trip.drop_lng) };
  return {
    status: trip.status,
    phase: bookingPhase({ status: String(trip.status), cancelledBy: trip.cancelled_by ? String(trip.cancelled_by) : null, paymentStatus: trip.payment_status ? String(trip.payment_status) : null, offered: Boolean(offered.data?.length) }),
    otp: (secretRow.data?.otp as string | undefined) ?? null,
    cancelledBy: trip.cancelled_by,
    nearPickup: Boolean(here && nearPickup(here, pickup)),
    offRoute: Boolean(here && trip.status === "on_trip" && offRoute(here, pickup, drop)),
    captainUserId: trip.captain_id ? String(trip.captain_id) : null,
    captain: captain
      ? { name: captain.name, rating: Number(captain.rating ?? 5), trips: 0, vehicleNo: captain.vehicle_no, vehicleName: captain.vehicle_model, location }
      : null,
  };
}

export async function cancelRide(riderId: string, tripId: string, reason: string) {
  const note = reason.slice(0, 160);
  const rpc = await db().rpc("cancel_city_ride", { p_trip: tripId, p_rider: riderId, p_reason: note });
  const missing = Boolean(rpc.error && /could not find|schema cache|PGRST202|42883|does not exist/i.test(rpc.error.message));
  if (!missing) {
    if (rpc.error || !rpc.data) throw new ApiError("This ride has started. It finishes at the drop.", 409);
    await remember(tripId, "customer_cancelled", note);
    await tellCaptainRiderCancelled(tripId);
    return { ok: true };
  }
  const { data } = await db().from("trips").select("id,status").eq("id", tripId).eq("rider_id", riderId).maybeSingle();
  if (!data) throw new ApiError("Ride not found.", 404);
  if (!canTransition(String(data.status), "cancelled")) throw new ApiError("This ride has started. It finishes at the drop.", 409);
  const now = new Date().toISOString();
  const closed = await db().from("trips").update({ status: "cancelled", cancelled_by: "rider", cancel_reason: note, cancelled_at: now }).eq("id", tripId).in("status", ["searching", "assigned", "arrived"]).select("id");
  if (!closed.data?.length) throw new ApiError("This ride has started. It finishes at the drop.", 409);
  await db().from("trip_offers").update({ status: "withdrawn", decided_at: now }).eq("trip_id", tripId).eq("status", "offered");
  await remember(tripId, "customer_cancelled", note);
  await tellCaptainRiderCancelled(tripId);
  return { ok: true };
}

async function tellCaptainRiderCancelled(tripId: string) {
  const trip = await db().from("trips").select("captain_id,code,status").eq("id", tripId).maybeSingle();
  if (trip.data?.status !== "cancelled" || !trip.data.captain_id) return;
  void notify(String(trip.data.captain_id), "captain", `Ride ${trip.data.code} was cancelled`, "Stay on duty for the next request.", { tripId, code: trip.data.code, kind: "ride_cancelled", eventId: riderCancelledKey(tripId, String(trip.data.captain_id)) }, "offers");
}

export async function nearby(vehicle: string, lat: number, lng: number) {
  if (vehicle !== "bike" && vehicle !== "auto") return { captains: [] };
  const { data } = await db().from("captain_presence").select("latitude,longitude,heading,updated_at").eq("online", true).eq("vehicle", vehicle).limit(40);
  const captains = ((data ?? []) as Row[])
    .filter((row) => row.latitude != null && Date.parse(String(row.updated_at)) > Date.now() - FRESH_MS)
    .map((row) => ({ latitude: Number(row.latitude), longitude: Number(row.longitude), heading: Number(row.heading ?? 0) }))
    .filter((row) => kmBetween({ lat, lng }, { lat: row.latitude, lng: row.longitude }) < 8);
  return { captains };
}

async function ridePlan(): Promise<RidePlan> {
  const { data } = await db().from("platform_settings").select("key,value").in("key", ["ride_plan_mode", "ride_bike_day", "ride_bike_month", "ride_auto_day", "ride_auto_month", "ride_commission_pct", "ride_bike_passenger_fee", "ride_auto_passenger_fee"]);
  const raw: Partial<RidePlan> = {};
  for (const row of (data ?? []) as Row[]) {
    const key = String(row.key);
    const value = String(row.value);
    if (key === "ride_plan_mode") raw.mode = value === "commission" ? "commission" : "subscription";
    if (key === "ride_bike_day") raw.bikeDay = Number(value);
    if (key === "ride_bike_month") raw.bikeMonth = Number(value);
    if (key === "ride_auto_day") raw.autoDay = Number(value);
    if (key === "ride_auto_month") raw.autoMonth = Number(value);
    if (key === "ride_commission_pct") raw.commissionPct = Number(value);
    if (key === "ride_bike_passenger_fee") raw.bikePassengerFee = Number(value);
    if (key === "ride_auto_passenger_fee") raw.autoPassengerFee = Number(value);
  }
  return normalizeRidePlan({ ...DEFAULT_RIDE_PLAN, ...raw });
}

// One database function inserts the day marker and the ledger line together.
// A missing function fails the request. It does not fall back to two separate writes.
async function chargeActiveDay(captainId: string, vehicle: string) {
  if (vehicle !== "bike" && vehicle !== "auto") return null;
  const charged = await db().rpc("charge_active_day", { p_captain: captainId, p_vehicle: vehicle });
  if (charged.error) throw new ApiError("The daily fee could not be charged. Try again.", 402);
  return dayFeeFromRpc(charged.data);
}

async function recordRideSettlement(trip: Row) {
  const key = `ride_settlement_${trip.id}`;
  const { data: existing } = await db().from("platform_settings").select("value").eq("key", key).maybeSingle();
  if (existing?.value) return JSON.parse(String(existing.value));
  const vehicle = trip.vehicle === "auto" ? "auto" : "bike";
  const amountPaise = Math.round(Number(trip.fare_paise) || 0);
  const bill = rideBill(vehicle, amountPaise / 100, await ridePlan());
  const method = trip.payment === "upi" || trip.payment === "online" ? String(trip.payment) : "cash";
  const settlement = {
    transactionId: randomUUID(),
    method,
    amountPaise,
    platformFeePaise: bill.commission * 100,
    captainPaise: bill.captainReceives * 100,
    at: new Date().toISOString(),
  };
  await db().from("platform_settings").insert({ key, value: JSON.stringify(settlement), updated_at: settlement.at });
  return settlement;
}

export async function startRidePayment(riderId: string, tripId: string, origin: string) {
  const { data } = await db().from("trips").select("id,rider_id,code,payment,fare_paise,status").eq("id", tripId).maybeSingle();
  if (!data || data.rider_id !== riderId) throw new ApiError("Ride not found.", 404);
  if (data.payment !== "online") throw new ApiError("This ride is paid to the captain in cash or by UPI.", 400);
  if (data.status !== "completed") throw new ApiError("Pay after the captain finishes the ride.", 409);
  const amount = Math.round(Number(data.fare_paise) || 0);
  if (amount < 100) throw new ApiError("This ride has no amount to pay.", 400);
  const opened = await beginGatewayAttempt({ ownerId: riderId, purpose: "ride_fare", refId: tripId, receipt: String(data.code ?? tripId) });
  if (opened.status === "paid") return { status: "paid" };
  return { status: "payment_required", payment: { intentId: opened.intentId, checkoutUrl: `${origin}/pay/${opened.intentId}` } };
}

function istBusinessDay(at = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

function dayFeePaise(vehicle: string) {
  return vehicle === "auto" ? 1200 : vehicle === "bike" ? 1000 : 0;
}

/** Staging field-test only: skip prepaid day-fee for go-online / matching when explicitly enabled. */
export function dayFeeWaived(env?: { ROVEYA_SKIP_DAY_FEE?: string; NEXT_PUBLIC_SUPABASE_URL?: string }) {
  const flag = env?.ROVEYA_SKIP_DAY_FEE ?? process.env.ROVEYA_SKIP_DAY_FEE;
  const url = env?.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  return flag === "staging" && url === "https://pqnfipleuztivnrsyvkd.supabase.co";
}

/**
 * Live accept_city_offer SQL still calls captain_paid_active_day.
 * Write a charged marker with no wallet debit so SQL accept can succeed under the staging waive.
 * amountPaise must be > 0 (active_day_marker_is_charged rejects 0).
 */
async function ensureStagingDayFeeMarker(captainId: string, vehicle: string) {
  const day = istBusinessDay();
  const key = `active_day_${captainId}_${day}`;
  const existing = await db().from("platform_settings").select("value").eq("key", key).maybeSingle();
  if (existing.data?.value) {
    try {
      const parsed = JSON.parse(String(existing.data.value)) as { status?: string; amountPaise?: number };
      if (parsed.status === "charged" && (parsed.amountPaise == null || Number(parsed.amountPaise) > 0)) return;
    } catch {
      /* rewrite invalid marker below */
    }
  }
  const fee = dayFeePaise(vehicle) || 1000;
  const value = JSON.stringify({
    transactionId: key,
    day,
    vehicle,
    amountPaise: fee,
    status: "charged",
    source: "staging_waive",
  });
  const now = new Date().toISOString();
  if (existing.data) {
    await db().from("platform_settings").update({ value, updated_at: now }).eq("key", key);
  } else {
    await db().from("platform_settings").insert({ key, value, updated_at: now });
  }
  observe("duty_day_fee_marker_waived", { vehicle, day });
}

function insufficientDutyError(balancePaise: number, feePaise: number, day: string) {
  const need = Math.max(0, feePaise - Math.max(0, balancePaise));
  throw new ApiError("Insufficient wallet balance. Recharge your wallet to go online.", 402, undefined, {
    code: "insufficient_wallet_balance",
    balancePaise,
    feePaise,
    requiredPaise: need,
    feePaidToday: false,
    day,
    rechargeAvailable: false,
  });
}

export async function setDuty(captainId: string, online: boolean, spot?: { latitude?: number; longitude?: number; heading?: number; autoAccept?: boolean }) {
  const { data: captain } = await db().from("captains").select("vehicle,status").eq("user_id", captainId).maybeSingle();
  if (!captain) throw new ApiError("Finish registration before going on duty.", 409);
  if (captain.status !== "active") throw new ApiError("The desk is still checking this account.", 409);
  const vehicle = String(captain.vehicle);

  if (!online) {
    const now = new Date().toISOString();
    const { error } = await db().from("captain_presence").upsert(
      { captain_id: captainId, online: false, vehicle, latitude: null, longitude: null, heading: 0, auto_accept: Boolean(spot?.autoAccept), updated_at: now },
      { onConflict: "captain_id" },
    );
    if (error) throw new ApiError("Duty could not be updated.", 400);
    return { ok: true, dayCharge: null, feePaidToday: undefined as boolean | undefined };
  }

  const lat = spot?.latitude;
  const lng = spot?.longitude;
  const spotOk = lat != null && lng != null && locationFixBelievable(null, { latitude: lat, longitude: lng });
  if (!spotOk) throw new ApiError("Turn on location to go on duty.", 400);

  // Staging field test: go online without charging the ₹10/₹12 day fee.
  if (dayFeeWaived()) {
    const now = new Date().toISOString();
    await ensureStagingDayFeeMarker(captainId, vehicle);
    const { error } = await db().from("captain_presence").upsert(
      {
        captain_id: captainId,
        online: true,
        vehicle,
        latitude: lat,
        longitude: lng,
        heading: spot?.heading ?? 0,
        auto_accept: Boolean(spot?.autoAccept),
        online_since: now,
        updated_at: now,
      },
      { onConflict: "captain_id" },
    );
    if (error) throw new ApiError("Duty could not be updated.", 400);
    observe("duty_day_fee_waived", { vehicle });
    return {
      ok: true,
      dayCharge: null,
      feePaidToday: true,
      balancePaise: 0,
      feePaise: 0,
      rechargeAvailable: false,
      dayFeeWaived: true,
    };
  }

  // Fail-closed: duty activation requires the atomic prepaid RPC. No non-atomic fallback.
  const atomic = await db().rpc("go_online_with_day_fee", {
    p_captain: captainId,
    p_lat: lat,
    p_lng: lng,
    p_heading: spot?.heading ?? 0,
    p_auto_accept: Boolean(spot?.autoAccept),
  });
  const missing = Boolean(atomic.error && /could not find|schema cache|PGRST202|42883|does not exist/i.test(atomic.error.message));
  if (missing) {
    observe("duty_rpc_missing", { rpc: "go_online_with_day_fee" });
    throw new ApiError("Duty service is temporarily unavailable. Please try again shortly.", 503, undefined, {
      code: "duty_rpc_unavailable",
      rechargeAvailable: false,
    });
  }
  if (atomic.error) {
    const msg = atomic.error.message || "";
    const match = /insufficient_wallet_balance:(\d+):(\d+):(\d{4}-\d{2}-\d{2})/.exec(msg);
    if (match) insufficientDutyError(Number(match[1]), Number(match[2]), match[3]);
    if (/captain_not_active/i.test(msg)) throw new ApiError("The desk is still checking this account.", 409);
    if (/location_required/i.test(msg)) throw new ApiError("Turn on location to go on duty.", 400);
    if (/vehicle_not_supported/i.test(msg)) throw new ApiError("This vehicle cannot go on duty yet.", 400);
    throw new ApiError("Duty could not be updated.", 400);
  }
  const row = atomic.data as { dayCharge?: { amountPaise?: number; day?: string; transactionId?: string } | null; feePaidToday?: boolean; balancePaise?: number; feePaise?: number } | null;
  const charged = row?.dayCharge?.amountPaise != null ? dayFeeFromRpc({ transactionId: row.dayCharge.transactionId, day: row.dayCharge.day, amountPaise: row.dayCharge.amountPaise }) : null;
  return {
    ok: true,
    dayCharge: charged,
    feePaidToday: Boolean(row?.feePaidToday),
    balancePaise: row?.balancePaise,
    feePaise: row?.feePaise ?? dayFeePaise(vehicle),
    rechargeAvailable: false,
  };
}

async function captainsPaidForIstDay(captainIds: string[], day = istBusinessDay()) {
  if (!captainIds.length) return new Set<string>();
  const keys = captainIds.map((id) => `active_day_${id}_${day}`);
  const { data } = await db().from("platform_settings").select("key").in("key", keys);
  const paid = new Set<string>();
  for (const row of (data ?? []) as Row[]) {
    const key = String(row.key);
    if (!key.startsWith("active_day_") || !key.endsWith(`_${day}`)) continue;
    paid.add(key.slice("active_day_".length, -(day.length + 1)));
  }
  return paid;
}

async function renewOnlineDayFee(captainId: string, staleSeconds: number) {
  const renewed = await db().rpc("renew_online_day_fee", { p_captain: captainId, p_stale_seconds: staleSeconds });
  const missing = Boolean(renewed.error && /could not find|schema cache|PGRST202|42883|does not exist/i.test(renewed.error.message));
  if (missing) {
    observe("renewal_rpc_missing", { rpc: "renew_online_day_fee" });
    return null;
  }
  if (renewed.error) {
    observe("renewal_rpc_error", { code: renewed.error.code });
    return null;
  }
  return renewed.data as {
    ok?: boolean;
    eligibleForNewRides?: boolean;
    wentOffline?: boolean;
    reason?: string;
    balancePaise?: number;
    feePaise?: number;
    day?: string;
  } | null;
}

export async function moveCaptain(captainId: string, spot: { latitude: number; longitude: number; heading?: number }) {
  const { data } = await db().from("captain_presence").select("latitude,longitude,updated_at,online").eq("captain_id", captainId).maybeSingle();
  const previous = data?.latitude == null ? null : { latitude: Number(data.latitude), longitude: Number(data.longitude), updatedAt: data.updated_at ? String(data.updated_at) : null };
  if (!locationFixBelievable(previous, spot)) return { ok: true, ignored: true };
  const moved = data?.latitude == null || kmBetween({ lat: Number(data.latitude), lng: Number(data.longitude) }, { lat: spot.latitude, lng: spot.longitude }) >= 0.03;
  const stale = !data?.updated_at || Date.now() - Date.parse(String(data.updated_at)) >= 15_000;
  if (!moved && !stale) return { ok: true };
  await db().from("captain_presence").update({ latitude: spot.latitude, longitude: spot.longitude, heading: spot.heading ?? 0, updated_at: new Date().toISOString() }).eq("captain_id", captainId);
  // Staging field test: skip renewal — unpaid captains must stay online for accept.
  if (data?.online && !dayFeeWaived()) {
    const settings = await loadDispatchSettings();
    const renewal = await renewOnlineDayFee(captainId, settings.gpsFreshSeconds);
    if (renewal && renewal.ok === false && renewal.reason === "insufficient_wallet_balance") {
      observe("renewal_insufficient", { day: renewal.day ?? "" });
    }
  }
  void sweepSearching();
  return { ok: true };
}

async function offerCard(offer: Row, trip: Row) {
  const { data: rider } = await db().from("riders").select("name").eq("user_id", trip.rider_id).maybeSingle();
  const fare = Number(trip.fare_paise) / 100;
  return {
    id: offer.id,
    tripId: trip.id,
    code: trip.code,
    vehicle: trip.vehicle,
    pickup: place(trip, "pickup"),
    drop: place(trip, "drop"),
    pickupKm: Number(offer.pickup_km ?? 0),
    pickupMin: Math.max(1, Math.round(Number(offer.pickup_km ?? 1) * 3)),
    tripKm: Number(trip.distance_km),
    tripMin: Number(trip.eta_min),
    fare,
    collect: fare,
    bonus: 0,
    payment: trip.payment === "upi" || trip.payment === "online" ? trip.payment : "cash",
    seconds: Math.max(1, Math.ceil((Date.parse(String(offer.expires_at)) - Date.now()) / 1000)),
    passenger: { name: rider?.name && rider.name !== "ROVEYA rider" ? rider.name : "Passenger", rides: 0 },
  };
}

export async function currentOffer(captainId: string) {
  const { data } = await db().from("trip_offers").select("*").eq("captain_id", captainId).eq("status", "offered").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return { offer: null };
  if (Date.parse(String(data.expires_at)) <= Date.now()) {
    await closeOffer(String(data.id), "expired");
    await offerNext(String(data.trip_id));
    return { offer: null, expired: true };
  }
  const { data: trip } = await db().from("trips").select("*").eq("id", data.trip_id).maybeSingle();
  if (!trip || trip.status !== "searching") return { offer: null };
  return { offer: await offerCard(data as Row, trip as Row) };
}

async function tellRiderAssigned(tripId: string, captainId: string) {
  const trip = await db().from("trips").select("rider_id,code,captain_id,assignment_version").eq("id", tripId).maybeSingle();
  const version = Number(trip.data?.assignment_version);
  if (!trip.data || String(trip.data.captain_id) !== captainId || !Number.isInteger(version)) return;
  void notify(String(trip.data.rider_id), "rider", "Captain assigned", `${trip.data.code} has a captain.`, { tripId, code: trip.data.code, kind: "captain_assigned", eventId: captainAssignedKey(tripId, captainId, version) });
}

export async function acceptOffer(captainId: string, offerId: string) {
  const settings = await loadDispatchSettings();
  if (!dayFeeWaived()) {
    await renewOnlineDayFee(captainId, settings.gpsFreshSeconds);
    const paid = await captainsPaidForIstDay([captainId]);
    if (!paid.has(captainId)) {
      const now = new Date().toISOString();
      await db().from("trip_offers").update({ status: "withdrawn", decided_at: now }).eq("id", offerId).eq("captain_id", captainId).eq("status", "offered");
      throw new ApiError("Insufficient wallet balance. Recharge your wallet to go online.", 402, undefined, {
        code: "insufficient_wallet_balance",
        feePaidToday: false,
        rechargeAvailable: false,
      });
    }
  } else {
    // Staging waive: seed SQL day-fee marker + heal presence so accept_city_offer can succeed.
    const { data: captain } = await db().from("captains").select("vehicle").eq("user_id", captainId).maybeSingle();
    await ensureStagingDayFeeMarker(captainId, String(captain?.vehicle ?? "bike"));
    const now = new Date().toISOString();
    await db()
      .from("captain_presence")
      .update({ online: true, updated_at: now })
      .eq("captain_id", captainId);
  }
  const rpc = await db().rpc("accept_city_offer", { p_offer: offerId, p_captain: captainId });
  const missing = Boolean(rpc.error && /could not find|schema cache|PGRST202|42883|does not exist/i.test(rpc.error.message));
  if (!missing) {
    if (!rpc.error && rpc.data) {
      const offer = await db().from("trip_offers").select("trip_id").eq("id", offerId).maybeSingle();
      if (offer.data?.trip_id) {
        await remember(String(offer.data.trip_id), "assigned", captainId);
        await tellRiderAssigned(String(offer.data.trip_id), captainId);
      }
      return { ok: true };
    }
    // Staging waive: if SQL still returns false, fall through to TS assign instead of hard-failing.
    if (!dayFeeWaived()) throw new ApiError("This ride request is no longer available.", 409);
    observe("accept_rpc_false_waived_fallback", {});
  }
  const { data } = await db().from("trip_offers").select("*").eq("id", offerId).maybeSingle();
  if (!data || data.captain_id !== captainId || data.status !== "offered" || Date.parse(String(data.expires_at)) <= Date.now()) {
    throw new ApiError("This ride request is no longer available.", 409);
  }
  const now = new Date().toISOString();
  const taken = await db().from("trip_offers").update({ status: "accepted", decided_at: now }).eq("id", offerId).eq("status", "offered").gt("expires_at", now).select("trip_id").maybeSingle();
  if (!taken.data) throw new ApiError("This ride request is no longer available.", 409);
  const assigned = await assignTrip(String(taken.data.trip_id), captainId);
  if (!assigned) {
    await db().from("trip_offers").update({ status: "withdrawn", decided_at: now }).eq("id", offerId).eq("status", "accepted");
    throw new ApiError("This ride request is no longer available.", 409);
  }
  await tellRiderAssigned(String(taken.data.trip_id), captainId);
  return { ok: true };
}

export async function rejectOffer(captainId: string, offerId: string, reason?: string) {
  const { data } = await db().from("trip_offers").select("id,trip_id").eq("id", offerId).eq("captain_id", captainId).eq("status", "offered").maybeSingle();
  if (!data) return { ok: true };
  await closeOffer(String(data.id), reason === "Missed" ? "expired" : "rejected");
  await remember(String(data.trip_id), reason === "Missed" ? "expired" : "rejected", captainId);
  await offerNext(String(data.trip_id));
  return { ok: true };
}

async function tripCard(trip: Row) {
  const { data: rider } = await db().from("riders").select("name").eq("user_id", trip.rider_id).maybeSingle();
  const fare = Number(trip.fare_paise) / 100;
  return {
    id: trip.id,
    code: trip.code,
    vehicle: trip.vehicle,
    status: trip.status,
    pickup: place(trip, "pickup"),
    drop: place(trip, "drop"),
    distanceKm: Number(trip.distance_km),
    etaMin: Number(trip.eta_min),
    fare,
    collect: fare,
    bonus: 0,
    payment: trip.payment === "upi" || trip.payment === "online" ? trip.payment : "cash",
    passenger: { name: rider?.name && rider.name !== "ROVEYA rider" ? rider.name : "Passenger" },
  };
}

export async function currentCaptainTrip(captainId: string, last?: string | null) {
  const { data } = await db().from("trips").select("*").eq("captain_id", captainId).in("status", ["assigned", "arrived", "on_trip"]).order("assigned_at", { ascending: false }).limit(1).maybeSingle();
  if (data) return { trip: await tripCard(data as Row) };
  if (!last) return { trip: null };
  const closed = await db().from("trips").select("status,cancel_reason,cancelled_by,captain_id").eq("id", last).maybeSingle();
  const reason = closed.data?.cancelled_by === "rider" ? "Passenger cancelled" : closed.data?.status === "cancelled" ? "The ride was cancelled" : closed.data?.status === "searching" && closed.data.cancel_reason ? "You released this ride. It is being offered to the next captain." : undefined;
  return { trip: null, closed: reason ? { reason } : undefined };
}

export async function captainTripAction(captainId: string, tripId: string, action: string, body: { otp?: string; reason?: string; stars?: number; tags?: string[]; note?: string }) {
  const { data } = await db().from("trips").select("*").eq("id", tripId).eq("captain_id", captainId).maybeSingle();
  if (!data) throw new ApiError("Ride not found.", 404);
  const now = new Date().toISOString();
  if (action === "arrived") {
    if (!canTransition(String(data.status), "arrived")) return { ok: data.status === "arrived" };
    await db().from("trips").update({ status: "arrived", arrived_at: now }).eq("id", tripId).eq("status", "assigned");
    await remember(tripId, "arrived", captainId);
    const arrived = noticeCopy("captain_arrived", String(data.code ?? ""));
    void notify(String(data.rider_id), "rider", arrived.title, arrived.body, { tripId, kind: "captain_arrived", eventId: `city:${tripId}:arrived` });
    return { ok: true };
  }
  if (action === "start") {
    if (data.status === "on_trip") return { ok: true };
    if (!canTransition(String(data.status), "on_trip")) throw new ApiError("Reach the pickup before starting the ride.", 409);
    const secretRow = await db().from("trip_secrets").select("otp").eq("trip_id", tripId).maybeSingle();
    if (!secretRow.data || secretRow.data.otp !== body.otp) throw new ApiError("That OTP does not match. Ask the passenger again.", 400);
    const started = await db().from("trips").update({ status: "on_trip", started_at: now }).eq("id", tripId).eq("status", "arrived").select("id");
    if (!started.data?.length) throw new ApiError("Reach the pickup before starting the ride.", 409);
    await remember(tripId, "started", captainId);
    const startedNotice = noticeCopy("ride_started", String(data.code ?? ""));
    void notify(String(data.rider_id), "rider", startedNotice.title, startedNotice.body, { tripId, kind: "ride_started", eventId: `city:${tripId}:started` });
    return { ok: true };
  }
  if (action === "complete") {
    if (data.status === "completed") return { ok: true };
    if (!canTransition(String(data.status), "completed")) throw new ApiError("The ride is not ready to finish.", 409);
    const done = await db().from("trips").update({ status: "completed", completed_at: now }).eq("id", tripId).eq("status", "on_trip").select("id");
    if (done.data?.length) {
      await remember(tripId, "completed", captainId);
      void kickConsumers();
    }
    const settlement = await recordRideSettlement(data as Row);
    if (done.data?.length) {
      const completed = noticeCopy("ride_completed", String(data.code ?? ""));
      void notify(String(data.rider_id), "rider", completed.title, completed.body, { tripId, kind: "ride_completed", eventId: `city:${tripId}:completed` });
      const [{ data: rider }, { data: captainRow }] = await Promise.all([
        db().from("riders").select("name").eq("user_id", data.rider_id).maybeSingle(),
        data.captain_id ? db().from("captains").select("name").eq("user_id", data.captain_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const receipt = cityReceipt({
        tripId,
        code: String(data.code ?? tripId),
        passenger: rider?.name ? String(rider.name) : null,
        captain: captainRow?.name ? String(captainRow.name) : null,
        vehicle: String(data.vehicle ?? ""),
        pickup: String(data.pickup_name ?? ""),
        drop: String(data.drop_name ?? ""),
        farePaise: data.fare_paise == null ? null : Number(data.fare_paise),
        payment: String(data.payment ?? ""),
        paymentStatus: String(data.payment_status ?? ""),
        completedAt: now,
      });
      void rememberReceipt(receipt).then((stored) => dispatchCityReceiptEmail({ riderId: String(data.rider_id), receipt: stored }));
      const ready = noticeCopy("receipt_ready", receipt.receiptNo);
      void notify(String(data.rider_id), "rider", ready.title, ready.body, { tripId, kind: "receipt_ready", eventId: `city:${tripId}:receipt` });
    }
    return { ok: true, settlement };
  }
  if (action === "collect") {
    if (data.payment_status === "paid") return { ok: true };
    await db().from("trips").update({ payment_status: "paid" }).eq("id", tripId).eq("payment_status", "due");
    await remember(tripId, "paid", captainId);
    return { ok: true };
  }
  if (action === "cancel") {
    if (!canTransition(String(data.status), "searching")) throw new ApiError("This ride can no longer be cancelled.", 409);
    const released = await db()
      .from("trips")
      .update({ status: "searching", captain_id: null, assigned_at: null, cancel_reason: (body.reason ?? "Captain cancelled").slice(0, 160) })
      .eq("id", tripId)
      .eq("captain_id", captainId)
      .in("status", ["assigned", "arrived"])
      .select("rider_id,code,assignment_version");
    if (!released.data?.length) throw new ApiError("This ride can no longer be cancelled.", 409);
    await db().from("trip_offers").insert({ trip_id: tripId, captain_id: captainId, status: "rejected", pickup_km: 0, expires_at: now, decided_at: now });
    await remember(tripId, "captain_cancelled", body.reason ?? "Captain cancelled");
    const releasedVersion = Number(released.data[0].assignment_version);
    if (Number.isInteger(releasedVersion)) void notify(String(released.data[0].rider_id), "rider", "Looking for another captain", `${released.data[0].code} is being offered again.`, { tripId, code: released.data[0].code, kind: "ride_cancelled", eventId: captainReleasedKey(tripId, captainId, releasedVersion) });
    await offerNext(tripId);
    return { ok: true, reassigned: true };
  }
  if (action === "rate") return saveRating(captainId, tripId, "captain", Number(body.stars), body.tags, body.note);
  throw new ApiError("That action is not available.", 400);
}

export async function registerCaptain(userId: string, phone: string, input: Record<string, string>) {
  const existing = await db().from("captains").select("*").eq("user_id", userId).maybeSingle();
  if (existing.data) return { captain: existing.data };
  const account = String(input.accountNumber ?? "");
  // Email OTP sign-in leaves riders.phone empty; captains.phone is still required (10-digit India mobile).
  // Prefer the signed-in rider phone; otherwise use the emergency/contact mobile from the join form.
  const mobile = digitsOf(phone) || digitsOf(String(input.emergencyPhone ?? ""));
  if (!/^[6-9]\d{9}$/.test(mobile)) {
    throw new ApiError("Add a valid 10-digit Indian mobile on the contact step, then submit again.", 400);
  }
  const plate = String(input.vehicleNo ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  const ifsc = String(input.ifsc ?? "").toUpperCase().trim();
  if (!/^[A-Z]{2} ?[0-9]{1,2} ?[A-Z]{0,3} ?[0-9]{3,4}$/.test(plate)) {
    throw new ApiError("Use a number plate like TS09 AB 2146.", 400);
  }
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
    throw new ApiError("Check the IFSC code. The 5th character must be 0 (example SBIN0001234).", 400);
  }
  if (!/^\d{9,18}$/.test(account) || !/^\d{4}$/.test(account.slice(-4))) {
    throw new ApiError("Check the bank account number and try again.", 400);
  }
  const row = {
    user_id: userId,
    captain_code: `R${randomInt(100000, 999999)}`,
    phone: mobile,
    name: String(input.name ?? "").trim(),
    dob: input.dob,
    gender: input.gender,
    email: input.email || null,
    city: input.city,
    vehicle: input.vehicle,
    vehicle_no: plate,
    vehicle_model: input.vehicleModel,
    vehicle_color: input.vehicleColor,
    vehicle_year: String(input.vehicleYear ?? ""),
    bank_holder: input.bankHolder,
    bank_last4: account.slice(-4),
    ifsc,
    upi: input.upi || null,
    emergency_name: input.emergencyName,
    emergency_phone: digitsOf(String(input.emergencyPhone ?? "")) || mobile,
    status: "review",
    service: "taxi",
    review_since: new Date().toISOString(),
  };
  const inserted = await db().from("captains").insert(row).select("*").single();
  if (inserted.error || !inserted.data) {
    const detail = String(inserted.error?.message ?? "");
    if (/captains_phone|phone.*unique|duplicate key.*phone/i.test(detail)) {
      throw new ApiError("That mobile is already registered on another captain account.", 400);
    }
    if (/vehicle_no|duplicate key.*vehicle/i.test(detail)) {
      throw new ApiError("That number plate is already registered.", 400);
    }
    if (/gender|check constraint/i.test(detail)) {
      throw new ApiError("Choose Male, Female, or Other for gender.", 400);
    }
    throw new ApiError("Registration could not be saved. Check the details and try again.", 400);
  }
  return { captain: inserted.data };
}

export async function captainMe(userId: string) {
  const { data } = await db().from("captains").select("*").eq("user_id", userId).maybeSingle();
  if (!data) throw new ApiError("Finish registration to continue.", 404);
  return { captain: data, documents: await captainDocuments(userId), verification: { status: data.status } };
}

export async function road(from: string, to: string) {
  const [flat, flng] = from.split(",").map(Number);
  const [tlat, tlng] = to.split(",").map(Number);
  if (![flat, flng, tlat, tlng].every(Number.isFinite)) throw new ApiError("That route could not be read.", 400);
  const url = `https://router.project-osrm.org/route/v1/driving/${flng},${flat};${tlng},${tlat}?overview=full&geometries=geojson`;
  const response = loadtestBlocks(url) ? null : await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  const data = (await response?.json().catch(() => null)) as { routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] } | null;
  const best = data?.routes?.[0];
  if (!best) return { coords: [[flat, flng], [tlat, tlng]], km: kmBetween({ lat: flat, lng: flng }, { lat: tlat, lng: tlng }) * 1.25, minutes: 1 };
  const step = Math.max(1, Math.floor(best.geometry.coordinates.length / 600));
  const coords = best.geometry.coordinates.filter((_, index, all) => index % step === 0 || index === all.length - 1).map(([lng, lat]) => [lat, lng] as [number, number]);
  return { coords, km: best.distance / 1000, minutes: Math.max(1, Math.round(best.duration / 60)) };
}

export async function passengerHistory(riderId: string) {
  const { data } = await db()
    .from("trips")
    .select("code,vehicle,status,pickup_name,drop_name,distance_km,fare_paise,payment,requested_at,completed_at")
    .eq("rider_id", riderId)
    .order("requested_at", { ascending: false })
    .limit(40);
  return {
    trips: ((data ?? []) as Row[]).map((row) => ({
      code: row.code,
      vehicle: row.vehicle,
      status: row.status,
      pickup: { name: row.pickup_name },
      drop: { name: row.drop_name },
      distanceKm: Number(row.distance_km),
      fare: Number(row.fare_paise) / 100,
      payment: row.payment,
      requestedAt: row.requested_at,
      completedAt: row.completed_at ?? null,
    })),
  };
}
