import "server-only";
import { randomUUID } from "crypto";
import { z } from "zod";
import type { StaffSession } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { db, dbError, kickConsumers, must, rupees } from "@/lib/platform/gateway";
import { audit } from "@/lib/platform/staff";

const PLATFORM = "00000000-0000-0000-0000-000000000001";
const OPEN = ["searching", "assigned", "arrived", "on_trip"];
const BUCKET = "captain-documents";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const staffRef = (staff: StaffSession) => (uuid.test(staff.id) ? staff.id : null);
const needle = (value: string) => value.replace(/[%_,()*]/g, " ").trim().slice(0, 60);
const recent = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000).toISOString();

function money<T extends Record<string, unknown>>(row: T, ...keys: (keyof T)[]) {
  const out: Record<string, unknown> = { ...row };
  for (const key of keys) out[String(key).replace(/_paise$/, "")] = rupees(Number(row[key] ?? 0));
  return out;
}

async function walletSummary(ownerId: string, limit = 30) {
  const client = db();
  const [{ data: wallet }, { data: entries }] = await Promise.all([
    client.from("wallets").select("owner_kind,balance_paise,updated_at").eq("owner_id", ownerId).maybeSingle(),
    client.from("ledger_entries").select("id,kind,amount_paise,note,ref_type,ref_id,created_at").eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(limit),
  ]);
  return {
    kind: wallet?.owner_kind ?? null,
    balance: rupees(Number(wallet?.balance_paise ?? 0)),
    entries: (entries ?? []).map((entry) => ({ ...entry, amount: rupees(Number(entry.amount_paise)) })),
  };
}

function tripLine(row: Record<string, unknown>) {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    vehicle: row.vehicle,
    pickup: row.pickup_name,
    drop: row.drop_name,
    distanceKm: Number(row.distance_km ?? 0),
    fare: rupees(Number(row.fare_paise ?? 0)),
    discount: rupees(Number(row.discount_paise ?? 0)),
    payable: rupees(Number(row.fare_paise ?? 0) - Number(row.discount_paise ?? 0)),
    bonus: rupees(Number(row.bonus_paise ?? 0)),
    payment: row.payment,
    paymentStatus: row.payment_status,
    cancelledBy: row.cancelled_by,
    cancelReason: row.cancel_reason,
    requestedAt: row.requested_at,
    completedAt: row.completed_at,
    rider: row.riders ?? null,
    captain: row.captains ?? null,
  };
}

// ---------------------------------------------------------------------------
// Live board
// ---------------------------------------------------------------------------

export async function liveBoard() {
  const client = db();
  const [presence, open] = await Promise.all([
    client
      .from("captain_presence")
      .select("captain_id,vehicle,latitude,longitude,heading,auto_accept,online_since,updated_at,captains(name,captain_code,phone,rating)")
      .eq("online", true)
      .gte("updated_at", recent(2))
      .order("updated_at", { ascending: false })
      .limit(500),
    client
      .from("trips")
      .select("id,code,status,vehicle,captain_id,pickup_name,drop_name,distance_km,fare_paise,discount_paise,bonus_paise,payment,payment_status,requested_at,completed_at,cancelled_by,cancel_reason,riders(name,phone),captains(name,captain_code,phone)")
      .in("status", OPEN)
      .order("requested_at", { ascending: true })
      .limit(300),
  ]);
  const busy = new Set((open.data ?? []).map((trip) => trip.captain_id).filter(Boolean));
  const captains = (presence.data ?? []).map((row) => ({ ...row, busy: busy.has(row.captain_id) }));
  const byVehicle = { bike: 0, auto: 0, cab: 0 } as Record<string, number>;
  for (const row of captains) byVehicle[row.vehicle] = (byVehicle[row.vehicle] ?? 0) + 1;
  return { onlineCaptains: captains, openTrips: (open.data ?? []).map(tripLine), online: byVehicle };
}

