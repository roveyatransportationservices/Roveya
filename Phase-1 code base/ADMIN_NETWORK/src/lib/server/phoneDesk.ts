import { ApiError } from "./api";
import { canClaimPushToken } from "./pushClaim";
import type { Row } from "./data";
import { db } from "./db";

const DOC_BUCKET = "captain-documents";
const DOC_KINDS = ["dlFront", "dlBack", "rc", "aadhaar", "pan", "selfie"];

type Spot = { latitude: number; longitude: number };

const kmBetween = (a: Spot, b: Spot) => {
  const rad = (value: number) => (value * Math.PI) / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

export async function searchPlaces(query: string, near: Spot) {
  const q = query.trim().slice(0, 80);
  if (q.length < 3) return { places: [] };
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("countrycodes", "in");
  url.searchParams.set("limit", "8");
  url.searchParams.set("accept-language", "en");
  if (Number.isFinite(near.latitude) && Number.isFinite(near.longitude)) {
    url.searchParams.set("viewbox", `${near.longitude - 0.6},${near.latitude + 0.6},${near.longitude + 0.6},${near.latitude - 0.6}`);
  }
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "ROVEYA (roveyatransportationservices@gmail.com)" }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!response?.ok) return { places: [] };
  const rows = (await response.json()) as { place_id: number; name?: string; display_name: string; lat: string; lon: string }[];
  return {
    places: rows.map((row) => {
      const parts = row.display_name.split(",").map((part) => part.trim()).filter(Boolean);
      const name = row.name?.trim() || parts[0] || q;
      const rest = parts.filter((part) => part !== name && part !== "India");
      return { id: `osm-${row.place_id}`, name, subtitle: rest.slice(0, 3).join(", ") || "India", latitude: Number(row.lat), longitude: Number(row.lon) };
    }),
  };
}

export async function readPlace(id: string) {
  const placeId = id.replace(/^osm-/, "");
  const url = new URL("https://nominatim.openstreetmap.org/details");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("format", "json");
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "ROVEYA (roveyatransportationservices@gmail.com)" }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  const row = (await response?.json().catch(() => null)) as { localname?: string; centroid?: { coordinates?: [number, number] }; addresstags?: Record<string, string> } | null;
  const point = row?.centroid?.coordinates;
  if (!point) throw new ApiError("That place could not be found. Search again.", 404);
  const name = row?.localname || row?.addresstags?.suburb || "Pinned place";
  const subtitle = [row?.addresstags?.suburb, row?.addresstags?.city, row?.addresstags?.state].filter(Boolean).join(", ") || "India";
  return { place: { id, name, subtitle, latitude: point[1], longitude: point[0] } };
}

export async function captainsNearby(lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { captains: [] };
  const fresh = new Date(Date.now() - 120_000).toISOString();
  const { data } = await db().from("captain_presence").select("vehicle,latitude,longitude,heading,updated_at").eq("online", true).gte("updated_at", fresh).limit(80);
  const captains = ((data ?? []) as Row[])
    .filter((row) => row.latitude != null && (row.vehicle === "bike" || row.vehicle === "auto"))
    .map((row) => ({ vehicle: row.vehicle, latitude: Number(row.latitude), longitude: Number(row.longitude), heading: Number(row.heading ?? 0) }))
    .filter((row) => kmBetween({ latitude: lat, longitude: lng }, row) < 8);
  return { captains };
}

export async function listTickets(userId: string, app: string) {
  const { data } = await db().from("support_tickets").select("id,code,topic,status,trip_code,created_at").eq("user_id", userId).eq("app", app).order("created_at", { ascending: false }).limit(30);
  return {
    tickets: ((data ?? []) as Row[]).map((row) => ({ id: row.id, code: row.code, topic: row.topic, status: row.status, tripCode: row.trip_code ?? null, createdAt: row.created_at })),
  };
}

export async function createTicket(userId: string, app: string, topic: string, message: string, tripCode?: string) {
  const cleanTopic = topic.trim().slice(0, 80);
  const cleanMessage = message.trim().slice(0, 2000);
  if (cleanTopic.length < 2 || cleanMessage.length < 8) throw new ApiError("Add a subject and a short message.", 400);
  const inserted = await db()
    .from("support_tickets")
    .insert({ user_id: userId, app, topic: cleanTopic, status: "open", channel: "chat", priority: "normal", trip_code: tripCode ?? null })
    .select("id,code")
    .single();
  if (inserted.error || !inserted.data) throw new ApiError("The desk could not open this request. Try again.", 400);
  await db().from("support_messages").insert({ ticket_id: inserted.data.id, author: "user", body: cleanMessage, channel: "chat" });
  return { ticket: { code: inserted.data.code } };
}

