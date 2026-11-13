import { z } from "zod";
import { ApiError, check, mustId, paise, readBody, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { people } from "@/lib/server/data";
import { controls, db } from "@/lib/server/db";

async function detail(id: string) {
  const trip = check(await db().from("seat_trips").select("*").eq("id", id).maybeSingle(), "Trip not found.");
  const [finance, seats, bookings, position, incidents, offline] = await Promise.all([
    controls().from("trip_finance").select("*").eq("id", id).maybeSingle(),
    db().from("seat_trip_seats").select("seat_id,label,seat_row,seat_col,is_window,price_paise,state,gender,booking_id,held_until").eq("trip_id", id).order("seat_row").order("seat_col"),
    controls().from("seat_booking_facts").select("id,pnr,status,seats,seat_ids,paid_paise,fare_paise,profit_paise,refund_paise,rider_id,phone,created_at,paid_with").eq("trip_id", id).order("created_at"),
    db().from("seat_trip_positions").select("latitude,longitude,speed_kmh,moved_at,updated_at").eq("trip_id", id).maybeSingle(),
    db().from("safety_incidents").select("id,code,kind,status,created_at").eq("trip_id", id).order("created_at", { ascending: false }),
    db().from("seat_offline_passengers").select("seat_id,gender,note,created_at").eq("trip_id", id),
  ]);
  const who = await people([trip.captain_id, ...(bookings.data ?? []).map((row) => row.rider_id)]);
  const { data: car } = await db().from("seat_cars").select("layout_kind").eq("id", trip.car_id).maybeSingle();
  const notes = new Map((offline.data ?? []).map((row) => [row.seat_id, row]));
  return {
    trip: { ...trip, ...(finance.data ?? {}), layout_kind: car?.layout_kind ?? null },
    captain: who.get(trip.captain_id) ?? null,
    seats: (seats.data ?? []).map((seat) => ({ ...seat, offline_note: seat.state === "blocked" ? (notes.get(seat.seat_id)?.note ?? null) : null })),
    bookings: (bookings.data ?? []).map((row) => ({ ...row, rider: who.get(row.rider_id) ?? null })),
    position: position.data,
    incidents: incidents.data ?? [],
  };
}

export const GET = route<{ id: string }>(async (_req, { id }) => {
  await requireAdmin("view.trips");
  return detail(mustId(id, "Trip"));
});

const patch = z.object({
  seats: z.array(z.object({ seatId: z.string().regex(/^[A-Z0-9]{1,4}$/), price: z.number().min(50, "Seat prices start at ₹50.").max(10000, "Seat prices stay under ₹10,000.") })).max(7).optional(),
  womenFriendly: z.boolean().optional(),
  // Frees seats the captain marked as sold outside the app, so travellers can book them again.
  unblock: z.array(z.string().regex(/^[A-Z0-9]{1,4}$/)).max(7).optional(),
});

// Only open seats on a scheduled trip can be repriced, so no traveller's fare changes after booking.
export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const admin = await requireAdmin("trips.manage");
  mustId(id, "Trip");
  const input = await readBody(req, patch);
  const trip = check(await db().from("seat_trips").select("status").eq("id", id).maybeSingle(), "Trip not found.");
  if (input.unblock?.length) {
    if (trip.status !== "scheduled" && trip.status !== "on_trip") throw new ApiError("This trip has ended.", 409);
    const freed = check(await db().rpc("seat_unblock", { p_trip: id, p_captain: null, p_seats: input.unblock }));
    await audit(admin, "trip.unblock_seats", "seat_trip", id, { seats: input.unblock, freed });
    return { freed, ...(await detail(id)) };
  }
  if (trip.status !== "scheduled") throw new ApiError("Only scheduled trips can be changed.", 409);
  const changed: string[] = [];
  for (const seat of input.seats ?? []) {
    const saved = await db().from("seat_trip_seats").update({ price_paise: paise(seat.price) }).eq("trip_id", id).eq("seat_id", seat.seatId).eq("state", "available").select("seat_id").maybeSingle();
    if (saved.data) changed.push(seat.seatId);
  }
  if (input.womenFriendly !== undefined) check(await db().from("seat_trips").update({ women_friendly: input.womenFriendly }).eq("id", id).select("id").single());
  await audit(admin, "trip.update", "seat_trip", id, { repriced: changed, prices: input.seats ?? [], womenFriendly: input.womenFriendly });
  return { repriced: changed, ...(await detail(id)) };
});

const action = z.object({ action: z.enum(["cancel", "start", "complete"]), reason: z.string().trim().max(160).optional() });

export const POST = route<{ id: string }>(async (req, { id }) => {
  const admin = await requireAdmin("trips.manage");
  mustId(id, "Trip");
  const input = await readBody(req, action);
  let result: unknown = null;
  if (input.action === "cancel") {
    if (!input.reason) throw new ApiError("Add the reason the travellers will see.", 400);
    result = check(await db().rpc("seat_trip_cancel", { p_trip: id, p_by: "system", p_reason: input.reason }));
  } else if (input.action === "start") {
    check(await db().rpc("seat_trip_start", { p_trip: id }));
  } else {
    result = check(await db().rpc("seat_trip_complete", { p_trip: id }));
  }
  await audit(admin, `trip.${input.action}`, "seat_trip", id, { reason: input.reason ?? null, result });
  return detail(id);
});
