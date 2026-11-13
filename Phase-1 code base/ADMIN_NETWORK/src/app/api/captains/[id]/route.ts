import { z } from "zod";
import { ApiError, check, mustId, readBody, route } from "@/lib/server/api";
import { can } from "@/lib/roles";
import { audit, requireAdmin, type Admin } from "@/lib/server/auth";
import { balances } from "@/lib/server/data";
import { controls, db } from "@/lib/server/db";
import { rideLine } from "@/lib/server/rides";

const BUCKET = "captain-documents";

async function detail(id: string) {
  const captain = check(await db().from("captains").select("*").eq("user_id", id).maybeSingle(), "Captain not found.");
  const [docs, car, plan, ledger, trips, payouts, tickets] = await Promise.all([
    db().from("captain_documents").select("*").eq("captain_id", id),
    db().from("seat_cars").select("*").eq("captain_id", id).maybeSingle(),
    db().from("payout_plans").select("*").eq("captain_id", id).maybeSingle(),
    db().from("ledger_entries").select("id,kind,amount_paise,ref_type,ref_id,note,created_at").eq("owner_id", id).order("created_at", { ascending: false }).limit(40),
    controls().from("trip_finance").select("id,code,status,from_city,to_city,depart_at,seats_total,seats_booked,fare_paise,captain_share_paise,captain_paid_paise,profit_paise").eq("captain_id", id).order("depart_at", { ascending: false }).limit(40),
    db().from("payout_requests").select("*").eq("captain_id", id).order("created_at", { ascending: false }).limit(30),
    db().from("support_tickets").select("id,code,topic,status,created_at").eq("user_id", id).eq("app", "captain").order("created_at", { ascending: false }).limit(20),
  ]);
  const documents = await Promise.all(
    (docs.data ?? []).map(async (doc) => {
      const signed = doc.storage_path ? await db().storage.from(BUCKET).createSignedUrl(doc.storage_path, 900) : null;
      return { ...doc, viewUrl: signed?.data?.signedUrl ?? null };
    }),
  );
  const wallet = await balances([id]);
  const common = { captain, documents, car: car.data, plan: plan.data, walletPaise: wallet.get(id) ?? 0, ledger: ledger.data ?? [], payouts: payouts.data ?? [], tickets: tickets.data ?? [] };

  // ROVEYA Bike and ROVEYA Auto captains drive city rides, not seat trips.
  if (captain.service === "taxi") {
    const { data: rideRows } = await db().from("trips").select("*").eq("captain_id", id).order("requested_at", { ascending: false }).limit(40);
    const rides = (rideRows ?? []).map(rideLine);
    const done = rides.filter((ride) => ride.status === "completed");
    // Cash fares stay in the captain's hand, so earnings come from the rides; ROVEYA's share is the commission.
    // Cash rides post commission on its own; online rides credit the fare already less commission.
    const { data: posted } = done.length
      ? await db().from("ledger_entries").select("ref_id,kind,amount_paise").eq("owner_id", id).in("kind", ["commission", "ride_earning"]).eq("ref_type", "trip").in("ref_id", done.map((ride) => ride.id))
      : { data: [] };
    const commissionPaise = done.reduce((sum, ride) => {
      const rows = (posted ?? []).filter((row) => String(row.ref_id) === ride.id);
      const total = (kind: string) => rows.filter((row) => row.kind === kind).reduce((acc, row) => acc + Number(row.amount_paise), 0);
      if (ride.payment === "cash") return sum - total("commission");
      return rows.some((row) => row.kind === "ride_earning") ? sum + ride.farePaise - total("ride_earning") : sum;
    }, 0);
    return {
      ...common,
      trips: [],
      rides,
      stats: {
        trips: rides.length,
        completed: done.length,
        earnedPaise: done.reduce((sum, ride) => sum + ride.farePaise + ride.bonusPaise, 0) - commissionPaise,
        platformPaise: commissionPaise,
      },
    };
  }

  const tripRows = trips.data ?? [];
  return {
    ...common,
    trips: tripRows,
    rides: [],
    stats: {
      trips: tripRows.length,
      completed: tripRows.filter((trip) => trip.status === "completed").length,
      earnedPaise: tripRows.reduce((sum, trip) => sum + Number(trip.captain_paid_paise ?? 0), 0),
      platformPaise: tripRows.reduce((sum, trip) => sum + Number(trip.profit_paise ?? 0), 0),
    },
  };
}