async function ownTicket(userId: string, id: string) {
  const { data } = await db().from("support_tickets").select("id,status").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!data) throw new ApiError("That request was not found.", 404);
  return data as Row;
}

export async function ticketThread(userId: string, id: string) {
  const ticket = await ownTicket(userId, id);
  const [{ data: messages }, { data: feedback }] = await Promise.all([
    db().from("support_messages").select("id,author,body,channel,created_at").eq("ticket_id", id).order("id"),
    db().from("support_feedback").select("stars,note").eq("ticket_id", id).eq("user_id", userId).maybeSingle(),
  ]);
  return {
    messages: ((messages ?? []) as Row[])
      .filter((row) => row.channel !== "note")
      .map((row) => ({ id: row.id, from: row.author === "staff" || row.author === "desk" ? "desk" : "you", body: row.body, at: row.created_at })),
    feedback: feedback ? { stars: feedback.stars, note: feedback.note ?? null } : null,
    status: ticket.status,
  };
}

export async function replyTicket(userId: string, id: string, message: string) {
  const ticket = await ownTicket(userId, id);
  if (ticket.status === "closed" || ticket.status === "resolved") throw new ApiError("This request is closed. Open a new one if you need more help.", 409);
  const body = message.trim().slice(0, 1000);
  if (!body) throw new ApiError("Write a message first.", 400);
  await db().from("support_messages").insert({ ticket_id: id, author: "user", body, channel: "chat" });
  await db().from("support_tickets").update({ last_message_at: new Date().toISOString(), status: "open" }).eq("id", id);
  return ticketThread(userId, id);
}

export async function ticketFeedback(userId: string, id: string, stars: number, note?: string) {
  await ownTicket(userId, id);
  const score = Math.round(stars);
  if (score < 1 || score > 5) throw new ApiError("Choose 1 to 5 stars.", 400);
  await db().from("support_feedback").insert({ ticket_id: id, user_id: userId, stars: score, note: note?.slice(0, 500) ?? null, app: "rider" });
  return ticketThread(userId, id);
}

export async function saveRating(userId: string, tripId: string, role: "rider" | "captain", stars: number, tags?: string[], note?: string) {
  const column = role === "rider" ? "rider_id" : "captain_id";
  const { data } = await db().from("trips").select("id,status").eq("id", tripId).eq(column, userId).maybeSingle();
  if (!data) throw new ApiError("Ride not found.", 404);
  if (data.status !== "completed" && data.status !== "on_trip") throw new ApiError("You can rate this ride after it finishes.", 409);
  const score = Math.round(stars);
  if (score < 1 || score > 5) return { ok: true };
  const row = { trip_id: tripId, by_role: role, stars: score, tags: (tags ?? []).slice(0, 8), note: note?.slice(0, 500) ?? null };
  const existing = await db().from("trip_ratings").select("trip_id").eq("trip_id", tripId).eq("by_role", role).maybeSingle();
  const saved = existing.data ? await db().from("trip_ratings").update(row).eq("trip_id", tripId).eq("by_role", role) : await db().from("trip_ratings").insert(row);
  if (saved.error) throw new ApiError("The rating could not be saved.", 400);
  return { ok: true };
}

export async function captainEarnings(captainId: string) {
  const since = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: trips }, { data: wallet }, { data: ledger }] = await Promise.all([
    db().from("trips").select("code,status,vehicle,fare_paise,bonus_paise,payment,pickup_name,drop_name,distance_km,eta_min,completed_at,cancelled_at,cancel_reason").eq("captain_id", captainId).gte("requested_at", since).order("requested_at", { ascending: false }).limit(100),
    db().from("wallets").select("balance_paise").eq("owner_id", captainId).maybeSingle(),
    db().from("ledger_entries").select("id,kind,amount_paise,note,created_at").eq("owner_id", captainId).order("created_at", { ascending: false }).limit(40),
  ]);
  return {
    balance: Number(wallet?.balance_paise ?? 0) / 100,
    entries: ((ledger ?? []) as Row[]).map((row) => ({ id: row.id, kind: row.kind, amount: Number(row.amount_paise) / 100, note: row.note ?? null, at: row.created_at })),
    commissionPct: 0,
    trips: ((trips ?? []) as Row[]).map((row) => ({
      code: row.code,
      status: row.status,
      vehicle: row.vehicle,
      fare: Number(row.fare_paise) / 100,
      bonus: Number(row.bonus_paise ?? 0) / 100,
      commission: 0,
      payment: row.payment,
      pickup: row.pickup_name,
      drop: row.drop_name,
      distanceKm: Number(row.distance_km),
      minutes: Number(row.eta_min),
      at: row.completed_at || row.cancelled_at,
      reason: row.cancel_reason ?? null,
    })),
  };
}