// ---------------------------------------------------------------------------
// Captains
// ---------------------------------------------------------------------------

export async function listCaptains(status: string | null, q: string) {
  const client = db();
  let query = client
    .from("captains")
    .select("user_id,captain_code,name,phone,city,vehicle,vehicle_no,vehicle_model,status,status_note,rating,created_at,approved_at,captain_documents(kind,status)")
    .order("created_at", { ascending: false })
    .limit(300);
  if (status) query = query.eq("status", status);
  const term = needle(q);
  if (term) query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%,captain_code.ilike.%${term}%,vehicle_no.ilike.%${term}%,city.ilike.%${term}%`);
  const [{ data }, { data: online }] = await Promise.all([query, client.from("captain_presence").select("captain_id").eq("online", true).gte("updated_at", recent(2))]);
  const live = new Set((online ?? []).map((row) => row.captain_id));
  return { captains: (data ?? []).map((row) => ({ ...row, online: live.has(row.user_id) })) };
}

export async function captainDetail(id: string) {
  const client = db();
  const { data: captain } = await client.from("captains").select("*").eq("user_id", id).maybeSingle();
  if (!captain) throw new AppError("Captain not found.", 404);
  const [docs, presence, wallet, trips, payouts, ratings, tickets] = await Promise.all([
    client.from("captain_documents").select("kind,status,storage_path,review_note,reviewed_at,updated_at").eq("captain_id", id),
    client.from("captain_presence").select("online,vehicle,latitude,longitude,auto_accept,online_since,updated_at").eq("captain_id", id).maybeSingle(),
    walletSummary(id),
    client.from("trips").select("*,riders(name,phone)").eq("captain_id", id).order("requested_at", { ascending: false }).limit(40),
    client.from("payout_requests").select("id,amount_paise,bank_last4,status,reference,created_at,decided_at").eq("captain_id", id).order("created_at", { ascending: false }).limit(20),
    client.from("trip_ratings").select("stars,tags,note,created_at,trips!inner(code,captain_id)").eq("by_role", "rider").eq("trips.captain_id", id).order("created_at", { ascending: false }).limit(20),
    client.from("support_tickets").select("id,code,topic,status,created_at").eq("user_id", id).eq("app", "captain").order("created_at", { ascending: false }).limit(20),
  ]);
  const documents = await Promise.all(
    (docs.data ?? []).map(async (doc) => {
      const signed = doc.storage_path ? await client.storage.from(BUCKET).createSignedUrl(doc.storage_path, 600) : null;
      return { ...doc, viewUrl: signed?.data?.signedUrl ?? null };
    }),
  );
  const tripRows = (trips.data ?? []).map(tripLine);
  const done = tripRows.filter((trip) => trip.status === "completed");
  return {
    captain,
    documents,
    presence: presence.data,
    wallet,
    stats: {
      completed: done.length,
      cancelled: tripRows.filter((trip) => trip.status === "cancelled" && trip.cancelledBy === "captain").length,
      earned: done.reduce((sum, trip) => sum + trip.fare + trip.bonus, 0),
    },
    trips: tripRows,
    payouts: (payouts.data ?? []).map((row) => money(row, "amount_paise")),
    ratings: ratings.data ?? [],
    tickets: tickets.data ?? [],
  };
}

export const captainDecisionSchema = z.object({
  action: z.enum(["approve", "suspend", "reinstate"]),
  note: z.string().trim().max(200).optional(),
});

export async function decideCaptain(staff: StaffSession, userId: string, input: z.infer<typeof captainDecisionSchema>) {
  const client = db();
  const { data: before } = await client.from("captains").select("status,status_note").eq("user_id", userId).maybeSingle();
  if (!before) throw new AppError("Captain not found.", 404);
  if (input.action === "approve") {
    const { data: docs } = await client.from("captain_documents").select("kind,status").eq("captain_id", userId);
    const have = new Map((docs ?? []).map((doc) => [doc.kind, doc.status]));
    const usable = (kind: string) => have.has(kind) && have.get(kind) !== "rejected";
    const missing = ["selfie", "dlFront", "dlBack", "rc"].filter((kind) => !usable(kind));
    if (!usable("aadhaar") && !usable("pan")) missing.push("aadhaar or pan");
    if (missing.length) throw new AppError(`Documents still needed: ${missing.join(", ")}.`, 409);
  }
  if (input.action === "suspend" && !input.note) throw new AppError("Add the reason the captain will see.", 400);
  const status = input.action === "suspend" ? "suspended" : "active";
  const updated = await client
    .from("captains")
    .update({ status, status_note: input.action === "suspend" ? input.note : null, ...(input.action === "approve" ? { approved_at: new Date().toISOString() } : null) })
    .eq("user_id", userId)
    .select("user_id,status,status_note")
    .single();
  const captain = must(updated);
  if (input.action === "approve") {
    await client.from("captain_documents").update({ status: "verified", reviewed_at: new Date().toISOString(), reviewed_by: staffRef(staff) }).eq("captain_id", userId).eq("status", "uploaded");
  }
  if (input.action === "suspend") await client.from("captain_presence").update({ online: false }).eq("captain_id", userId);
  await audit(staff, `captain.${input.action}`, "captain", userId, before, { status, note: input.note ?? null });
  return { captain };
}

export const documentReviewSchema = z.object({
  action: z.enum(["verify", "reject"]),
  note: z.string().trim().max(200).optional(),
});

export async function reviewDocument(staff: StaffSession, captainId: string, kind: string, input: z.infer<typeof documentReviewSchema>) {
  if (input.action === "reject" && !input.note) throw new AppError("Tell the captain what to fix.", 400);
  const { data, error } = await db()
    .from("captain_documents")
    .update({ status: input.action === "verify" ? "verified" : "rejected", review_note: input.action === "reject" ? input.note : null, reviewed_at: new Date().toISOString(), reviewed_by: staffRef(staff) })
    .eq("captain_id", captainId)
    .eq("kind", kind)
    .select("kind,status,review_note")
    .maybeSingle();
  const failure = dbError(error);
  if (failure) throw failure;
  if (!data) throw new AppError("That document has not been uploaded.", 404);
  await audit(staff, `document.${input.action}`, "captain_document", `${captainId}:${kind}`, null, data);
  return { document: data };
}

// ---------------------------------------------------------------------------
// Passengers
// ---------------------------------------------------------------------------

export async function listRiders(status: string | null, q: string) {
  let query = db().from("riders").select("user_id,phone,name,email,status,status_note,created_at").order("created_at", { ascending: false }).limit(300);
  if (status) query = query.eq("status", status);
  const term = needle(q);
  if (term) query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`);
  const { data } = await query;
  return { riders: data ?? [] };
}