// Wallet, ledger and payouts are money: only roles that can see finance get them.
async function forAdmin(id: string, admin: Admin) {
  const data = await detail(id);
  if (can(admin.permissions, "view.finance")) return data;
  return { ...data, walletPaise: null, ledger: [], payouts: [], stats: { ...data.stats, earnedPaise: null, platformPaise: null } };
}

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const admin = await requireAdmin("view.captains");
  return forAdmin(mustId(id, "Captain"), admin);
});

const patch = z.object({
  action: z.enum(["approve", "suspend", "reinstate"]).optional(),
  note: z.string().trim().max(200).optional(),
  name: z.string().trim().min(3).max(80).optional(),
  email: z.string().trim().email().or(z.literal("")).optional(),
  city: z.string().trim().min(2).max(40).optional(),
  upi: z.string().trim().max(60).optional(),
  emergencyName: z.string().trim().min(2).max(60).optional(),
  emergencyPhone: z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number.").optional(),
  payoutCycle: z.enum(["daily", "weekly", "monthly"]).optional(),
});

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  mustId(id, "Captain");
  const input = await readBody(req, patch);
  const admin = await requireAdmin(input.action && !input.name && !input.email && !input.city && input.upi === undefined && !input.payoutCycle ? "captains.review" : input.payoutCycle && Object.keys(input).length === 1 ? ["captains.edit", "money.payouts"] : "captains.edit");
  const before = check(await db().from("captains").select("status,name,email,city,upi").eq("user_id", id).maybeSingle(), "Captain not found.");

  if (input.action) {
    if (input.action === "suspend" && !input.note) throw new ApiError("Add the reason the captain will see.", 400);
    const status = input.action === "suspend" ? "suspended" : "active";
    check(
      await db()
        .from("captains")
        .update({ status, status_note: input.action === "suspend" ? input.note : null, ...(input.action === "approve" ? { approved_at: new Date().toISOString() } : null) })
        .eq("user_id", id)
        .select("user_id")
        .single(),
    );
    if (input.action === "approve") {
      await controls().from("vado_claims").delete().eq("captain_id", id);
      await db().from("captain_documents").update({ status: "verified", reviewed_at: new Date().toISOString() }).eq("captain_id", id).eq("status", "uploaded");
      await db().from("seat_cars").update({ status: "active", review_note: null }).eq("captain_id", id).eq("status", "review");
    }
    if (input.action === "suspend") {
      await db().from("captain_presence").update({ online: false }).eq("captain_id", id);
    }
  }

  const fields: Record<string, unknown> = {};
  if (input.name) fields.name = input.name;
  if (input.email !== undefined) fields.email = input.email || null;
  if (input.city) fields.city = input.city;
  if (input.upi !== undefined) fields.upi = input.upi || null;
  if (input.emergencyName) fields.emergency_name = input.emergencyName;
  if (input.emergencyPhone) fields.emergency_phone = input.emergencyPhone;
  if (Object.keys(fields).length) check(await db().from("captains").update(fields).eq("user_id", id).select("user_id").single());

  if (input.payoutCycle) check(await db().rpc("set_payout_plan", { p_captain: id, p_cycle: input.payoutCycle }));

  await audit(admin, input.action ? `captain.${input.action}` : "captain.update", "captain", id, { before, change: input });
  return forAdmin(id, admin);
});