export async function registerPush(userId: string, app: string, token: string, platform: string) {
  const stored = token.slice(0, 200);
  const current = await db().from("push_tokens").select("user_id").eq("token", stored).maybeSingle();
  if (!canClaimPushToken(current.data?.user_id ? String(current.data.user_id) : null, userId)) throw new ApiError("This phone is already registered to another account.", 409);
  const saved = await db().from("push_tokens").upsert({ user_id: userId, app, token: stored, platform: platform.slice(0, 20) }, { onConflict: "token" });
  if (saved.error) {
    const inserted = await db().from("push_tokens").insert({ user_id: userId, app, token: token.slice(0, 200), platform: platform.slice(0, 20) });
    if (inserted.error) throw new ApiError("This phone could not be registered for alerts.", 400);
  }
  return { ok: true };
}

export async function removePush(userId: string, token: string) {
  await db().from("push_tokens").delete().eq("token", token.slice(0, 200)).eq("user_id", userId);
  return { ok: true };
}

export async function prepareDocument(captainId: string, kind: string) {
  if (!DOC_KINDS.includes(kind)) throw new ApiError("That document is not one we ask for.", 400);
  const path = `${captainId}/${kind}.jpg`;
  const signed = await db().storage.from(DOC_BUCKET).createSignedUploadUrl(path);
  if (signed.error || !signed.data) throw new ApiError("Document storage is not ready. The desk can still take the photo.", 503);
  return { uploadUrl: signed.data.signedUrl, path: signed.data.path || path };
}

export async function confirmDocument(captainId: string, kind: string, path: string) {
  if (!DOC_KINDS.includes(kind) || !path.startsWith(`${captainId}/`)) throw new ApiError("That document could not be confirmed.", 400);
  const existing = await db().from("captain_documents").select("kind").eq("captain_id", captainId).eq("kind", kind).maybeSingle();
  const row = { captain_id: captainId, kind, status: "uploaded", storage_path: path, updated_at: new Date().toISOString() };
  const saved = existing.data ? await db().from("captain_documents").update(row).eq("captain_id", captainId).eq("kind", kind) : await db().from("captain_documents").insert(row);
  if (saved.error) throw new ApiError("The document could not be saved.", 400);
  return { ok: true };
}

export async function captainDocuments(captainId: string) {
  const { data } = await db().from("captain_documents").select("kind,status,review_note").eq("captain_id", captainId);
  return ((data ?? []) as Row[]).map((row) => ({ kind: row.kind, status: row.status === "verified" ? "verified" : row.status === "rejected" ? "rejected" : "uploaded", review_note: row.review_note ?? null }));
}

const payoutOpen = () => {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "long" }).format(new Date());
  return day === "Monday" || day === "Thursday";
};

export async function requestPayout(captainId: string, amount: number) {
  if (!payoutOpen()) throw new ApiError("Redeem opens on Monday and Thursday.", 409);
  const paise = Math.round(amount * 100);
  if (paise < 10000) throw new ApiError("The smallest redeem is ₹100.", 400);
  const { data: wallet } = await db().from("wallets").select("balance_paise").eq("owner_id", captainId).maybeSingle();
  if (!wallet || Number(wallet.balance_paise) < paise) throw new ApiError("Your wallet does not have that much. Cash from rides stays with you and is not in the wallet.", 402);
  const inserted = await db().from("payout_requests").insert({ captain_id: captainId, amount_paise: paise, status: "requested" }).select("id,amount_paise").single();
  if (inserted.error || !inserted.data) throw new ApiError("The redeem could not be started.", 400);
  const posted = await db().rpc("ledger_post", { p_owner: captainId, p_kind: "payout", p_amount: -paise, p_ref_type: "payout", p_ref_id: inserted.data.id, p_note: "Redeem to bank" });
  if (posted.error) {
    await db().from("payout_requests").delete().eq("id", inserted.data.id);
    throw new ApiError("The redeem could not be started.", 400);
  }
  return { ok: true };
}