export async function riderDetail(id: string) {
  const client = db();
  const { data: rider } = await client.from("riders").select("*").eq("user_id", id).maybeSingle();
  if (!rider) throw new AppError("Passenger not found.", 404);
  const [wallet, trips, tickets, coupons, payments] = await Promise.all([
    walletSummary(id),
    client.from("trips").select("*,captains(name,captain_code,phone)").eq("rider_id", id).order("requested_at", { ascending: false }).limit(40),
    client.from("support_tickets").select("id,code,topic,status,created_at").eq("user_id", id).eq("app", "rider").order("created_at", { ascending: false }).limit(20),
    client.from("coupon_redemptions").select("discount_paise,status,created_at,coupons(code,title),trips(code)").eq("rider_id", id).order("created_at", { ascending: false }).limit(20),
    client.from("payment_intents").select("id,purpose,amount_paise,status,razorpay_payment_id,created_at").eq("owner_id", id).order("created_at", { ascending: false }).limit(20),
  ]);
  const tripRows = (trips.data ?? []).map(tripLine);
  return {
    rider,
    wallet,
    stats: {
      completed: tripRows.filter((trip) => trip.status === "completed").length,
      cancelled: tripRows.filter((trip) => trip.status === "cancelled" && trip.cancelledBy === "rider").length,
      spent: tripRows.filter((trip) => trip.status === "completed").reduce((sum, trip) => sum + trip.payable, 0),
    },
    trips: tripRows,
    tickets: tickets.data ?? [],
    coupons: (coupons.data ?? []).map((row) => money(row, "discount_paise")),
    payments: (payments.data ?? []).map((row) => money(row, "amount_paise")),
  };
}

