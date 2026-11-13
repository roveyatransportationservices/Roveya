import { z } from "zod";
import { check, readBody, route, search, term } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { createSeatBooking, traveller } from "@/lib/server/bookings";
import { istStart, people, shiftIst } from "@/lib/server/data";
import { controls } from "@/lib/server/db";

const STATUSES = ["pending", "confirmed", "completed", "cancelled", "expired"];

export const GET = route(async (req) => {
  await requireAdmin("view.bookings");
  const { get, from, to, page, size } = search(req);
  let query = controls().from("seat_booking_facts").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(from, to);
  const status = get("status");
  if (status && STATUSES.includes(status)) query = query.eq("status", status);
  const needle = term(get("q"));
  if (needle) query = query.or(`pnr.ilike.%${needle}%,phone.ilike.%${needle}%,trip_code.ilike.%${needle}%`);
  const day = get("from");
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) query = query.gte("created_at", istStart(day));
  const until = get("to");
  if (until && /^\d{4}-\d{2}-\d{2}$/.test(until)) query = query.lt("created_at", istStart(shiftIst(until, 1)));
  const trip = get("trip");
  if (trip) query = query.eq("trip_id", trip);
  const rider = get("rider");
  if (rider) query = query.eq("rider_id", rider);

  const result = await query;
  const rows = check(result);
  const who = await people(rows.flatMap((row) => [row.rider_id, row.captain_id]));
  return {
    bookings: rows.map((row) => ({ ...row, rider: who.get(row.rider_id) ?? null, captain: who.get(row.captain_id) ?? null })),
    total: result.count ?? rows.length,
    page,
    size,
  };
});

const create = z.object({
  tripId: z.string().uuid("Pick the trip."),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter the passenger's 10-digit mobile number."),
  email: z.string().trim().email("Check the email format.").optional().or(z.literal("")),
  travellers: z.array(traveller).min(1, "Pick at least one seat.").max(4, "Book up to 4 seats at a time."),
  boardingId: z.string().min(1, "Pick the boarding point."),
  dropId: z.string().min(1, "Pick the drop point."),
  secured: z.boolean().default(false),
  payment: z.enum(["desk_cash", "wallet"]),
});

// The desk books Carpool Travels seats for a passenger who called in or walked up.
export const POST = route(async (req) => {
  const admin = await requireAdmin("bookings.manage");
  const input = await readBody(req, create);
  const { booking, trip } = await createSeatBooking(input);
  await audit(admin, "booking.create", "seat_booking", booking.id, { pnr: booking.pnr, trip: trip.code, seats: booking.seat_ids, phone: input.phone, payment: input.payment, totalPaise: booking.total_paise });
  return { booking: { id: booking.id, pnr: booking.pnr } };
});
