import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { db, dbError, must, rupees } from "@/lib/platform/gateway";
import type { CaptainRow } from "@/lib/platform/session";

const plate = /^[A-Z]{2} ?[0-9]{1,2} ?[A-Z]{0,3} ?[0-9]{3,4}$/;

export const registerSchema = z.object({
  name: z.string().trim().min(3, "Enter your full name.").max(80),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Send the date of birth as YYYY-MM-DD."),
  gender: z.enum(["Male", "Female", "Other"]),
  email: z.string().trim().email("Check the email format.").optional().or(z.literal("")),
  city: z.string().trim().min(2).max(60),
  vehicle: z.enum(["bike", "auto", "cab"]),
  vehicleNo: z.string().trim().toUpperCase().regex(plate, "Use the number plate format TS09 AB 2146."),
  vehicleModel: z.string().trim().min(2).max(60),
  vehicleColor: z.string().trim().min(3).max(20),
  vehicleYear: z.string().trim().min(4).max(10),
  bankHolder: z.string().trim().min(3).max(80),
  accountNumber: z.string().regex(/^\d{9,18}$/, "Account numbers have 9 to 18 digits."),
  ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Check the IFSC code."),
  upi: z.string().trim().max(60).optional().or(z.literal("")),
  emergencyName: z.string().trim().min(2).max(80),
  emergencyPhone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid emergency mobile number."),
});

function adult(dob: string) {
  const born = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(born.getTime())) return false;
  const limit = new Date();
  limit.setUTCFullYear(limit.getUTCFullYear() - 18);
  return born <= limit;
}

export async function registerCaptain(userId: string, phone: string, input: z.infer<typeof registerSchema>) {
  if (!adult(input.dob)) throw new AppError("Captains must be 18 or older.", 400);
  const client = db();
  const inserted = await client
    .from("captains")
    .insert({
      user_id: userId,
      phone,
      name: input.name,
      dob: input.dob,
      gender: input.gender,
      email: input.email || null,
      city: input.city,
      vehicle: input.vehicle,
      vehicle_no: input.vehicleNo.replace(/\s+/g, " "),
      vehicle_model: input.vehicleModel,
      vehicle_color: input.vehicleColor,
      vehicle_year: input.vehicleYear,
      bank_holder: input.bankHolder,
      bank_last4: input.accountNumber.slice(-4),
      ifsc: input.ifsc,
      upi: input.upi || null,
      emergency_name: input.emergencyName,
      emergency_phone: input.emergencyPhone,
    })
    .select("*")
    .single();
  if (inserted.error?.code === "23505") throw new AppError("This number or number plate is already registered.", 409);
  const captain = must(inserted);
  await client.from("captain_presence").upsert({ captain_id: userId, vehicle: input.vehicle, online: false });
  return { captain };
}

export async function captainProfile(captain: CaptainRow) {
  const { data: docs } = await db().from("captain_documents").select("kind,status,review_note,updated_at").eq("captain_id", captain.user_id);
  const { data: presence } = await db().from("captain_presence").select("online,auto_accept,online_since").eq("captain_id", captain.user_id).maybeSingle();
  return { captain, documents: docs ?? [], presence };
}

export const updateSchema = z.object({
  name: z.string().trim().min(3).max(80).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  emergencyName: z.string().trim().min(2).max(80).optional(),
  emergencyPhone: z.string().regex(/^[6-9]\d{9}$/).optional(),
  bankHolder: z.string().trim().min(3).max(80).optional(),
  accountNumber: z.string().regex(/^\d{9,18}$/).optional(),
  ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/).optional(),
  upi: z.string().trim().max(60).optional().or(z.literal("")),
});