export const riderDecisionSchema = z.object({ action: z.enum(["block", "unblock"]), note: z.string().trim().max(200).optional() });

export async function decideRider(staff: StaffSession, id: string, input: z.infer<typeof riderDecisionSchema>) {
  if (input.action === "block" && !input.note) throw new AppError("Add the reason for the hold.", 400);
  const client = db();
  const { data: before } = await client.from("riders").select("status,status_note").eq("user_id", id).maybeSingle();
  if (!before) throw new AppError("Passenger not found.", 404);
  const rider = must(
    await client
      .from("riders")
      .update({ status: input.action === "block" ? "blocked" : "active", status_note: input.action === "block" ? input.note : null })
      .eq("user_id", id)
      .select("user_id,status,status_note")
      .single(),
  );
  await audit(staff, `rider.${input.action}`, "rider", id, before, rider);
  return { rider };
}

// ---------------------------------------------------------------------------
// Trips
// ---------------------------------------------------------------------------

export async function listTrips(filters: { status: string | null; vehicle: string | null; q: string; range: string }) {
  const client = db();
  let query = client
    .from("trips")
    .select("*,riders(name,phone),captains(name,captain_code,phone)")
    .order("requested_at", { ascending: false })
    .limit(300);
  if (filters.status === "open") query = query.in("status", OPEN);
  else if (filters.status) query = query.eq("status", filters.status);
  if (filters.vehicle) query = query.eq("vehicle", filters.vehicle);
  if (filters.range === "today") {
    const ist = new Date(Date.now() + 330 * 60 * 1000);
    ist.setUTCHours(0, 0, 0, 0);
    query = query.gte("requested_at", new Date(ist.getTime() - 330 * 60 * 1000).toISOString());
  } else if (filters.range === "7d") query = query.gte("requested_at", recent(7 * 24 * 60));
  const term = needle(filters.q);
  if (/^[6-9]\d{9}$/.test(term)) {
    const [riders, captains] = await Promise.all([
      client.from("riders").select("user_id").eq("phone", term),
      client.from("captains").select("user_id").eq("phone", term),
    ]);
    const ids = [...(riders.data ?? []), ...(captains.data ?? [])].map((row) => row.user_id);
    if (!ids.length) return { trips: [] };
    query = query.or(ids.map((value) => `rider_id.eq.${value},captain_id.eq.${value}`).join(","));
  } else if (term) {
    query = query.or(`code.ilike.%${term}%,pickup_name.ilike.%${term}%,drop_name.ilike.%${term}%`);
  }
  const { data } = await query;
  return { trips: (data ?? []).map(tripLine) };
}

