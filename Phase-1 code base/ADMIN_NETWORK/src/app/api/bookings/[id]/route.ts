import { z } from "zod";
import { ApiError, check, mustId, readBody, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { activity, moneyMoved, releaseSeats, tripStops } from "@/lib/server/bookings";
import { balances, people, type Row } from "@/lib/server/data";
import { controls, db } from "@/lib/server/db";
import { refundSeatPayment } from "@/lib/server/razorpay";

// Unpaid holds that lapsed or were cancelled with no money moved can be deleted for good.
const deletable = async (booking: Row) => ["pending", "expired", "cancelled"].includes(booking.status) && !(await moneyMoved(booking.id));

async function detail(id: string) {
  const booking = check(await db().from("seat_bookings").select("*").eq("id", id).maybeSingle(), "Booking not found.");
  const [facts, trip, stops, seats, ledger, intents, coupon, tickets, incidents, trail, canDelete] = await Promise.all([
    controls().from("seat_booking_facts").select("commission_paise,captain_share_paise,kept_on_cancel_paise,profit_paise,paid_paise").eq("id", id).maybeSingle(),
    controls().from("trip_finance").select("*").eq("id", booking.trip_id).maybeSingle(),
    db().from("seat_trips").select("boarding,drops,women_friendly").eq("id", booking.trip_id).maybeSingle(),
    db().from("seat_trip_seats").select("seat_id,label,is_window,price_paise,state").eq("trip_id", booking.trip_id).in("seat_id", booking.seat_ids as string[]),
    db().from("ledger_entries").select("id,owner_id,kind,amount_paise,ref_type,note,created_at").eq("ref_id", id).order("id"),
    db().from("payment_intents").select("id,amount_paise,status,razorpay_order_id,razorpay_payment_id,created_at,updated_at").eq("ref_id", id).order("created_at"),
    booking.coupon_id ? db().from("coupons").select("id,code,title").eq("id", booking.coupon_id).maybeSingle() : Promise.resolve({ data: null }),
    db().from("support_tickets").select("id,code,topic,status,created_at").eq("seat_booking_id", id).order("created_at", { ascending: false }),
    db().from("safety_incidents").select("id,code,kind,status,created_at").eq("booking_id", id).order("created_at", { ascending: false }),
    activity(id),
    deletable(booking),
  ]);
  const who = await people([booking.rider_id, trip.data?.captain_id]);
  const wallet = await balances([booking.rider_id]);
  return {
    booking: { ...booking, ...(facts.data ?? {}) },
    trip: trip.data ? { ...trip.data, women_friendly: stops.data?.women_friendly ?? false } : null,
    stops: { boarding: stops.data?.boarding ?? [], drops: stops.data?.drops ?? [] },
    seats: seats.data ?? [],
    rider: who.get(booking.rider_id) ?? null,
    riderWallet: wallet.get(booking.rider_id) ?? 0,
    captain: trip.data ? (who.get(trip.data.captain_id) ?? null) : null,
    ledger: ledger.data ?? [],
    payments: intents.data ?? [],
    coupon: coupon.data,
    tickets: tickets.data ?? [],
    incidents: incidents.data ?? [],
    activity: trail,
    canDelete,
  };
}

export const GET = route<{ id: string }>(async (_req, { id }) => {
  await requireAdmin("view.bookings");
  return detail(mustId(id, "Booking"));
});

const action = z.object({ action: z.enum(["cancel", "board"]), reason: z.string().trim().max(160).optional() });

// A desk cancellation is a system cancellation: the traveller gets the money collected, not a passenger time band.
export const POST = route<{ id: string }>(async (req, { id }) => {
  const admin = await requireAdmin("bookings.manage");
  mustId(id, "Booking");
  const input = await readBody(req, action);
  if (input.action === "cancel") {
    if (!input.reason) throw new ApiError("Add the reason for cancelling.", 400);
    const refund = check(await db().rpc("seat_cancel", { p_booking: id, p_by: "system" }));
    const saved = await db().from("seat_bookings").select("gateway_refund_paise").eq("id", id).maybeSingle();
    await refundSeatPayment(id, Number(saved.data?.gateway_refund_paise ?? 0));
    await audit(admin, "booking.cancel", "seat_booking", id, { reason: input.reason, refundPaise: Number(refund) });
    return { refundPaise: Number(refund), ...(await detail(id)) };
  }
  const saved = await db().from("seat_bookings").update({ boarded_at: new Date().toISOString() }).eq("id", id).eq("status", "confirmed").is("boarded_at", null).select("id").maybeSingle();
  if (!saved.data) throw new ApiError("Only confirmed bookings that have not boarded can be marked boarded.", 409);
  await audit(admin, "booking.board", "seat_booking", id);
  return detail(id);
});

const edit = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number.").optional(),
  email: z.string().trim().email("Check the email format.").optional().or(z.literal("")),
  travellers: z.array(z.object({ seatId: z.string(), name: z.string().trim().min(2, "Enter each traveller's name.").max(60), age: z.number().int().min(1, "Check the traveller's age.").max(99) })).max(4).optional(),
  boardingId: z.string().optional(),
  dropId: z.string().optional(),
  reason: z.string().trim().min(3, "Add a short reason.").max(120),
});