export async function updateCaptain(captainId: string, input: z.infer<typeof updateSchema>) {
  const patch: Record<string, unknown> = {};
  if (input.name) patch.name = input.name;
  if (input.email !== undefined) patch.email = input.email || null;
  if (input.emergencyName) patch.emergency_name = input.emergencyName;
  if (input.emergencyPhone) patch.emergency_phone = input.emergencyPhone;
  if (input.bankHolder) patch.bank_holder = input.bankHolder;
  if (input.accountNumber) patch.bank_last4 = input.accountNumber.slice(-4);
  if (input.ifsc) patch.ifsc = input.ifsc;
  if (input.upi !== undefined) patch.upi = input.upi || null;
  const updated = await db().from("captains").update(patch).eq("user_id", captainId).select("*").single();
  return { captain: must(updated) };
}

export const DOCUMENT_KINDS = ["dlFront", "dlBack", "rc", "aadhaar", "pan", "selfie"] as const;
export const documentSchema = z.object({ kind: z.enum(DOCUMENT_KINDS) });
export const documentConfirmSchema = z.object({ kind: z.enum(DOCUMENT_KINDS), path: z.string().min(10).max(200) });

const BUCKET = "captain-documents";

// Step one: a short-lived link the phone uploads the photo to directly.
export async function documentUpload(captainId: string, kind: z.infer<typeof documentSchema>["kind"]) {
  const path = `${captainId}/${kind}-${Date.now()}.jpg`;
  const { data, error } = await db().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new AppError("We could not prepare the upload.", 500);
  return { uploadUrl: data.signedUrl, token: data.token, path };
}

// Step two: the document goes to review only once the photo is really in storage.
export async function confirmDocument(captainId: string, input: z.infer<typeof documentConfirmSchema>) {
  const prefix = `${captainId}/${input.kind}-`;
  if (!input.path.startsWith(prefix) || !/^[\w-]+\/[\w-]+\.jpg$/.test(input.path)) throw new AppError("That upload does not belong to this document.", 400);
  const client = db();
  const file = input.path.slice(captainId.length + 1);
  const { data: listed } = await client.storage.from(BUCKET).list(captainId, { search: file, limit: 1 });
  if (!listed?.some((item) => item.name === file)) throw new AppError("The photo did not reach us. Try the upload again.", 409);
  const saved = await client
    .from("captain_documents")
    .upsert({ captain_id: captainId, kind: input.kind, status: "uploaded", storage_path: input.path, review_note: null, reviewed_at: null, reviewed_by: null, updated_at: new Date().toISOString() })
    .select("kind,status,review_note,updated_at")
    .single();
  return { document: must(saved) };
}

export const dutySchema = z.object({
  online: z.boolean(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  autoAccept: z.boolean().optional(),
});

export async function setDuty(captain: CaptainRow, input: z.infer<typeof dutySchema>) {
  if (input.online && (input.latitude === undefined || input.longitude === undefined)) throw new AppError("Share your location to go on duty.", 400);
  const now = new Date().toISOString();
  const row: Record<string, unknown> = { captain_id: captain.user_id, vehicle: captain.vehicle, online: input.online, updated_at: now };
  if (input.latitude !== undefined) row.latitude = input.latitude;
  if (input.longitude !== undefined) row.longitude = input.longitude;
  if (input.autoAccept !== undefined) row.auto_accept = input.autoAccept;
  row.online_since = input.online ? now : null;
  const saved = await db().from("captain_presence").upsert(row).select("online,auto_accept,online_since").single();
  if (input.online) await db().rpc("sweep_offers");
  return { presence: must(saved) };
}

export const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).default(0),
});

export async function updateLocation(captainId: string, input: z.infer<typeof locationSchema>) {
  const { error } = await db()
    .from("captain_presence")
    .update({ latitude: input.latitude, longitude: input.longitude, heading: input.heading, updated_at: new Date().toISOString() })
    .eq("captain_id", captainId);
  const failure = dbError(error);
  if (failure) throw failure;
  return { ok: true };
}

