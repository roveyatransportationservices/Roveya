import { createHash, randomInt } from "node:crypto";
import { z } from "zod";
import { ApiError, check } from "./api";
import { PLATFORM_WALLET, type Row } from "./data";
import { controls, db } from "./db";
import { pushAttempt } from "../delivery";
import { holdForCancellation, mayCallProvider, pushFromStored, stableEventId, stillRelevant, type SubjectSnapshot } from "../deliveryClaim";
import { advanceEvent, beginProvider, finishProvider, rememberEvent, skipClaimed, storePayload, strandedEvents } from "./deliveryStore";
import { loadtestBlocks } from "../loadtestGuard";
import { observe } from "./observe";
import { kickConsumers } from "./rides";

// Desk bookings price exactly like the passenger app: the fare card in platform_settings,
// road distance estimated from the straight line, and the peak-hour captain bonus.
const DEFAULT_RATES = { bike: { base: 12, perKm: 6, min: 25 }, auto: { base: 5, perKm: 10, min: 30 }, cab: { base: 60, perKm: 16, min: 90 } } as const;
const MINUTES_PER_KM = { bike: 1, auto: 1.4, cab: 1.8 } as const;
export type CityVehicle = keyof typeof DEFAULT_RATES;
export type Place = { name: string; latitude: number; longitude: number };