export async function tripDetail(id: string) {
  const client = db();
  const { data: trip } = await client.from("trips").select("*,riders(user_id,name,phone,status),captains(user_id,name,captain_code,phone,vehicle_no,vehicle_model,rating)").eq("id", id).maybeSingle();
  if (!trip) throw new AppError("Trip not found.", 404);
  const [offers, ratings, payments, ledger, coupon, tickets, events] = await Promise.all([
    client.from("trip_offers").select("id,status,pickup_km,created_at,decided_at,expires_at,captains(name,captain_code)").eq("trip_id", id).order("created_at"),
    client.from("trip_ratings").select("by_role,stars,tags,note,created_at").eq("trip_id", id),
    client.from("payment_intents").select("id,amount_paise,status,razorpay_order_id,razorpay_payment_id,created_at").eq("ref_id", id).order("created_at"),
    client.from("ledger_entries").select("id,owner_id,kind,amount_paise,note,created_at").eq("ref_type", "trip").eq("ref_id", id).order("id"),
    client.from("coupon_redemptions").select("discount_paise,status,coupons(code,title)").eq("trip_id", id).maybeSingle(),
    client.from("support_tickets").select("id,code,topic,status,created_at").eq("trip_id", id),
    client.from("events").select("id,topic,created_at").eq("key", id).order("id").limit(50),
  ]);
  return {
    trip: { ...tripLine(trip), raw: trip },
    offers: offers.data ?? [],
    ratings: ratings.data ?? [],
    payments: (payments.data ?? []).map((row) => money(row, "amount_paise")),
    ledger: (ledger.data ?? []).map((row) => ({ ...money(row, "amount_paise"), who: row.owner_id === PLATFORM ? "ROVEYA" : row.owner_id === trip.rider_id ? "Passenger" : row.owner_id === trip.captain_id ? "Captain" : "Other" })),
    coupon: coupon.data ? money(coupon.data, "discount_paise") : null,
    tickets: tickets.data ?? [],
    timeline: events.data ?? [],
  };
}

export const tripActionSchema = z.object({
  action: z.enum(["cancel", "refund", "mark_paid"]),
  reason: z.string().trim().min(3, "Add a short reason.").max(120),
});

export async function tripAction(staff: StaffSession, id: string, input: z.infer<typeof tripActionSchema>) {
  const client = db();
  const { data: trip } = await client.from("trips").select("*").eq("id", id).maybeSingle();
  if (!trip) throw new AppError("Trip not found.", 404);
  const owed = trip.fare_paise - (trip.discount_paise ?? 0);

  if (input.action === "cancel") {
    if (!OPEN.includes(trip.status)) throw new AppError("Only an open trip can be cancelled.", 409);
    const { data } = await client
      .from("trips")
      .update({ status: "cancelled", cancelled_by: "system", cancel_reason: input.reason, cancelled_at: new Date().toISOString() })
      .eq("id", id)
      .in("status", OPEN)
      .select("id");
    if (!data?.length) throw new AppError("This trip has moved on. Refresh and try again.", 409);
    await client.from("trip_offers").update({ status: "withdrawn", decided_at: new Date().toISOString() }).eq("trip_id", id).eq("status", "offered");
  } else if (input.action === "refund") {
    if (trip.payment_status !== "paid" || trip.payment === "cash") throw new AppError("Only a ride paid by wallet or online can be refunded.", 409);
    const credit = await client.rpc("ledger_post", { p_owner: trip.rider_id, p_kind: "refund", p_amount: owed, p_ref_type: "trip", p_ref_id: id, p_note: `Refund for ${trip.code}: ${input.reason}` });
    const failure = dbError(credit.error);
    if (failure) throw failure;
    await client.rpc("ledger_post", { p_owner: PLATFORM, p_kind: "refund", p_amount: -owed, p_ref_type: "trip", p_ref_id: id, p_note: null, p_allow_negative: true });
    await client.from("trips").update({ payment_status: "refunded" }).eq("id", id);
  } else {
    if (trip.payment !== "cash" || trip.status !== "completed" || trip.payment_status === "paid") throw new AppError("Only a completed cash ride that is still due can be marked paid.", 409);
    await client.from("trips").update({ payment_status: "paid" }).eq("id", id);
  }
  void kickConsumers();
  await audit(staff, `trip.${input.action}`, "trip", id, { status: trip.status, payment_status: trip.payment_status }, { reason: input.reason, amount: rupees(owed) });
  return tripDetail(id);
}

// ---------------------------------------------------------------------------
// Wallets
// ---------------------------------------------------------------------------

export async function walletDetail(ownerId: string) {
  const summary = await walletSummary(ownerId, 100);
  if (!summary.kind) throw new AppError("Wallet not found.", 404);
  return { wallet: summary };
}

