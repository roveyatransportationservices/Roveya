import { randomInt } from "node:crypto";
import { ApiError, check } from "./api";
import type { Row } from "./data";
import { tripStops } from "./bookings";
import { db } from "./db";
import { driveMinutes, fareBounds, pointsFor, seatDeltaRupees, suggestedFare, type CarClass, type SeatCell } from "../rules";
import { passengerQuote } from "../refundPolicy";
import { LOOKUP_MISS, lookupQuery, publicLookupView } from "../publicLookup";
import { saveCabin } from "./cabin";
import { notify } from "./bookings";
import { noticeCopy } from "../delivery";
import { carpoolReceipt, refundNotice } from "../receipt";
import { rememberReceipt } from "./deliveryStore";
import { beginGatewayAttempt, refundSeatPayment, settlePendingRefunds } from "./razorpay";

type Stop = { id: string; name: string; landmark?: string; offsetMin?: number; time?: string; dayOffset?: number };

const rupees = (paise: unknown) => Math.round(Number(paise ?? 0)) / 100;
const istClock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function stops(list: unknown, departAt: string): Stop[] {
  return (Array.isArray(list) ? list : []).map((stop) => {
    const row = stop as Stop;
    const at = new Date(Date.parse(departAt) + (row.offsetMin ?? 0) * 60000);
    return { id: row.id, name: row.name, landmark: row.landmark ?? "", time: istClock(at.toISOString()), dayOffset: row.dayOffset ?? 0, offsetMin: row.offsetMin ?? 0 };
  });
}

function seatState(row: Row): "available" | "female" | "male" | "booked" | "bookedFemale" {
  if (row.state === "available" && row.gender === "Female") return "female";
  if (row.state === "available" && row.gender === "Male") return "male";
  if (row.state === "booked" && row.gender === "Female") return "bookedFemale";
  if (row.state === "available") return "available";
  return "booked";
}

async function seatsOf(tripId: string) {
  const { data } = await db().from("seat_trip_seats").select("seat_id,label,seat_row,seat_col,is_window,price_paise,state,gender").eq("trip_id", tripId).order("seat_row").order("seat_col");
  return (data ?? []) as Row[];
}

async function carOf(carId: string) {
  const { data } = await db().from("seat_cars").select("*").eq("id", carId).maybeSingle();
  return data as Row | null;
}

function passengerTrip(trip: Row, seats: Row[], car: Row | null, captain: Row | null) {
  const prices = seats.map((seat) => rupees(seat.price_paise)).filter((price) => price > 0);
  const depart = String(trip.depart_at);
  const arrive = String(trip.arrive_at ?? trip.depart_at);
  return {
    id: trip.id,
    fromId: trip.from_city,
    toId: trip.to_city,
    date: depart.slice(0, 10),
    operator: captain?.name ?? "ROVEYA captain",
    operatorRating: Number(captain?.rating ?? 5),
    operatorReviews: 0,
    car: car?.make_model ?? "Car",
    carClass: (car?.car_class as CarClass) ?? "Sedan",
    ac: car?.ac !== false,
    layout: car?.layout_kind ?? "seat6",
    carAge: car?.year ? String(new Date().getFullYear() - Number(car.year)) : "",
    departAt: depart,
    arriveAt: arrive,
    durationMin: Math.max(1, Math.round((Date.parse(arrive) - Date.parse(depart)) / 60000)) || driveMinutes(String(trip.from_city), String(trip.to_city)),
    rating: Number(captain?.rating ?? 5),
    reviews: 0,
    fare: prices.length ? Math.min(...prices) : rupees(trip.fare_paise),
    seats: seats.map((seat) => ({ id: seat.seat_id, label: seat.label, row: seat.seat_row, col: seat.seat_col, price: rupees(seat.price_paise), state: seatState(seat), window: Boolean(seat.is_window) })),
    boarding: stops(trip.boarding, depart),
    drops: stops(trip.drops, depart),
    tags: [],
    amenities: Array.isArray(car?.amenities) ? car.amenities : [],
    womenFriendly: Boolean(trip.women_friendly),
    assured: false,
  };
}

