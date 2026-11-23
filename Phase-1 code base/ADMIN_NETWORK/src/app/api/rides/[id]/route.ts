import { z } from "zod";
import { ApiError, check, mustId, readBody, route, uuid } from "@/lib/server/api";
import { can } from "@/lib/roles";
import { audit, requireAdmin, type Admin } from "@/lib/server/auth";
import { activity, moneyMoved, notify } from "@/lib/server/bookings";
import type { Row } from "@/lib/server/data";
import { db } from "@/lib/server/db";
import { kickConsumers, OPEN, owed, rideLine, whoOwns } from "@/lib/server/rides";

// Cancelled or expired rides with no money ever moved can be deleted for good.
const deletable = async (trip: Row) => (trip.status === "cancelled" || trip.status === "expired") && !(await moneyMoved(trip.id));

async function detail(id: string, admin: Admin) {
  const trip = check(await db().from("trips").select("*").eq("id", id).maybeSingle(), "Ride not found.") as Row;
  const open = OPEN.includes(trip.status);
  const [rider, captain, offers, ratings, payments, ledger, coupon, tickets, presence, secret, trail, riderRides, canDelete] = await Promise.all([
    db().from("riders").select("user_id,name,phone,email,status,created_at").eq("user_id", trip.rider_id).maybeSingle(),
    trip.captain_id ? db().from("captains").select("user_id,name,phone,captain_code,vehicle,vehicle_no,vehicle_model,vehicle_color,rating,status").eq("user_id", trip.captain_id).maybeSingle() : Promise.resolve({ data: null }),
    db().from("trip_offers").select("id,captain_id,status,pickup_km,created_at,decided_at,expires_at").eq("trip_id", id).order("created_at"),
    db().from("trip_ratings").select("by_role,stars,tags,note,created_at").eq("trip_id", id),
    db().from("payment_intents").select("id,amount_paise,status,razorpay_order_id,razorpay_payment_id,created_at").eq("ref_id", id).order("created_at"),
    db().from("ledger_entries").select("id,owner_id,kind,amount_paise,note,created_at").eq("ref_type", "trip").eq("ref_id", id).order("id"),
    db().from("coupon_redemptions").select("discount_paise,status,coupons(code,title)").eq("trip_id", id).maybeSingle(),
    db().from("support_tickets").select("id,code,topic,status,created_at").eq("trip_id", id),
    trip.captain_id ? db().from("captain_presence").select("online,latitude,longitude,heading,updated_at").eq("captain_id", trip.captain_id).maybeSingle() : Promise.resolve({ data: null }),
    open && can(admin.permissions, "rides.manage") ? db().from("trip_secrets").select("otp").eq("trip_id", id).maybeSingle() : Promise.resolve({ data: null }),
    activity(id),
    db().from("trips").select("status").eq("rider_id", trip.rider_id).limit(500),
    deletable(trip),
  ]);
  const offerRows = (offers.data ?? []) as Row[];
  const captainIds = [...new Set(offerRows.map((row) => row.captain_id))];
  const { data: offered } = captainIds.length ? await db().from("captains").select("user_id,name,captain_code").in("user_id", captainIds) : { data: [] };
  const nameOf = new Map((offered ?? []).map((row) => [row.user_id, row]));
  const finance = can(admin.permissions, "view.finance");
  const history = (riderRides.data ?? []) as Row[];
  return {
    ride: { ...rideLine(trip), etaMin: trip.eta_min, routeSource: trip.route_source },
    places: { pickup: { latitude: trip.pickup_lat, longitude: trip.pickup_lng }, drop: { latitude: trip.drop_lat, longitude: trip.drop_lng } },
    times: { requested: trip.requested_at, assigned: trip.assigned_at, arrived: trip.arrived_at, started: trip.started_at, completed: trip.completed_at, cancelled: trip.cancelled_at },
    rider: rider.data ? { ...rider.data, rides: history.length, completedRides: history.filter((row) => row.status === "completed").length } : null,
    captain: captain.data,
    captainLocation: presence.data,
    otp: (secret.data as Row | null)?.otp ?? null,
    offers: offerRows.map((row) => ({ ...row, captain: nameOf.get(row.captain_id) ?? null })),
    ratings: ratings.data ?? [],
    coupon: coupon.data,
    tickets: tickets.data ?? [],
    payments: finance ? (payments.data ?? []) : [],
    ledger: finance ? ((ledger.data ?? []) as Row[]).map((row) => ({ ...row, who: whoOwns(trip, row.owner_id) })) : [],
    activity: trail,
    canDelete,
  };
}

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const admin = await requireAdmin("view.rides");
  return detail(mustId(id, "Ride"), admin);
});

const schema = z.object({
  // City rides are paid after the ride, so there is nothing to refund; disputes go through a payment case.
  action: z.enum(["cancel", "collect", "assign"]),
  reason: z.string().trim().min(3, "Add a short reason.").max(120),
  captainId: z.string().regex(uuid).optional(),
});