function istStart(range: "today" | "week") {
  const offset = 330 * 60 * 1000;
  const ist = new Date(Date.now() + offset);
  ist.setUTCHours(0, 0, 0, 0);
  if (range === "week") ist.setUTCDate(ist.getUTCDate() - ((ist.getUTCDay() + 6) % 7));
  return new Date(ist.getTime() - offset).toISOString();
}

export async function earnings(captainId: string, range: "today" | "week") {
  const { data } = await db()
    .from("trips")
    .select("id,code,status,fare_paise,discount_paise,bonus_paise,payment,distance_km,pickup_name,drop_name,requested_at,completed_at,cancel_reason")
    .eq("captain_id", captainId)
    .gte("requested_at", istStart(range))
    .order("requested_at", { ascending: false });
  const trips = data ?? [];
  const done = trips.filter((trip) => trip.status === "completed");
  const fares = done.reduce((sum, trip) => sum + trip.fare_paise, 0);
  const bonus = done.reduce((sum, trip) => sum + trip.bonus_paise, 0);
  const cash = done.filter((trip) => trip.payment === "cash").reduce((sum, trip) => sum + trip.fare_paise - (trip.discount_paise ?? 0), 0);
  return {
    range,
    completed: done.length,
    cancelled: trips.filter((trip) => trip.status === "cancelled").length,
    totals: { fares: rupees(fares), bonus: rupees(bonus), total: rupees(fares + bonus), cash: rupees(cash), toWallet: rupees(fares + bonus - cash) },
    distanceKm: Math.round(done.reduce((sum, trip) => sum + Number(trip.distance_km), 0) * 10) / 10,
    trips: trips.map((trip) => ({
      id: trip.id,
      code: trip.code,
      status: trip.status,
      fare: rupees(trip.fare_paise),
      bonus: rupees(trip.bonus_paise),
      payment: trip.payment,
      pickup: trip.pickup_name,
      drop: trip.drop_name,
      at: trip.completed_at ?? trip.requested_at,
      reason: trip.cancel_reason,
    })),
  };
}

export async function walletView(ownerId: string) {
  const client = db();
  const [{ data: wallet }, { data: entries }] = await Promise.all([
    client.from("wallets").select("balance_paise").eq("owner_id", ownerId).maybeSingle(),
    client.from("ledger_entries").select("id,kind,amount_paise,note,ref_type,ref_id,created_at").eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(50),
  ]);
  return {
    balance: rupees(Number(wallet?.balance_paise ?? 0)),
    entries: (entries ?? []).map((entry) => ({ id: entry.id, kind: entry.kind, amount: rupees(Number(entry.amount_paise)), note: entry.note, at: entry.created_at })),
  };
}

export const payoutSchema = z.object({ amount: z.number().int().min(100, "Redeem at least ₹100.").max(100000) });

export async function requestPayout(captain: CaptainRow, amountRupees: number) {
  const client = db();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count } = await client.from("payout_requests").select("id", { count: "exact", head: true }).eq("captain_id", captain.user_id).neq("status", "rejected").gte("created_at", weekAgo);
  if ((count ?? 0) >= 2) throw new AppError("You can redeem twice a week. Try again in a few days.", 429);
  const amount = amountRupees * 100;
  const inserted = await client.from("payout_requests").insert({ captain_id: captain.user_id, amount_paise: amount, bank_last4: captain.bank_last4 }).select("*").single();
  const payout = must(inserted);
  const held = await client.rpc("ledger_post", { p_owner: captain.user_id, p_kind: "payout", p_amount: -amount, p_ref_type: "payout", p_ref_id: payout.id, p_note: `Redeemed to bank ••${captain.bank_last4}` });
  if (held.error) {
    await client.from("payout_requests").delete().eq("id", payout.id);
    throw dbError(held.error)!;
  }
  return { payout: { id: payout.id, amount: amountRupees, status: payout.status, bankLast4: captain.bank_last4 } };
}