async function loadTrip(id: string) {
  const { data } = await db().from("seat_trips").select("*").eq("id", id).maybeSingle();
  if (!data) throw new ApiError("That trip was not found.", 404);
  const trip = data as Row;
  const [seats, car, captain] = await Promise.all([
    seatsOf(id),
    carOf(String(trip.car_id)),
    db().from("captains").select("name,rating,phone").eq("user_id", trip.captain_id).maybeSingle().then((result) => result.data as Row | null),
  ]);
  return { trip, seats, car, captain, view: passengerTrip(trip, seats, car, captain) };
}

export async function searchSeatTrips(fromId: string, toId: string, date: string) {
  const start = new Date(`${date}T00:00:00+05:30`).toISOString();
  const end = new Date(`${date}T23:59:59+05:30`).toISOString();
  const { data } = await db().from("seat_trips").select("*").eq("from_city", fromId).eq("to_city", toId).eq("status", "scheduled").gte("depart_at", start).lte("depart_at", end).order("depart_at").limit(40);
  const trips = [];
  for (const row of (data ?? []) as Row[]) {
    const packed = await loadTrip(String(row.id));
    if (packed.view.seats.some((seat) => seat.state === "available" || seat.state === "female" || seat.state === "male")) trips.push(packed.view);
  }
  return { trips };
}

export async function seatTrip(id: string) {
  return { trip: (await loadTrip(id)).view };
}

function bookingView(row: Row, tripView: ReturnType<typeof passengerTrip>, tripStatus: string) {
  const status = row.status === "cancelled" ? "Cancelled" : row.status === "completed" ? "Completed" : row.status === "confirmed" || row.status === "boarded" ? "Upcoming" : "Pending";
  const chosen = new Set((row.seat_ids as string[]) ?? []);
  const quote = passengerQuote({
    status: String(row.status ?? ""),
    tripStatus,
    departAt: String(tripView.departAt ?? ""),
    walletCollectedPaise: Number(row.wallet_collected_paise ?? 0),
    gatewayCollectedPaise: Number(row.gateway_collected_paise ?? 0),
    deskCollectedPaise: Number(row.desk_collected_paise ?? 0),
    walletRefundedPaise: Number(row.wallet_refunded_paise ?? 0),
    gatewayRefundPaise: Number(row.gateway_refund_paise ?? 0),
    securePaise: Number(row.secure_paise ?? 0),
    secured: Boolean(row.secured),
    storedRefundPaise: Number(row.refund_paise ?? 0),
  });
  return {
    id: row.id,
    pnr: row.pnr,
    status,
    payable: rupees(row.total_paise ?? row.paid_paise),
    fare: rupees(row.fare_paise ?? row.total_paise),
    fee: rupees(row.fee_paise),
    gst: rupees(row.gst_paise),
    secure: rupees(row.secure_paise),
    discount: rupees(row.discount_paise),
    cashUsed: rupees(row.cash_paise),
    holdUntil: row.hold_until ?? null,
    total: rupees(row.total_paise ?? row.paid_paise),
    paidWith: row.paid_with ?? "",
    secured: Boolean(row.secured),
    phone: row.phone,
    bookedAt: row.created_at,
    refund: rupees(row.refund_paise),
    refundQuote: quote.available ? { percent: quote.percent, amount: quote.amount, refundPaise: quote.refundPaise, note: quote.note, kind: quote.kind, securePaise: quote.securePaise } : null,
    refundNote: quote.note,
    travellers: row.travellers ?? [],
    boarding: row.boarding,
    drop: row.drop,
    seats: tripView.seats.filter((seat) => chosen.has(seat.id)),
    trip: tripView,
    captain: null,
  };
}