export const adjustSchema = z.object({
  amount: z.number().refine((value) => value !== 0 && Math.abs(value) <= 50000, "Adjust between ₹1 and ₹50,000."),
  note: z.string().trim().min(5, "Say why the balance changes.").max(160),
});

export async function adjustWallet(staff: StaffSession, ownerId: string, input: z.infer<typeof adjustSchema>) {
  if (ownerId === PLATFORM) throw new AppError("ROVEYA's own account cannot be adjusted here.", 400);
  const before = await walletSummary(ownerId, 1);
  if (!before.kind) throw new AppError("Wallet not found.", 404);
  const amount = Math.round(input.amount * 100);
  const ref = randomUUID();
  const posted = await db().rpc("ledger_post", { p_owner: ownerId, p_kind: "adjustment", p_amount: amount, p_ref_type: "adjustment", p_ref_id: ref, p_note: input.note });
  const failure = dbError(posted.error);
  if (failure) throw failure;
  await db().rpc("ledger_post", { p_owner: PLATFORM, p_kind: "adjustment", p_amount: -amount, p_ref_type: "adjustment", p_ref_id: ref, p_note: input.note, p_allow_negative: true });
  await audit(staff, "wallet.adjust", "wallet", ownerId, { balance: before.balance }, { amount: input.amount, note: input.note });
  return walletDetail(ownerId);
}

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------

const couponFields = {
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().max(240).nullable().optional(),
  kind: z.enum(["flat", "percent"]),
  value: z.number().positive(),
  maxDiscount: z.number().positive().nullable().optional(),
  minFare: z.number().min(0).max(5000).default(0),
  vehicles: z.array(z.enum(["bike", "auto", "cab"])).default([]),
  newRidersOnly: z.boolean().default(false),
  perRiderLimit: z.number().int().min(1).max(100).default(1),
  maxRedemptions: z.number().int().positive().nullable().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  active: z.boolean().default(true),
  listed: z.boolean().default(true),
};

export const couponCreateSchema = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/, "Codes use 3 to 20 letters or numbers."), ...couponFields });
export const couponUpdateSchema = z.object(couponFields).partial();

function couponRow(input: z.infer<typeof couponUpdateSchema>, kind?: string) {
  const row: Record<string, unknown> = {};
  const type = input.kind ?? kind;
  if (input.title !== undefined) row.title = input.title;
  if (input.description !== undefined) row.description = input.description;
  if (input.kind !== undefined) row.kind = input.kind;
  if (input.value !== undefined) {
    if (type === "percent" && input.value > 100) throw new AppError("A percent coupon is at most 100.", 400);
    row.value = type === "percent" ? Math.round(input.value) : Math.round(input.value * 100);
  }
  if (input.maxDiscount !== undefined) row.max_discount_paise = input.maxDiscount === null ? null : Math.round(input.maxDiscount * 100);
  if (input.minFare !== undefined) row.min_fare_paise = Math.round(input.minFare * 100);
  if (input.vehicles !== undefined) row.vehicles = input.vehicles;
  if (input.newRidersOnly !== undefined) row.new_riders_only = input.newRidersOnly;
  if (input.perRiderLimit !== undefined) row.per_rider_limit = input.perRiderLimit;
  if (input.maxRedemptions !== undefined) row.max_redemptions = input.maxRedemptions;
  if (input.startsAt !== undefined) row.starts_at = input.startsAt;
  if (input.endsAt !== undefined) row.ends_at = input.endsAt;
  if (input.active !== undefined) row.active = input.active;
  if (input.listed !== undefined) row.listed = input.listed;
  return row;
}

function couponView(row: Record<string, unknown>, spent = 0) {
  return {
    ...row,
    value: row.kind === "percent" ? Number(row.value) : rupees(Number(row.value)),
    maxDiscount: row.max_discount_paise === null ? null : rupees(Number(row.max_discount_paise)),
    minFare: rupees(Number(row.min_fare_paise)),
    spent: rupees(spent),
  };
}

