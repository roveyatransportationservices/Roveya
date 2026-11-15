import { buildCabin, kindForCabin, validateCabin, type CabinLayout } from "../cabinPlan";
import { layoutInfo, seatDeltaRupees, type SeatCell } from "../rules";
import { ApiError, check } from "./api";
import { db } from "./db";

type TripSeatRow = {
  seat_id: string;
  label: string;
  seat_row: number;
  seat_col: number;
  is_window: boolean;
  price_paise: number;
  state: string;
};

// Saves the captain's cabin and moves every open trip onto the same seats.
// A booked seat that would disappear blocks the change.
export async function saveCabin(captainId: string, input: { seatCount?: number; seats?: SeatCell[] }) {
  const car = check(await db().from("seat_cars").select("id,layout_kind,seats").eq("captain_id", captainId).maybeSingle(), "Add your car first.");
  const current = Array.isArray(car.seats) ? (car.seats as SeatCell[]) : buildCabin(6);
  const seats = input.seats?.length ? input.seats : buildCabin(input.seatCount ?? current.length, current);
  const layout = kindForCabin(seats);
  const problem = validateCabin(layout, seats);
  if (problem) throw new ApiError(problem, 400);

  const trips = check(await db().from("seat_trips").select("id,status").eq("car_id", car.id).in("status", ["scheduled", "on_trip"]));
  for (const trip of trips) await alignTrip(trip, seats, layout);

  const fields: Record<string, unknown> = { seats };
  if (layout !== "flex") fields.layout_kind = layout;
  const saved = await db().from("seat_cars").update(fields).eq("id", car.id).select("id,layout_kind,seats,status").maybeSingle();
  if (saved.error && layout === "flex") {
    const retry = await db().from("seat_cars").update({ seats }).eq("id", car.id).select("id,layout_kind,seats,status").maybeSingle();
    if (retry.error) check(retry);
    return shape(retry.data, layout, seats);
  }
  return shape(check(saved, "Car not found."), layout, seats);
}

function shape(row: { id: string; layout_kind?: string; status?: string } | null, layout: CabinLayout, seats: SeatCell[]) {
  return {
    car: {
      id: row?.id,
      layout,
      layoutTitle: layoutInfo(layout).title,
      seatCount: seats.length,
      seats,
      status: row?.status ?? "active",
    },
  };
}

async function alignTrip(trip: { id: string }, seats: SeatCell[], layout: CabinLayout) {
  const existing = check(await db().from("seat_trip_seats").select("seat_id,label,seat_row,seat_col,is_window,price_paise,state").eq("trip_id", trip.id));
  const removed = existing.filter((seat) => seat.state !== "available" && !seats.some((next) => next.row === seat.seat_row && next.col === seat.seat_col));
  if (removed.length) throw new ApiError("A traveller is sitting in a seat that this layout removes. Finish that booking first.", 409);

  const base = Math.min(...existing.map((seat) => seat.price_paise / 100), 500);
  for (const seat of seats) {
    const kept = existing.find((item) => item.seat_row === seat.row && item.seat_col === seat.col);
    if (kept) {
      if (kept.seat_id !== seat.id) await moveSeatId(trip.id, kept.seat_id, seat.id);
      check(await db().from("seat_trip_seats").update({ label: seat.label, is_window: seat.window, seat_row: seat.row, seat_col: seat.col }).eq("trip_id", trip.id).eq("seat_id", seat.id).select("seat_id").single());
      continue;
    }
    const price = Math.max(99, base + seatDeltaRupees(seat, layout === "flex" ? "seat6" : layout));
    check(
      await db()
        .from("seat_trip_seats")
        .insert({ trip_id: trip.id, seat_id: seat.id, label: seat.label, seat_row: seat.row, seat_col: seat.col, is_window: seat.window, price_paise: Math.round(price * 100), state: "available" })
        .select("seat_id")
        .single(),
    );
  }
  const gone = existing.filter((seat) => seat.state === "available" && !seats.some((next) => next.row === seat.seat_row && next.col === seat.seat_col));
  if (gone.length) check(await db().from("seat_trip_seats").delete().eq("trip_id", trip.id).in("seat_id", gone.map((seat) => seat.seat_id)).select("seat_id"));
}

async function moveSeatId(tripId: string, from: string, to: string) {
  check(await db().from("seat_trip_seats").update({ seat_id: to }).eq("trip_id", tripId).eq("seat_id", from).select("seat_id").single());
  const bookings = await db().from("seat_bookings").select("id,seat_ids").eq("trip_id", tripId);
  if (bookings.error || !bookings.data) return;
  for (const booking of bookings.data as { id: string; seat_ids: string[] | null }[]) {
    const ids = booking.seat_ids ?? [];
    if (!ids.includes(from)) continue;
    await db().from("seat_bookings").update({ seat_ids: ids.map((id) => (id === from ? to : id)) }).eq("id", booking.id);
  }
}

export type { TripSeatRow };