async function ownBooking(userId: string, id: string) {
  const { data } = await db().from("seat_bookings").select("*").eq("id", id).eq("rider_id", userId).maybeSingle();
  if (!data) throw new ApiError("That booking was not found.", 404);
  const packed = await loadTrip(String((data as Row).trip_id));
  return { row: data as Row, view: bookingView(data as Row, packed.view, String(packed.trip.status ?? "")), packed };
}

export async function holdSeatBooking(userId: string, body: Record<string, unknown>) {
  const travellers = Array.isArray(body.travellers) ? body.travellers : [];
  if (!travellers.length) throw new ApiError("Choose at least one seat.", 400);
  const phone = String(body.phone ?? "");
  const { boarding, drop } = await tripStops(String(body.tripId ?? ""), String(body.boardingId ?? ""), String(body.dropId ?? ""));
  const held = check(
    await db().rpc("seat_book", {
      p_rider: userId,
      p_trip: boarding && drop ? String(body.tripId) : "",
      p_travellers: travellers,
      p_boarding: boarding,
      p_drop: drop,
      p_phone: phone,
      p_email: body.email || null,
      p_secured: Boolean(body.secured),
      p_coupon: body.coupon ? String(body.coupon) : null,
      p_discount: 0,
      p_use_cash: Boolean(body.useCash),
    }),
  ) as unknown as Row;
  const packed = await loadTrip(String(held.trip_id ?? body.tripId));
  return { booking: bookingView(held, packed.view, String(packed.trip.status ?? "")) };
}

export async function paySeatBooking(userId: string, id: string, method: string, origin: string) {
  const { row } = await ownBooking(userId, id);
  if (row.status === "confirmed" || row.status === "completed") return { status: "confirmed", booking: (await ownBooking(userId, id)).view };
  if (method !== "online") throw new ApiError("This ticket is paid online. Cash is not accepted.", 400);
  const amount = Number(row.total_paise ?? 0);
  if (!Number.isFinite(amount) || amount < 100) throw new ApiError("This ticket has no amount to pay.", 400);
  await settlePendingRefunds();
  const opened = await beginGatewayAttempt({ ownerId: userId, purpose: "seat_booking", refId: id, receipt: String(row.pnr ?? id) });
  if (opened.status === "paid") return { status: "confirmed", booking: (await ownBooking(userId, id)).view };
  return { status: "payment_required", payment: { intentId: opened.intentId, checkoutUrl: `${origin}/pay/${opened.intentId}` } };
}

export async function listSeatBookings(userId: string) {
  const { data } = await db().from("seat_bookings").select("*").eq("rider_id", userId).order("created_at", { ascending: false }).limit(40);
  const bookings = [];
  for (const row of (data ?? []) as Row[]) {
    const packed = await loadTrip(String(row.trip_id)).catch(() => null);
    if (packed) bookings.push(bookingView(row, packed.view, String(packed.trip.status ?? "")));
  }
  return { bookings };
}

export async function oneSeatBooking(userId: string, id: string) {
  return { booking: (await ownBooking(userId, id)).view };
}

export async function cancelSeatBooking(userId: string, id: string) {
  await ownBooking(userId, id);
  const refund = check(await db().rpc("seat_cancel", { p_booking: id, p_by: "rider" }));
  const saved = await db().from("seat_bookings").select("gateway_refund_paise,refund_paise").eq("id", id).maybeSingle();
  const paise = Number(saved.data?.refund_paise ?? (refund as Row).refund_paise ?? refund ?? 0);
  const gateway = await refundSeatPayment(id, Number(saved.data?.gateway_refund_paise ?? 0));
  await settlePendingRefunds();
  const booking = (await ownBooking(userId, id)).view;
  const notice = refundNotice(gateway.status, paise, Number(saved.data?.gateway_refund_paise ?? 0));
  if (notice) {
    const copy = noticeCopy(notice.kind, String(booking.pnr ?? ""));
    void notify(userId, "rider", copy.title, copy.body, { bookingId: id, kind: notice.kind, eventId: `seat:${id}:${notice.kind}` });
  }
  return { refund: rupees(paise), booking };
}