export async function listDeskCoupons() {
  const client = db();
  const [{ data }, { data: used }] = await Promise.all([
    client.from("coupons").select("*").order("created_at", { ascending: false }).limit(200),
    client.from("coupon_redemptions").select("coupon_id,discount_paise").eq("status", "used").limit(10000),
  ]);
  const spent = new Map<string, number>();
  for (const row of used ?? []) spent.set(row.coupon_id, (spent.get(row.coupon_id) ?? 0) + row.discount_paise);
  return { coupons: (data ?? []).map((row) => couponView(row, spent.get(row.id) ?? 0)) };
}

export async function createCoupon(staff: StaffSession, input: z.infer<typeof couponCreateSchema>) {
  const saved = await db().from("coupons").insert({ code: input.code, ...couponRow(input) }).select("*").single();
  if (saved.error?.code === "23505") throw new AppError("That code already exists.", 409);
  const coupon = must(saved);
  await audit(staff, "coupon.create", "coupon", coupon.id, null, coupon);
  return { coupon: couponView(coupon) };
}

export async function updateCoupon(staff: StaffSession, id: string, input: z.infer<typeof couponUpdateSchema>) {
  const client = db();
  const { data: before } = await client.from("coupons").select("*").eq("id", id).maybeSingle();
  if (!before) throw new AppError("Coupon not found.", 404);
  const coupon = must(await client.from("coupons").update(couponRow(input, before.kind)).eq("id", id).select("*").single());
  await audit(staff, "coupon.update", "coupon", id, before, coupon);
  return { coupon: couponView(coupon) };
}

// ---------------------------------------------------------------------------
// Support desk
// ---------------------------------------------------------------------------

async function people(ids: string[]) {
  if (!ids.length) return new Map<string, { name: string; phone: string; kind: string }>();
  const client = db();
  const [riders, captains] = await Promise.all([
    client.from("riders").select("user_id,name,phone").in("user_id", ids),
    client.from("captains").select("user_id,name,phone,captain_code").in("user_id", ids),
  ]);
  const map = new Map<string, { name: string; phone: string; kind: string }>();
  for (const row of riders.data ?? []) map.set(`rider:${row.user_id}`, { name: row.name, phone: row.phone, kind: "Passenger" });
  for (const row of captains.data ?? []) map.set(`captain:${row.user_id}`, { name: `${row.name} · ${row.captain_code}`, phone: row.phone, kind: "Captain" });
  return map;
}

export async function listTickets(filters: { status: string | null; app: string | null; q: string }) {
  let query = db().from("support_tickets").select("*").order("last_message_at", { ascending: false }).limit(300);
  if (filters.status === "active") query = query.in("status", ["open", "pending"]);
  else if (filters.status) query = query.eq("status", filters.status);
  if (filters.app) query = query.eq("app", filters.app);
  const term = needle(filters.q);
  if (term) query = query.or(`code.ilike.%${term}%,topic.ilike.%${term}%,trip_code.ilike.%${term}%`);
  const { data } = await query;
  const rows = data ?? [];
  const who = await people([...new Set(rows.map((row) => row.user_id))]);
  return { tickets: rows.map((row) => ({ ...row, person: who.get(`${row.app}:${row.user_id}`) ?? null })) };
}

export async function ticketDetail(id: string) {
  const client = db();
  const { data: ticket } = await client.from("support_tickets").select("*").eq("id", id).maybeSingle();
  if (!ticket) throw new AppError("Ticket not found.", 404);
  const [messages, trip, who] = await Promise.all([
    client.from("support_messages").select("id,author,body,created_at,admin_users(name)").eq("ticket_id", id).order("id"),
    ticket.trip_id ? client.from("trips").select("*,riders(name,phone),captains(name,captain_code,phone)").eq("id", ticket.trip_id).maybeSingle() : Promise.resolve({ data: null }),
    people([ticket.user_id]),
  ]);
  return {
    ticket: { ...ticket, person: who.get(`${ticket.app}:${ticket.user_id}`) ?? null },
    messages: messages.data ?? [],
    trip: trip.data ? tripLine(trip.data) : null,
  };
}