// Fixes contact details, traveller names and ages, or the stops. Seats and genders stay as booked
// because they decide which seats are women-only.
export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const admin = await requireAdmin("bookings.manage");
  mustId(id, "Booking");
  const input = await readBody(req, edit);
  const booking = check(await db().from("seat_bookings").select("*").eq("id", id).maybeSingle(), "Booking not found.") as Row;
  if (!["pending", "confirmed"].includes(booking.status)) throw new ApiError("Only an upcoming booking can be edited.", 409);
  const fields: Record<string, unknown> = {};
  if (input.phone && input.phone !== booking.phone) fields.phone = input.phone;
  if (input.email !== undefined && (input.email || null) !== booking.email) fields.email = input.email || null;
  if (input.travellers) {
    const current = booking.travellers as { seatId: string; name: string; age: number; gender: string }[];
    const next = current.map((person) => {
      const change = input.travellers!.find((item) => item.seatId === person.seatId);
      return change ? { ...person, name: change.name, age: change.age } : person;
    });
    if (JSON.stringify(next) !== JSON.stringify(current)) fields.travellers = next;
  }
  if (input.boardingId || input.dropId) {
    const { trip, boarding, drop } = await tripStops(booking.trip_id, input.boardingId ?? booking.boarding.id, input.dropId ?? booking.drop_point.id);
    if (trip.status !== "scheduled") throw new ApiError("The trip has started, so the stops can no longer change.", 409);
    if (boarding.id !== booking.boarding.id) fields.boarding = boarding;
    if (drop.id !== booking.drop_point.id) fields.drop_point = drop;
  }
  if (!Object.keys(fields).length) throw new ApiError("Nothing changed.", 400);
  check(await db().from("seat_bookings").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id).select("id").single());
  await audit(admin, "booking.update", "seat_booking", id, { pnr: booking.pnr, before: Object.fromEntries(Object.keys(fields).map((key) => [key, booking[key]])), after: fields, reason: input.reason });
  return detail(id);
});

export const DELETE = route<{ id: string }>(async (req, { id }) => {
  const admin = await requireAdmin("bookings.manage");
  mustId(id, "Booking");
  const reason = (req.nextUrl.searchParams.get("reason") ?? "").trim().slice(0, 120);
  if (reason.length < 3) throw new ApiError("Add a short reason.", 400);
  const booking = check(await db().from("seat_bookings").select("*").eq("id", id).maybeSingle(), "Booking not found.") as Row;
  if (!(await deletable(booking))) throw new ApiError("Only unpaid bookings that are pending, expired or cancelled can be deleted. Cancel this booking instead.", 409);
  await releaseSeats(id);
  check(await db().from("seat_bookings").delete().eq("id", id).select("id").single());
  await audit(admin, "booking.delete", "seat_booking", id, { snapshot: { pnr: booking.pnr, trip_id: booking.trip_id, phone: booking.phone, seat_ids: booking.seat_ids, travellers: booking.travellers, status: booking.status, total_paise: booking.total_paise }, reason });
  return { ok: true, pnr: booking.pnr };
});