export async function reviewSeatBooking(userId: string, id: string, stars: number, quote: string) {
  const { row } = await ownBooking(userId, id);
  const score = Math.round(stars);
  if (score < 1 || score > 5) throw new ApiError("Choose 1 to 5 stars.", 400);
  await db().from("trip_ratings").insert({ trip_id: row.trip_id, by_role: "rider", stars: score, tags: [], note: quote.slice(0, 500) });
  return { ok: true };
}

export async function lookupSeatBooking(pnr: string, phone: string) {
  const query = lookupQuery(pnr, phone);
  if (!query) throw new ApiError(LOOKUP_MISS, 404);
  const { data } = await db().from("seat_bookings").select("*").eq("pnr", query.pnr).or(`phone.eq.${query.phone},phone.eq.+91${query.phone}`).maybeSingle();
  if (!data) throw new ApiError(LOOKUP_MISS, 404);
  const packed = await loadTrip(String((data as Row).trip_id));
  const full = bookingView(data as Row, packed.view, String(packed.trip.status ?? ""));
  return { booking: publicLookupView(full) };
}

export async function trackSeatBooking(userId: string, id: string) {
  const { packed } = await ownBooking(userId, id);
  const position = await db().from("seat_trip_positions").select("latitude,longitude,heading,speed_kmh,updated_at").eq("trip_id", packed.trip.id).maybeSingle();
  const from = pointsFor(String(packed.trip.from_city))[0];
  const to = pointsFor(String(packed.trip.to_city))[0];
  return {
    trip: { code: packed.trip.code, status: packed.trip.status, from: packed.trip.from_city, to: packed.trip.to_city, departAt: packed.trip.depart_at, arriveAt: packed.trip.arrive_at, fromPoint: null, toPoint: null, boardingName: from?.name, dropName: to?.name },
    car: packed.car ? { name: packed.car.make_model, plate: packed.car.plate, color: packed.car.color } : null,
    captain: packed.captain ? { firstName: String(packed.captain.name).split(" ")[0] } : null,
    position: position.data ? { latitude: position.data.latitude, longitude: position.data.longitude, heading: position.data.heading ?? 0, speedKmh: position.data.speed_kmh ?? 0, at: position.data.updated_at } : null,
  };
}

async function captainCar(userId: string) {
  const { data } = await db().from("seat_cars").select("*").eq("captain_id", userId).maybeSingle();
  return data as Row | null;
}

function carView(row: Row | null) {
  if (!row) return null;
  const seats = (Array.isArray(row.seats) ? row.seats : []) as SeatCell[];
  const layout = row.layout_kind || "seat6";
  return {
    id: row.id,
    makeModel: row.make_model,
    carClass: row.car_class,
    plate: row.plate,
    color: row.color,
    year: Number(row.year),
    ac: row.ac !== false,
    amenities: row.amenities ?? [],
    layout,
    seatCount: seats.length,
    seats,
    status: row.status ?? "review",
    reviewNote: row.review_note ?? null,
  };
}

export async function seatCaptainMe(userId: string) {
  const { data } = await db().from("captains").select("*").eq("user_id", userId).maybeSingle();
  if (!data) throw new ApiError("Finish carpool registration to continue.", 403);
  const car = await captainCar(userId);
  const { data: wallet } = await db().from("wallets").select("balance_paise").eq("owner_id", userId).maybeSingle();
  const planRow = await db().from("platform_settings").select("value").eq("key", `captain_plan_${userId}`).maybeSingle();
  let plan = null;
  try {
    plan = planRow.data?.value ? JSON.parse(String(planRow.data.value)) : null;
  } catch {
    plan = null;
  }
  return { captain: data, car: carView(car), documents: [], plan, balance: rupees(wallet?.balance_paise) };
}