export const ticketUpdateSchema = z.object({
  message: z.string().trim().min(1).max(2000).optional(),
  status: z.enum(["open", "pending", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  assignToMe: z.boolean().optional(),
});

export async function updateTicket(staff: StaffSession, id: string, input: z.infer<typeof ticketUpdateSchema>) {
  const client = db();
  const { data: before } = await client.from("support_tickets").select("status,priority,assigned_to").eq("id", id).maybeSingle();
  if (!before) throw new AppError("Ticket not found.", 404);
  const patch: Record<string, unknown> = {};
  if (input.message) {
    const saved = await client.from("support_messages").insert({ ticket_id: id, author: "staff", staff_id: staffRef(staff), body: input.message });
    const failure = dbError(saved.error);
    if (failure) throw failure;
    patch.last_message_at = new Date().toISOString();
    patch.status = input.status ?? "pending";
  } else if (input.status) patch.status = input.status;
  if (input.priority) patch.priority = input.priority;
  if (input.assignToMe) patch.assigned_to = staffRef(staff);
  if (!Object.keys(patch).length) throw new AppError("Write a reply or change the status.", 400);
  await client.from("support_tickets").update(patch).eq("id", id);
  await audit(staff, input.message ? "ticket.reply" : "ticket.update", "support_ticket", id, before, patch);
  return ticketDetail(id);
}

// ---------------------------------------------------------------------------
// Push broadcasts
// ---------------------------------------------------------------------------

export const notifySchema = z.object({
  audience: z.enum(["captains_online", "captains_all", "riders_all", "person"]),
  app: z.enum(["rider", "captain"]).optional(),
  userId: z.string().uuid().optional(),
  title: z.string().trim().min(3).max(60),
  body: z.string().trim().min(3).max(180),
});

export async function notify(staff: StaffSession, input: z.infer<typeof notifySchema>) {
  const client = db();
  let targets: { userId: string; app: "rider" | "captain" }[] = [];
  if (input.audience === "person") {
    if (!input.userId || !input.app) throw new AppError("Pick the person to notify.", 400);
    targets = [{ userId: input.userId, app: input.app }];
  } else if (input.audience === "captains_online") {
    const { data } = await client.from("captain_presence").select("captain_id").eq("online", true).gte("updated_at", recent(5)).limit(5000);
    targets = (data ?? []).map((row) => ({ userId: row.captain_id, app: "captain" }));
  } else {
    const app = input.audience === "captains_all" ? "captain" : "rider";
    const { data } = await client.from("push_tokens").select("user_id").eq("app", app).limit(20000);
    targets = [...new Set((data ?? []).map((row) => row.user_id))].map((userId) => ({ userId, app }));
  }
  let devices = 0;
  for (let index = 0; index < targets.length; index += 10) {
    const batch = await Promise.all(
      targets.slice(index, index + 10).map((target) => client.rpc("push_send", { p_user: target.userId, p_app: target.app, p_kind: "desk", p_title: input.title, p_body: input.body })),
    );
    devices += batch.reduce((sum, result) => sum + Number(result.data ?? 0), 0);
  }
  await audit(staff, "push.broadcast", "push", input.audience, null, { title: input.title, body: input.body, people: targets.length, devices });
  return { people: targets.length, devices };
}

export async function pushLog() {
  const { data } = await db().from("push_log").select("*").order("created_at", { ascending: false }).limit(150);
  return { log: data ?? [] };
}

export async function auditLog() {
  const { data } = await db().from("audit_logs").select("id,action,entity,entity_id,old_data,new_data,created_at,admin_users(name,role)").order("created_at", { ascending: false }).limit(200);
  return { entries: data ?? [] };
}