export const POST = route<{ id: string }>(async (req, { id }) => {
  mustId(id, "Ride");
  const input = await readBody(req, schema);
  const admin = await requireAdmin("rides.manage");
  const trip = check(await db().from("trips").select("*").eq("id", id).maybeSingle(), "Ride not found.") as Row;
  const amount = owed(trip);
  const now = new Date().toISOString();
  let extra: Record<string, unknown> = {};

  if (input.action === "cancel") {
    if (!OPEN.includes(trip.status)) throw new ApiError("Only an open ride can be cancelled.", 409);
    const { data } = await db().from("trips").update({ status: "cancelled", cancelled_by: "system", cancel_reason: input.reason, cancelled_at: now }).eq("id", id).in("status", OPEN).select("id");
    if (!data?.length) throw new ApiError("This ride has moved on. Refresh and try again.", 409);
    await db().from("trip_offers").update({ status: "withdrawn", decided_at: now }).eq("trip_id", id).eq("status", "offered");
  } else if (input.action === "assign") {
    // The desk gives the ride to a chosen captain: before pickup only, same vehicle, captain free.
    if (!input.captainId) throw new ApiError("Pick the captain to assign.", 400);
    if (!["searching", "assigned"].includes(trip.status)) throw new ApiError("A captain can be assigned only before they reach the pickup.", 409);
    const { data: captain } = await db().from("captains").select("user_id,name,captain_code,status,service,vehicle").eq("user_id", input.captainId).maybeSingle();
    if (!captain || captain.status !== "active" || captain.service !== "taxi" || captain.vehicle !== trip.vehicle) throw new ApiError("Pick an active captain who drives this vehicle.", 400);
    if (captain.user_id === trip.captain_id) throw new ApiError("This captain already has the ride.", 409);
    const saved = await db().from("trips").update({ captain_id: captain.user_id, status: "assigned", assigned_at: now, updated_at: now }).eq("id", id).in("status", ["searching", "assigned"]).select("id");
    if (saved.error?.code === "23505") throw new ApiError(`${captain.name} is already on another ride.`, 409);
    if (!check(saved).length) throw new ApiError("This ride has moved on. Refresh and try again.", 409);
    await db().from("trip_offers").update({ status: "withdrawn", decided_at: now }).eq("trip_id", id).eq("status", "offered");
    extra = { from: trip.captain_id, to: captain.user_id, captain: `${captain.name} · ${captain.captain_code}` };
    const data = { tripId: id, code: trip.code };
    await notify(captain.user_id, "captain", `ROVEYA desk gave you ride ${trip.code}`, `Pickup at ${trip.pickup_name}. Open the app to start.`, { ...data, kind: "captain_assigned", eventId: `city:${id}:desk-assign:${captain.user_id}` }, "offers");
    if (trip.captain_id) {
      await notify(trip.captain_id, "captain", `Ride ${trip.code} moved to another captain`, "The ROVEYA desk reassigned it. Stay on duty for the next request.", { ...data, kind: "ride_cancelled", eventId: `city:${id}:desk-released:${trip.captain_id}` }, "offers");
      // From searching to assigned the database tells the passenger; a swap of captains it does not.
      await notify(trip.rider_id, "rider", `New captain for ${trip.code}`, `${captain.name.split(" ")[0]} is on the way. Open the app to track the ride.`, { ...data, kind: "captain_assigned", eventId: `city:${id}:captain-changed:${captain.user_id}` });
    }
  } else {
    if (!["cash", "upi", "online"].includes(String(trip.payment)) || trip.status !== "completed" || trip.payment_status === "paid") throw new ApiError("Only a completed ride that is still due can be marked collected.", 409);
    check(await db().from("trips").update({ payment_status: "paid" }).eq("id", id).select("id").single());
  }
  void kickConsumers();
  await audit(admin, `ride.${input.action}`, "ride", id, { code: trip.code, status: trip.status, paymentStatus: trip.payment_status, amountPaise: amount, reason: input.reason, ...extra });
  return detail(id, admin);
});

const edit = z.object({
  pickupName: z.string().trim().min(2).max(120).optional(),
  dropName: z.string().trim().min(2).max(120).optional(),
  payment: z.enum(["cash", "upi", "online"]).optional(),
  reason: z.string().trim().min(3, "Add a short reason.").max(120),
});

// Fixes a ride's details. Place names only (the map points stay), and payment before it is paid.
export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const admin = await requireAdmin("rides.manage");
  mustId(id, "Ride");
  const input = await readBody(req, edit);
  const trip = check(await db().from("trips").select("*").eq("id", id).maybeSingle(), "Ride not found.") as Row;
  const fields: Record<string, unknown> = {};
  if (input.pickupName && input.pickupName !== trip.pickup_name) fields.pickup_name = input.pickupName;
  if (input.dropName && input.dropName !== trip.drop_name) fields.drop_name = input.dropName;
  if (input.payment && input.payment !== trip.payment) {
    if (trip.payment_status !== "due" || !["searching", "assigned", "arrived", "on_trip", "completed"].includes(trip.status)) throw new ApiError("Payment can change only while the fare is still due.", 409);
    fields.payment = input.payment;
  }
  if (!Object.keys(fields).length) throw new ApiError("Nothing changed.", 400);
  check(await db().from("trips").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id).select("id").single());
  await audit(admin, "ride.update", "ride", id, { code: trip.code, before: Object.fromEntries(Object.keys(fields).map((key) => [key, trip[key]])), after: fields, reason: input.reason });
  return detail(id, admin);
});

// Removes a cancelled or expired ride that never moved money, with everything hanging off it.
export const DELETE = route<{ id: string }>(async (req, { id }) => {
  const admin = await requireAdmin("rides.manage");
  mustId(id, "Ride");
  const reason = (req.nextUrl.searchParams.get("reason") ?? "").trim().slice(0, 120);
  if (reason.length < 3) throw new ApiError("Add a short reason.", 400);
  const trip = check(await db().from("trips").select("*").eq("id", id).maybeSingle(), "Ride not found.") as Row;
  if (!(await deletable(trip))) throw new ApiError("Only cancelled or expired rides with no payments can be deleted. Cancel or refund this ride instead.", 409);
  await db().from("coupon_redemptions").delete().eq("trip_id", id);
  check(await db().from("trips").delete().eq("id", id).select("id").single());
  await audit(admin, "ride.delete", "ride", id, { snapshot: rideLine(trip), reason });
  return { ok: true, code: trip.code };
});