export async function registerSeatCaptain(userId: string, phone: string, body: Record<string, unknown>) {
  const existing = await db().from("captains").select("*").eq("user_id", userId).maybeSingle();
  const carInput = (body.car ?? {}) as Record<string, unknown>;
  const seats = (Array.isArray(carInput.seats) ? carInput.seats : []) as SeatCell[];
  if (!existing.data) {
    const account = String(body.accountNumber ?? "");
    const inserted = await db().from("captains").insert({
      user_id: userId,
      captain_code: `R${randomInt(100000, 999999)}`,
      phone: phone.replace(/\D/g, "").slice(-10),
      name: String(body.name ?? "").trim(),
      dob: body.dob,
      gender: body.gender,
      email: body.email || null,
      city: body.city,
      vehicle: "cab",
      vehicle_no: String(carInput.plate ?? "").toUpperCase(),
      vehicle_model: carInput.makeModel,
      vehicle_color: carInput.color,
      vehicle_year: String(carInput.year ?? ""),
      bank_holder: body.bankHolder,
      bank_last4: account.slice(-4),
      ifsc: String(body.ifsc ?? "").toUpperCase(),
      upi: body.upi || null,
      emergency_name: body.emergencyName,
      emergency_phone: body.emergencyPhone,
      status: "review",
      service: "seats",
      review_since: new Date().toISOString(),
    }).select("*").single();
    if (inserted.error) throw new ApiError("Registration could not be saved. Check the details and try again.", 400);
  }
  const have = await captainCar(userId);
  if (!have) {
    await db().from("seat_cars").insert({
      captain_id: userId,
      make_model: carInput.makeModel,
      car_class: carInput.carClass,
      plate: String(carInput.plate ?? "").toUpperCase(),
      color: carInput.color,
      year: Number(carInput.year),
      ac: carInput.ac !== false,
      amenities: carInput.amenities ?? [],
      layout_kind: carInput.layout || "seat6",
      seats,
      status: "review",
    });
  }
  if (body.payoutCycle) {
    const start = new Date();
    await db().from("platform_settings").upsert({ key: `captain_plan_${userId}`, value: JSON.stringify({ cycle: body.payoutCycle, pendingCycle: null, periodStart: start.toISOString(), periodEnd: start.toISOString() }), updated_at: new Date().toISOString() });
  }
  return seatCaptainMe(userId);
}

export async function patchSeatCar(userId: string, body: Record<string, unknown>) {
  const seats = Array.isArray(body.seats) ? (body.seats as SeatCell[]) : undefined;
  const seatCount = typeof body.seatCount === "number" ? body.seatCount : undefined;
  if (!seatCount && !seats?.length) throw new ApiError("Say how many seats the car has.", 400);
  return saveCabin(userId, { seats, seatCount });
}

export async function fareHint(fromId: string, toId: string, userId: string) {
  const car = await captainCar(userId);
  const carClass = (car?.car_class as CarClass) ?? "Sedan";
  return { suggested: suggestedFare(fromId, toId, carClass), bounds: fareBounds(fromId, toId), durationMin: driveMinutes(fromId, toId), boarding: pointsFor(fromId), drops: pointsFor(toId) };
}

function captainSummary(trip: Row, seats: Row[]) {
  const depart = String(trip.depart_at);
  const arrive = String(trip.arrive_at ?? trip.depart_at);
  const booked = seats.filter((seat) => seat.state === "booked" || seat.state === "blocked").length;
  return {
    id: trip.id,
    code: trip.code,
    fromId: trip.from_city,
    toId: trip.to_city,
    date: depart.slice(0, 10),
    departAt: depart,
    arriveAt: arrive,
    durationMin: Math.max(1, Math.round((Date.parse(arrive) - Date.parse(depart)) / 60000)),
    status: trip.status,
    fare: rupees(trip.fare_paise) || (seats[0] ? rupees(seats[0].price_paise) : 0),
    seatsLeft: seats.filter((seat) => seat.state === "available").length,
    seats: seats.map((seat) => ({ id: seat.seat_id, label: seat.label, row: seat.seat_row, col: seat.seat_col, price: rupees(seat.price_paise), state: seat.state, window: Boolean(seat.is_window) })),
    boarding: stops(trip.boarding, depart),
    drops: stops(trip.drops, depart),
    womenFriendly: Boolean(trip.women_friendly),
    booked,
    revenue: 0,
    cancelReason: trip.cancel_reason ?? null,
  };
}