const straightKm = (a: Place, b: Place) => {
  const rad = (value: number) => (value * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};
const isPeak = (at = new Date()) => {
  const hour = new Date(at.getTime() + 330 * 60000).getUTCHours();
  return (hour >= 8 && hour < 11) || (hour >= 17 && hour < 21);
};

const FARE_KEYS = ["fare_bike_base", "fare_bike_per_km", "fare_bike_min", "fare_auto_base", "fare_auto_per_km", "fare_auto_min", "fare_cab_base", "fare_cab_per_km", "fare_cab_min", "peak_bonus_paise"];
let fareCache: { at: number; values: Map<string, number> } | null = null;
const routeFlights = new Map<string, Promise<number | null>>();

async function settings() {
  if (fareCache && Date.now() - fareCache.at < 5_000) return fareCache.values;
  const { data } = await db().from("platform_settings").select("key,value").in("key", FARE_KEYS);
  const values = new Map(((data ?? []) as Row[]).map((row) => [row.key as string, Number(row.value)]));
  fareCache = { at: Date.now(), values };
  return values;
}

async function loadDrivenKm(pickup: Place, drop: Place) {
  const url = `https://router.project-osrm.org/route/v1/driving/${pickup.longitude},${pickup.latitude};${drop.longitude},${drop.latitude}?overview=false`;
  if (loadtestBlocks(url)) return null;
  const response = await fetch(url, { headers: { "user-agent": "ROVEYA/1.0 (city fare)" }, signal: AbortSignal.timeout(3500) }).catch(() => null);
  if (!response?.ok) return null;
  const data = (await response.json().catch(() => null)) as { routes?: { distance?: number }[] } | null;
  const meters = data?.routes?.[0]?.distance;
  if (!Number.isFinite(meters) || !meters || meters < 100) return null;
  return meters / 1000;
}

async function drivenKm(pickup: Place, drop: Place) {
  const key = [pickup.latitude, pickup.longitude, drop.latitude, drop.longitude].map((value) => value.toFixed(4)).join(",");
  const existing = routeFlights.get(key);
  if (existing) return existing;
  const flight = loadDrivenKm(pickup, drop).finally(() => routeFlights.delete(key));
  routeFlights.set(key, flight);
  return flight;
}

function finishPrice(vehicle: CityVehicle, values: Map<string, number>, driven: number | null, pickup: Place, drop: Place) {
  const read = (key: string, fallback: number) => {
    const value = values.get(key);
    return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
  };
  const rate = DEFAULT_RATES[vehicle];
  const km = Math.max(1, Math.round((driven ?? straightKm(pickup, drop) * 1.25) * 100) / 100);
  if (km > 300) throw new ApiError("That drop is too far for a city ride. Book Carpool Travels instead.", 400);
  const rupees = Math.max(read(`fare_${vehicle}_min`, rate.min), Math.round(read(`fare_${vehicle}_base`, rate.base) + read(`fare_${vehicle}_per_km`, rate.perKm) * km));
  return {
    km,
    etaMin: Math.max(4, Math.round(km * MINUTES_PER_KM[vehicle] + 3)),
    farePaise: rupees * 100,
    bonusPaise: isPeak() ? read("peak_bonus_paise", 0) : 0,
    source: driven ? "road" as const : "estimate" as const,
  };
}

export async function priceRide(vehicle: CityVehicle, pickup: Place, drop: Place) {
  const [values, driven] = await Promise.all([settings(), drivenKm(pickup, drop)]);
  return finishPrice(vehicle, values, driven, pickup, drop);
}

export async function pricePair(pickup: Place, drop: Place) {
  const [values, driven] = await Promise.all([settings(), drivenKm(pickup, drop)]);
  return [finishPrice("bike", values, driven, pickup, drop), finishPrice("auto", values, driven, pickup, drop)] as const;
}

export async function riderByPhone(phone: string) {
  const { data } = await db().from("riders").select("user_id,name,phone,status").eq("phone", phone).maybeSingle();
  if (!data) throw new ApiError("No passenger has signed up with this number. Ask them to sign in to the ROVEYA app once, then book.", 404);
  if (data.status && data.status !== "active") throw new ApiError("This passenger's account is blocked.", 409);
  return data as Row;
}

// A city ride booked by the desk for a passenger. Offers go out to the nearest free captain.
export async function createCityRide(input: { vehicle: CityVehicle; phone: string; pickup: Place; drop: Place; payment: "cash" | "upi" | "online"; requestKey?: string }) {
  if (input.vehicle === "cab") throw new ApiError("ROVEYA Taxi is coming soon. Book a bike or an auto.", 400);
  const requestKey = input.requestKey?.trim() ?? "";
  if (requestKey && !/^[A-Za-z0-9_.:-]{8,80}$/.test(requestKey)) throw new ApiError("The booking key is not valid. Use 8 to 80 letters, numbers, or . _ : -", 400);
  const rider = await riderByPhone(input.phone);
  const price = await priceRide(input.vehicle, input.pickup, input.drop);
  const fingerprint = createHash("sha256").update(JSON.stringify({
    riderId: rider.user_id,
    vehicle: input.vehicle,
    payment: input.payment,
    farePaise: price.farePaise,
    pickup: [input.pickup.name, input.pickup.latitude, input.pickup.longitude],
    drop: [input.drop.name, input.drop.latitude, input.drop.longitude],
  })).digest("hex");
  if (requestKey) {
    const existing = await db().from("trips").select("*").eq("request_key", requestKey).maybeSingle();
    if (existing.data) {
      if (existing.data.rider_id !== rider.user_id || existing.data.request_fingerprint !== fingerprint) throw new ApiError("This booking key was already used for a different ride.", 409);
      return existing.data as Row;
    }
  }
  const inserted = await db()
    .from("trips")
    .insert({
      rider_id: rider.user_id,
      vehicle: input.vehicle,
      pickup_name: input.pickup.name,
      pickup_lat: input.pickup.latitude,
      pickup_lng: input.pickup.longitude,
      drop_name: input.drop.name,
      drop_lat: input.drop.latitude,
      drop_lng: input.drop.longitude,
      distance_km: price.km,
      eta_min: price.etaMin,
      fare_paise: price.farePaise,
      bonus_paise: price.bonusPaise,
      payment: input.payment,
      payment_status: "due",
      route_source: price.source ?? "estimate",
      ...(requestKey ? { request_key: requestKey, request_fingerprint: fingerprint } : {}),
    })
    .select("*")
    .single();
  if (inserted.error?.code === "23505" && requestKey) {
    const again = await db().from("trips").select("*").eq("request_key", requestKey).maybeSingle();
    if (again.data?.rider_id === rider.user_id && again.data.request_fingerprint === fingerprint) return again.data as Row;
  }
  if (inserted.error?.code === "23505") throw new ApiError("This passenger already has a ride in progress.", 409);
  const trip = check(inserted) as Row;
  check(await db().from("trip_secrets").insert({ trip_id: trip.id, otp: String(randomInt(1000, 10000)) }).select("trip_id").single());
  const { offerNext } = await import("./cityRides");
  void offerNext(String(trip.id));
  void notify(rider.user_id, "rider", `ROVEYA desk booked ${trip.code} for you`, `${input.vehicle === "bike" ? "Bike" : "Auto"} from ${input.pickup.name} to ${input.drop.name}. Open the app to follow your captain and see your ride code.`, { tripId: trip.id, code: trip.code, kind: "desk_booked", eventId: `city:${trip.id}:desk-booked` });
  void kickConsumers();
  return trip;
}

async function subjectCancelled(refType: string | undefined, refId: string) {
  if (!refType || !refId) return false;
  const table = refType === "trip" ? "trips" : refType === "booking" ? "seat_bookings" : "";
  if (!table) return false;
  const { data, error } = await db().from(table).select("status").eq("id", refId).maybeSingle();
  if (error) return null;
  return data?.status === "cancelled";
}

async function subjectSnapshot(refType: string | null, refId: string | null, offerId: string | null): Promise<SubjectSnapshot | null> {
  try {
    const subject: SubjectSnapshot = {};
    if (refType === "trip" && refId) {
      const { data, error } = await db().from("trips").select("status").eq("id", refId).maybeSingle();
      if (error) return null;
      subject.rideStatus = data?.status == null ? null : String(data.status);
    }
    if (refType === "booking" && refId) {
      const { data, error } = await db().from("seat_bookings").select("status,trip_id").eq("id", refId).maybeSingle();
      if (error) return null;
      subject.bookingStatus = data?.status == null ? null : String(data.status);
      if (data?.trip_id) {
        const trip = await db().from("seat_trips").select("status").eq("id", data.trip_id).maybeSingle();
        if (trip.error) return null;
        subject.rideStatus = trip.data?.status == null ? null : String(trip.data.status);
      }
    }
    if (!refType && refId) {
      const trip = await db().from("seat_trips").select("status").eq("id", refId).maybeSingle();
      if (!trip.error && trip.data?.status) subject.rideStatus = String(trip.data.status);
    }
    if (offerId) {
      const { data, error } = await db().from("trip_offers").select("status,expires_at,captain_id").eq("id", offerId).maybeSingle();
      if (error) return null;
      subject.offerStatus = data?.status == null ? null : String(data.status);
      const expires = Date.parse(String(data?.expires_at ?? ""));
      subject.offerExpiresAt = Number.isFinite(expires) ? expires : null;
      if (data?.captain_id) {
        const presence = await db().from("captain_presence").select("online").eq("captain_id", data.captain_id).maybeSingle();
        if (presence.error) return null;
        subject.captainOnline = presence.data?.online == null ? null : Boolean(presence.data.online);
      }
    }
    return subject;
  } catch {
    return null;
  }
}

async function sendPush(userId: string, app: "rider" | "captain", title: string, body: string, data: Record<string, unknown>, channel: "rides" | "offers", eventId: string) {
  const payload = { p_user: userId, p_app: app, p_kind: "trip", p_title: title, p_body: body, p_data: { ...data, eventId }, p_channel: channel };
  const raced = await Promise.race([
    db().rpc("push_send", payload).then(
      (result) => ({ outcome: "ok" as const, devices: Number((result as { data?: unknown }).data ?? 0) }),
      () => ({ outcome: "error" as const, devices: 0 }),
    ),
    new Promise<{ outcome: "timeout"; devices: number }>((resolve) => setTimeout(() => resolve({ outcome: "timeout", devices: 0 }), 2_000)),
  ]);
  return pushAttempt(raced.outcome, raced.devices);
}

// One provider call after the provider-start update commits. Unknown is not sent again.
async function openAndSend(eventId: string, kind: string, channel: "rides" | "offers", refType: string | undefined, refId: string, offerId: string | undefined, ownsInsert: boolean, send: () => Promise<{ status: string }>) {
  const now = Date.now();
  const advance = await advanceEvent(eventId, now, ownsInsert);
  if (advance !== "begin") return;
  if (!ownsInsert) {
    const subject = await subjectSnapshot(refType ?? null, refId, offerId ?? null);
    if (!stillRelevant(kind, channel, now, subject)) {
      await skipClaimed(eventId, subject ? "stale_subject" : "status_unreadable");
      return;
    }
  } else {
    const cancelled = await subjectCancelled(refType, refId);
    if (cancelled === null) return;
    if (holdForCancellation(kind, cancelled === true)) {
      await skipClaimed(eventId);
      return;
    }
  }
  let started = false;
  try {
    started = await beginProvider(eventId);
  } catch {
    started = false;
  }
  if (!mayCallProvider(started)) return;
  try {
    const attempt = await send();
    await finishProvider(eventId, attempt.status as "accepted" | "failed" | "unknown" | "skipped", attempt.status === "unknown" ? "timeout" : attempt.status === "failed" ? "provider_error" : undefined);
    if (attempt.status === "failed" || attempt.status === "unknown") observe("notify_unconfirmed", { status: attempt.status });
  } catch {
    await finishProvider(eventId, "unknown", "provider_error");
  }
}

// This pass runs only from notify. A quiet period does not visit queued rows.
// A later approved change may call the same pass from the existing consumer tick. Do not add a broker or a new cron job here.
let recovering = false;

async function recoverStranded() {
  const now = Date.now();
  let rows: Awaited<ReturnType<typeof strandedEvents>> = [];
  try {
    rows = await strandedEvents(now);
  } catch {
    return;
  }
  for (const row of rows) {
    const message = pushFromStored(row);
    if (!message) continue;
    const channel = row.channel === "offers" ? "offers" : "rides";
    await openAndSend(row.eventKey, row.kind, channel, row.refType ?? undefined, row.refId ?? "", row.offerId ?? undefined, false, () => sendPush(message.userId, message.app, message.title, message.body, { eventId: row.eventKey, kind: row.kind }, channel, row.eventKey));
  }
}

export async function notify(userId: string | null | undefined, app: "rider" | "captain", title: string, body: string, data: Record<string, unknown>, channel: "rides" | "offers" = "rides") {
  if (!userId) return;
  if (!recovering) {
    recovering = true;
    try {
      await recoverStranded();
    } finally {
      recovering = false;
    }
  }
  const eventId = stableEventId(data.eventId);
  if (!eventId) {
    observe("notify_unkeyed", { channel });
    return;
  }
  const kind = String(data.kind ?? "trip");
  const refType = data.tripId ? "trip" : data.bookingId ? "booking" : undefined;
  const refId = String(data.tripId ?? data.bookingId ?? "");
  const offerId = data.offerId ? String(data.offerId) : undefined;
  const gate = await rememberEvent({ eventKey: eventId, kind, channel, audience: app, refType, refId, status: "queued" });
  if (gate === "pending") return;
  await storePayload(eventId, { userId, title, body, offerId });
  await openAndSend(eventId, kind, channel, refType, refId, offerId, gate === "stored", () => sendPush(userId, app, title, body, data, channel, eventId));
}

// Money ever moved on a record means it can only be cancelled or refunded, never deleted.
export async function moneyMoved(refId: string) {
  const [{ count: ledger }, { count: payments }] = await Promise.all([
    db().from("ledger_entries").select("id", { count: "exact", head: true }).eq("ref_id", refId),
    db().from("payment_intents").select("id", { count: "exact", head: true }).eq("ref_id", refId),
  ]);
  return (ledger ?? 0) + (payments ?? 0) > 0;
}

// Everything the team did to one record, newest first.
export async function activity(entityId: string) {
  const { data } = await controls().from("audit_log").select("id,admin_email,action,detail,at").eq("entity_id", entityId).order("at", { ascending: false }).limit(50);
  return (data ?? []) as Row[];
}

type Stop = { id: string; name: string; landmark?: string; offsetMin?: number };

export const traveller = z.object({
  seatId: z.string().regex(/^[A-Z0-9]{1,4}$/, "Pick a seat for each traveller."),
  name: z.string().trim().min(2, "Enter each traveller's name.").max(60),
  age: z.number().int().min(1, "Check the traveller's age.").max(99),
  gender: z.enum(["Male", "Female"]),
});
export type DeskTraveller = z.infer<typeof traveller>;

const istTime = (at: Date) => new Date(at.getTime() + 330 * 60000).toISOString().slice(11, 16);
const stopAt = (stop: Stop, departAt: string) => ({ ...stop, time: istTime(new Date(Date.parse(departAt) + (stop.offsetMin ?? 0) * 60000)) });

export async function tripStops(tripId: string, boardingId: string, dropId: string) {
  const trip = check(await db().from("seat_trips").select("id,code,status,depart_at,boarding,drops").eq("id", tripId).maybeSingle(), "Trip not found.") as Row;
  const boarding = (trip.boarding as Stop[]).find((stop) => stop.id === boardingId);
  const drop = (trip.drops as Stop[]).find((stop) => stop.id === dropId);
  if (!boarding || !drop) throw new ApiError("Pick a boarding and drop point from the trip's list.", 400);
  return { trip, boarding: stopAt(boarding, trip.depart_at), drop: stopAt(drop, trip.depart_at) };
}

// Seats booked by the desk: held, then confirmed at once as paid in cash at the desk or from ROVEYA Cash.
export async function createSeatBooking(input: { tripId: string; phone: string; email?: string; travellers: DeskTraveller[]; boardingId: string; dropId: string; secured: boolean; payment: "desk_cash" | "wallet" }) {
  const rider = await riderByPhone(input.phone);
  const { trip, boarding, drop } = await tripStops(input.tripId, input.boardingId, input.dropId);
  const held = check(
    await db().rpc("seat_book", {
      p_rider: rider.user_id,
      p_trip: trip.id,
      p_travellers: input.travellers,
      p_boarding: boarding,
      p_drop: drop,
      p_phone: input.phone,
      p_email: input.email || null,
      p_secured: input.secured,
      p_coupon: null,
      p_discount: 0,
      p_use_cash: false,
    }),
  ) as unknown as Row;
  if (input.payment === "wallet") {
    const { data: wallet } = await db().from("wallets").select("balance_paise").eq("owner_id", rider.user_id).maybeSingle();
    if (!wallet || Number(wallet.balance_paise) < Number(held.total_paise)) {
      await releaseSeats(held.id);
      await db().from("seat_bookings").delete().eq("id", held.id);
      throw new ApiError("The passenger's ROVEYA Cash is too low for these seats. Take the payment at the desk instead.", 402);
    }
  }
  const confirmed = await db().rpc("seat_confirm", { p_booking: held.id, p_paid_with: input.payment === "wallet" ? "ROVEYA Cash" : "Desk · cash", p_from_wallet: input.payment === "wallet" });
  if (confirmed.error) {
    await releaseSeats(held.id);
    await db().from("seat_bookings").delete().eq("id", held.id);
    check(confirmed);
  }
  // Cash taken at the desk goes on ROVEYA's books, so a later refund to ROVEYA Cash balances.
  if (input.payment === "desk_cash" && Number(held.total_paise) > 0) {
    check(await db().rpc("ledger_post", { p_owner: PLATFORM_WALLET, p_kind: "seat_payment", p_amount: Number(held.total_paise), p_ref_type: "seat_booking", p_ref_id: held.id, p_note: `Cash at the desk for ${held.pnr}` }));
  }
  void kickConsumers();
  return { booking: confirmed.data as unknown as Row, trip };
}

// Frees seats still held for a booking that never got confirmed.
export async function releaseSeats(bookingId: string) {
  await db().from("seat_trip_seats").update({ state: "available", gender: null, booking_id: null, held_until: null }).eq("booking_id", bookingId).eq("state", "held");
}