function addCycle(start: Date, cycle: string) {
  const end = new Date(start);
  if (cycle === "daily") end.setUTCDate(end.getUTCDate() + 1);
  else if (cycle === "monthly") end.setUTCMonth(end.getUTCMonth() + 1);
  else end.setUTCDate(end.getUTCDate() + 7);
  return end;
}

const PLAN_KEY = (captainId: string) => `captain_plan_${captainId}`;

export async function saveSeatPlan(captainId: string, cycle: string) {
  const start = new Date();
  const plan = { cycle, pendingCycle: null, periodStart: start.toISOString(), periodEnd: addCycle(start, cycle).toISOString() };
  const { error } = await db().from("platform_settings").upsert({ key: PLAN_KEY(captainId), value: JSON.stringify(plan), updated_at: start.toISOString() });
  if (error) throw new ApiError("The payout day could not be saved.", 400);
  return { plan, message: "Payout day saved. The seat fare is queued for the bank at the end of this cycle." };
}

export async function seatPayoutPack(captainId: string) {
  const planRow = await db().from("platform_settings").select("value").eq("key", PLAN_KEY(captainId)).maybeSingle();
  let plan: { cycle?: string; periodStart?: string; periodEnd?: string; pendingCycle?: string | null } | null = null;
  try {
    plan = planRow.data?.value ? JSON.parse(String(planRow.data.value)) : null;
  } catch {
    plan = null;
  }
  const open = await db().from("payout_requests").select("id").eq("captain_id", captainId).eq("status", "requested").limit(1);
  const due = Boolean(plan?.periodEnd && Date.parse(plan.periodEnd) <= Date.now());
  if (due && !open.data?.length) {
    const { data: wallet } = await db().from("wallets").select("balance_paise").eq("owner_id", captainId).maybeSingle();
    const paise = Math.round(Number(wallet?.balance_paise) || 0);
    if (paise >= 10000) {
      const inserted = await db().from("payout_requests").insert({ captain_id: captainId, amount_paise: paise, status: "requested" }).select("id").single();
      if (inserted.data) {
        const posted = await db().rpc("ledger_post", { p_owner: captainId, p_kind: "payout", p_amount: -paise, p_ref_type: "payout", p_ref_id: inserted.data.id, p_note: "Carpool seat fare to bank" });
        if (posted.error) await db().from("payout_requests").delete().eq("id", inserted.data.id);
        else {
          const start = new Date();
          plan = { ...plan, periodStart: start.toISOString(), periodEnd: addCycle(start, String(plan?.cycle ?? "weekly")).toISOString() };
          await db().from("platform_settings").upsert({ key: PLAN_KEY(captainId), value: JSON.stringify(plan), updated_at: start.toISOString() });
        }
      }
    }
  }
  const { data } = await db().from("payout_requests").select("id,amount_paise,status,reference,created_at,decided_at").eq("captain_id", captainId).order("created_at", { ascending: false }).limit(20);
  const payouts = ((data ?? []) as Row[]).map((row) => ({
    id: String(row.id),
    amount: Number(row.amount_paise) / 100,
    status: row.status === "paid" || row.status === "rejected" ? row.status : "requested",
    reference: row.reference ? String(row.reference) : null,
    cycle: plan?.cycle ?? null,
    periodStart: plan?.periodStart ?? null,
    periodEnd: plan?.periodEnd ?? null,
    at: String(row.created_at),
    paidAt: row.decided_at ? String(row.decided_at) : null,
  }));
  return { plan, payouts };
}

const DAY_KEY = (userId: string) => `captain_day_${userId}`;

export async function readDayBook(userId: string) {
  const { data } = await db().from("platform_settings").select("value").eq("key", DAY_KEY(userId)).maybeSingle();
  if (!data?.value) return { dayBook: null };
  try {
    return { dayBook: JSON.parse(String(data.value)) };
  } catch {
    return { dayBook: null };
  }
}

export async function writeDayBook(userId: string, dayBook: unknown) {
  if (!dayBook || typeof dayBook !== "object") throw new ApiError("The day plan could not be read.", 400);
  const { error } = await db().from("platform_settings").upsert({ key: DAY_KEY(userId), value: JSON.stringify(dayBook).slice(0, 8000), updated_at: new Date().toISOString() });
  if (error) throw new ApiError("The day plan could not be saved.", 400);
  return { ok: true };
}