async function captainDetail(userId: string, tripId: string) {
  const packed = await loadTrip(tripId);
  if (packed.trip.captain_id !== userId) throw new ApiError("That trip was not found.", 404);
  const { data: bookings } = await db().from("seat_bookings").select("*").eq("trip_id", tripId).in("status", ["confirmed", "completed", "boarded"]);
  const summary = captainSummary(packed.trip, packed.seats);
  const rows = (bookings ?? []) as Row[];
  summary.revenue = rows.reduce((sum, row) => sum + rupees(row.fare_paise ?? row.total_paise), 0);
  const sitting = (seatId: string) => {
    for (const row of rows) {
      const ids = Array.isArray(row.seat_ids) ? (row.seat_ids as string[]) : [];
      const index = ids.indexOf(seatId);
      if (index < 0) continue;
      const people = Array.isArray(row.travellers) ? (row.travellers as { name?: string; age?: number; gender?: string }[]) : [];
      const person = people[index] ?? people[0];
      const gender = person?.gender === "Female" || person?.gender === "Male" ? person.gender : null;
      return {
        gender,
        pnr: row.pnr ? String(row.pnr) : null,
        boarded: Boolean(row.boarded_at),
        passenger: person?.name && gender ? { name: String(person.name), age: Number(person.age) || 0, gender } : null,
      };
    }
    return { gender: null as "Male" | "Female" | null, pnr: null as string | null, boarded: false, passenger: null };
  };
  return {
    trip: summary,
    seats: packed.seats.map((seat) => {
      const who = sitting(String(seat.seat_id));
      return {
        id: seat.seat_id,
        label: seat.label,
        row: seat.seat_row,
        col: seat.seat_col,
        window: Boolean(seat.is_window),
        price: rupees(seat.price_paise),
        status: seat.state === "blocked" ? "offline" : seat.state === "booked" ? "booked" : seat.state === "held" ? "held" : "available",
        gender: who.gender ?? (seat.gender === "Female" || seat.gender === "Male" ? seat.gender : null),
        pnr: who.pnr,
        passenger: who.passenger,
        boarded: who.boarded,
      };
    }),
    bookings: rows.map((row) => ({
      id: row.id,
      pnr: row.pnr,
      status: row.status === "completed" ? "completed" : row.status === "cancelled" ? "cancelled" : "confirmed",
      seats: row.seat_ids ?? [],
      travellers: row.travellers ?? [],
      boarding: row.boarding ?? { name: "", landmark: "" },
      drop: row.drop ?? { name: "", landmark: "" },
      phone: row.phone,
      boarded: Boolean(row.boarded_at),
      fare: rupees(row.fare_paise ?? row.total_paise),
    })),
    totals: { booked: summary.booked, seats: packed.seats.length, fare: summary.revenue, commission: 0, earning: summary.revenue },
  };
}

export { captainDetail as captainSeatTrip };

export async function publishSeatTrip(userId: string, body: Record<string, unknown>) {
  const car = await captainCar(userId);
  if (!car) throw new ApiError("Add your car before publishing a trip.", 409);
  const { data: captain } = await db().from("captains").select("status").eq("user_id", userId).maybeSingle();
  if (captain?.status !== "active") throw new ApiError("The desk is still checking this account.", 409);
  const fare = Number(body.fare);
  const bounds = fareBounds(String(body.fromId), String(body.toId));
  if (!Number.isFinite(fare) || fare < bounds.min || fare > bounds.max) throw new ApiError(`Seat fare must be between ₹${bounds.min} and ₹${bounds.max}.`, 400);
  const depart = new Date(`${body.date}T${body.time}:00+05:30`);
  if (Number.isNaN(depart.getTime())) throw new ApiError("Pick a date and time.", 400);
  const minutes = Number(body.durationMin) || driveMinutes(String(body.fromId), String(body.toId));
  const arrive = new Date(depart.getTime() + minutes * 60000);
  const layout = (car.layout_kind as "seat4" | "seat5c" | "seat6" | "seat6c" | "seat7") || "seat6";
  const inserted = await db().from("seat_trips").insert({
    captain_id: userId,
    car_id: car.id,
    code: `RVY${randomInt(100000, 999999)}`,
    from_city: body.fromId,
    to_city: body.toId,
    depart_at: depart.toISOString(),
    arrive_at: arrive.toISOString(),
    status: "scheduled",
    boarding: body.boarding ?? [],
    drops: body.drops ?? [],
    women_friendly: Boolean(body.womenFriendly),
    base_fare_paise: Math.round(fare * 100),
  }).select("*").single();
  if (inserted.error || !inserted.data) throw new ApiError("The trip could not be published. Check the stops and try again.", 400);
  const cells = (Array.isArray(car.seats) ? car.seats : []) as SeatCell[];
  for (const seat of cells) {
    const price = Math.max(bounds.min, fare + seatDeltaRupees(seat, layout));
    await db().from("seat_trip_seats").insert({ trip_id: inserted.data.id, seat_id: seat.id, label: seat.label, seat_row: seat.row, seat_col: seat.col, is_window: seat.window, price_paise: Math.round(price * 100), state: "available" });
  }
  return captainDetail(userId, String(inserted.data.id));
}

export async function listCaptainTrips(userId: string, scope: string) {
  const { data } = await db().from("seat_trips").select("*").eq("captain_id", userId).order("depart_at", { ascending: scope !== "past" }).limit(40);
  const now = Date.now();
  const trips = [];
  for (const row of (data ?? []) as Row[]) {
    const past = row.status === "completed" || row.status === "cancelled" || Date.parse(String(row.depart_at)) < now - 12 * 3600000;
    if (scope === "past" ? !past : past && row.status !== "on_trip" && row.status !== "scheduled") continue;
    if (scope !== "past" && (row.status === "completed" || row.status === "cancelled")) continue;
    trips.push(captainSummary(row, await seatsOf(String(row.id))));
  }
  return { trips };
}

export async function captainTripAction(userId: string, tripId: string, action: string, reason?: string) {
  await captainDetail(userId, tripId);
  if (action === "cancel") {
    if (!reason) throw new ApiError("Add the reason the travellers will see.", 400);
    check(await db().rpc("seat_trip_cancel", { p_trip: tripId, p_by: "captain", p_reason: reason }));
    const { data: bookings } = await db().from("seat_bookings").select("id,gateway_refund_paise,status").eq("trip_id", tripId).eq("status", "cancelled");
    for (const booking of bookings ?? []) {
      await refundSeatPayment(String(booking.id), Number(booking.gateway_refund_paise ?? 0));
    }
    await settlePendingRefunds();
  } else if (action === "start") check(await db().rpc("seat_trip_start", { p_trip: tripId }));
  else if (action === "complete") {
    const prior = await db().from("seat_trips").select("status").eq("id", tripId).maybeSingle();
    check(await db().rpc("seat_trip_complete", { p_trip: tripId }));
    if (prior.data?.status !== "completed") {
    const { data: bookings } = await db().from("seat_bookings").select("id,pnr,rider_id,fare_paise,fee_paise,gst_paise,secure_paise,paid_with,status,travellers").eq("trip_id", tripId);
    for (const booking of bookings ?? []) {
      const people = Array.isArray(booking.travellers) ? (booking.travellers as { name?: string }[]) : [];
      const receipt = carpoolReceipt({
        bookingId: String(booking.id),
        pnr: String(booking.pnr ?? booking.id),
        passenger: people.map((person) => person.name).filter(Boolean).join(", "),
        farePaise: booking.fare_paise == null ? null : Number(booking.fare_paise),
        feePaise: booking.fee_paise == null ? null : Number(booking.fee_paise),
        gstPaise: booking.gst_paise == null ? null : Number(booking.gst_paise),
        securePaise: booking.secure_paise == null ? null : Number(booking.secure_paise),
        paidWith: booking.paid_with == null ? "" : String(booking.paid_with),
        status: booking.status == null ? "" : String(booking.status),
        completedAt: new Date().toISOString(),
      });
      void rememberReceipt(receipt);
      const ready = noticeCopy("receipt_ready", receipt.receiptNo);
      void notify(String(booking.rider_id), "rider", ready.title, ready.body, { bookingId: booking.id, kind: "receipt_ready", eventId: `seat:${booking.id}:receipt` });
    }
    }
  }
  else throw new ApiError("That action is not available.", 400);
  return captainDetail(userId, tripId);
}

export async function blockSeats(userId: string, tripId: string, seatIds: string[], gender: string | null, note?: string) {
  await captainDetail(userId, tripId);
  for (const seatId of seatIds) {
    await db().from("seat_trip_seats").update({ state: "blocked", gender }).eq("trip_id", tripId).eq("seat_id", seatId).eq("state", "available");
    if (note) await db().from("seat_offline_passengers").insert({ trip_id: tripId, seat_id: seatId, gender, note });
  }
  return captainDetail(userId, tripId);
}

export async function unblockSeats(userId: string, tripId: string, seatIds: string[]) {
  await captainDetail(userId, tripId);
  check(await db().rpc("seat_unblock", { p_trip: tripId, p_captain: userId, p_seats: seatIds }));
  return captainDetail(userId, tripId);
}

export async function boardTraveller(userId: string, tripId: string, bookingId: string, boarded: boolean) {
  await captainDetail(userId, tripId);
  await db().from("seat_bookings").update({ boarded_at: boarded ? new Date().toISOString() : null }).eq("id", bookingId).eq("trip_id", tripId);
  return captainDetail(userId, tripId);
}

export async function rateTraveller(userId: string, tripId: string, bookingId: string, stars: number) {
  await captainDetail(userId, tripId);
  const score = Math.round(stars);
  if (score >= 1 && score <= 5) await db().from("trip_ratings").insert({ trip_id: tripId, by_role: "captain", stars: score, tags: [], note: bookingId });
  return captainDetail(userId, tripId);
}

export async function moveSeatTrip(userId: string, tripId: string, body: Record<string, unknown>) {
  await captainDetail(userId, tripId);
  await db().from("seat_trip_positions").upsert({
    trip_id: tripId,
    latitude: Number(body.latitude),
    longitude: Number(body.longitude),
    heading: Number(body.heading ?? 0),
    speed_kmh: Number(body.speedKmh ?? 0),
    updated_at: new Date().toISOString(),
  });
  return { ok: true };
}

export async function seatEarnings(userId: string) {
  const trips = await db().from("seat_trips").select("id").eq("captain_id", userId);
  const ids = ((trips.data ?? []) as Row[]).map((row) => row.id);
  if (!ids.length) return { range: "month", earned: 0, completed: 0, cancelled: 0, entries: [] };
  const { data } = await db().from("seat_bookings").select("fare_paise,total_paise,status").in("trip_id", ids).eq("status", "confirmed");
  const mine = (data ?? []) as Row[];
  const earned = mine.reduce((sum, row) => sum + rupees(row.fare_paise ?? row.total_paise), 0);
  return { range: "month", earned, completed: mine.length, cancelled: 0, entries: [] };
}
