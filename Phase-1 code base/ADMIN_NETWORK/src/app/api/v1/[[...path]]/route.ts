import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api";
import {
  acceptOffer,
  bookingKeyExists,
  bookRide,
  cancelRide,
  captainMe,
  captainTripAction,
  currentCaptainTrip,
  currentOffer,
  moveCaptain,
  nearby,
  openSession,
  passengerHistory,
  quoteRide,
  refreshSession,
  registerCaptain,
  rejectOffer,
  closeAccount,
  confirmContact,
  renameRider,
  riderMe,
  sendContactCode,
  revokeSession,
  rideForPassenger,
  road,
  sendOtp,
  setDuty,
  startRidePayment,
  verifyOtp,
} from "@/lib/server/cityRides";
import { db } from "@/lib/server/db";
import { paymentStatus } from "@/lib/server/razorpay";
import {
  blockSeats,
  boardTraveller,
  cancelSeatBooking,
  captainTripAction as captainSeatAction,
  captainSeatTrip,
  fareHint,
  holdSeatBooking,
  listCaptainTrips,
  listSeatBookings,
  lookupSeatBooking,
  moveSeatTrip,
  oneSeatBooking,
  patchSeatCar,
  paySeatBooking,
  publishSeatTrip,
  rateTraveller,
  registerSeatCaptain,
  reviewSeatBooking,
  searchSeatTrips,
  seatCaptainMe,
  seatEarnings,
  seatTrip,
  trackSeatBooking,
  unblockSeats,
} from "@/lib/server/seatsPhone";
import type { CityVehicle } from "@/lib/server/bookings";
import { allow, clientAddress, limitUnlessReplay } from "@/lib/server/rateLimit";
import {
  captainEarnings,
  captainsNearby,
  confirmDocument,
  createTicket,
  listTickets,
  prepareDocument,
  readDayBook,
  readPlace,
  registerPush,
  removePush,
  replyTicket,
  requestPayout,
  saveRating,
  saveSeatPlan,
  searchPlaces,
  seatPayoutPack,
  ticketFeedback,
  ticketThread,
  writeDayBook,
} from "@/lib/server/phoneDesk";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Cache-Control": "no-store",
};

const json = (body: unknown, status = 200, extra?: Record<string, string>) => NextResponse.json(body, { status, headers: { ...headers, ...extra } });

async function bodyOf(req: Request) {
  return (await req.json().catch(() => ({}))) as Record<string, unknown>;
}

const place = (value: unknown) => {
  const spot = value as { name?: string; latitude?: number; longitude?: number };
  return { name: String(spot?.name ?? "Pinned location"), latitude: Number(spot?.latitude), longitude: Number(spot?.longitude) };
};

async function handle(req: Request, path: string[]) {
  const key = path.join("/");
  const url = new URL(req.url);
  const auth = req.headers.get("authorization");

  const address = clientAddress(req);
  if (req.method === "POST" && key === "auth/otp/send") {
    await allow("otp-ip", address, 20, 600, "Too many tries. Wait ten minutes and try again.");
    const body = await bodyOf(req);
    return json(await sendOtp({ phone: body.phone ? String(body.phone) : undefined, email: body.email ? String(body.email) : undefined }));
  }
  if (req.method === "POST" && key === "auth/otp/verify") {
    await allow("otp-verify-ip", address, 30, 600, "Too many tries. Wait ten minutes and try again.");
    const body = await bodyOf(req);
    const app = body.app === "captain" ? "captain" : "rider";
    return json(await verifyOtp({ phone: body.phone ? String(body.phone) : undefined, email: body.email ? String(body.email) : undefined, code: String(body.code ?? "") }, app));
  }
  if (req.method === "POST" && key === "auth/contact/send") {
    const body = await bodyOf(req);
    return json(await sendContactCode((await openSession(auth)).sub, { phone: body.phone ? String(body.phone) : undefined, email: body.email ? String(body.email) : undefined }));
  }
  if (req.method === "POST" && key === "auth/contact/verify") {
    const body = await bodyOf(req);
    return json(await confirmContact((await openSession(auth)).sub, { phone: body.phone ? String(body.phone) : undefined, email: body.email ? String(body.email) : undefined, code: String(body.code ?? "") }));
  }
  if (req.method === "POST" && key === "auth/refresh") {
    await allow("refresh", address, 60, 60, "Too many session refreshes. Wait a minute and try again.");
    const body = await bodyOf(req);
    return json(await refreshSession(String(body.refreshToken ?? "")));
  }
  if (req.method === "POST" && key === "auth/logout") {
    const body = await bodyOf(req);
    return json(await revokeSession(auth, body.refreshToken ? String(body.refreshToken) : undefined));
  }
  if (req.method === "POST" && key === "auth/account/delete") {
    const who = await openSession(auth);
    const closed = await closeAccount(who.sub);
    await revokeSession(auth);
    return json(closed);
  }

  if (req.method === "GET" && key === "health") return json({ ok: true });
  if (req.method === "GET" && key === "coupons") return json({ coupons: [] });
  if (req.method === "GET" && key === "maps/search") {
    await allow("maps", address, 60, 60, "Too many place searches. Wait a minute and try again.");
    return json(await searchPlaces(url.searchParams.get("q") ?? "", { latitude: Number(url.searchParams.get("lat")), longitude: Number(url.searchParams.get("lng")) }));
  }
  const placeId = key.match(/^maps\/place\/(.+)$/);
  if (req.method === "GET" && placeId) {
    await allow("place", address, 60, 60, "Too many place lookups. Wait a minute and try again.");
    return json(await readPlace(decodeURIComponent(placeId[1])));
  }

  if (req.method === "POST" && key === "rides/quote") {
    const who = await openSession(auth, "rider");
    await allow("quote", who.sub, 30, 60, "Too many fare checks. Wait a minute and try again.");
    const body = await bodyOf(req);
    return json(await quoteRide(who.sub, place(body.pickup), place(body.drop)));
  }
  if (req.method === "GET" && key === "maps/route") {
    await allow("route", address, 60, 60, "Too many route checks. Wait a minute and try again.");
    return json(await road(url.searchParams.get("from") ?? "", url.searchParams.get("to") ?? ""));
  }

  const book = key.match(/^(bike|auto)\/rides$/);
  if (req.method === "POST" && book) {
    const who = await openSession(auth, "rider");
    const body = await bodyOf(req);
    const requestedKey = String(body.requestKey ?? req.headers.get("idempotency-key") ?? "");
    const replay = await bookingKeyExists(who.sub, requestedKey);
    await limitUnlessReplay("book", who.sub, 10, 60, "Too many booking attempts. Wait a minute and try again.", replay);
    return json(await bookRide(who.sub, book[1] as CityVehicle, String(body.quoteId ?? ""), String(body.payment ?? "cash"), requestedKey));
  }
  const ride = key.match(/^rides\/([^/]+)$/);
  if (req.method === "GET" && ride) return json(await rideForPassenger((await openSession(auth, "rider")).sub, ride[1]));
  const rate = key.match(/^rides\/([^/]+)\/rate$/);
  if (req.method === "POST" && rate) {
    const who = await openSession(auth, "rider");
    const body = await bodyOf(req);
    const tags = Array.isArray(body.tags) ? body.tags.map(String) : undefined;
    return json(await saveRating(who.sub, rate[1], "rider", Number(body.stars), tags, body.note ? String(body.note) : undefined));
  }
  const pay = key.match(/^rides\/([^/]+)\/pay$/);
  if (req.method === "POST" && pay) return json(await startRidePayment((await openSession(auth, "rider")).sub, pay[1], new URL(req.url).origin));
  const cancel = key.match(/^rides\/([^/]+)\/cancel$/);
  if (req.method === "POST" && cancel) {
    const body = await bodyOf(req);
    return json(await cancelRide((await openSession(auth, "rider")).sub, cancel[1], String(body.reason ?? "Cancelled by passenger")));
  }
  if (req.method === "GET" && key === "rider/me") return json(await riderMe((await openSession(auth, "rider")).sub));
  if (req.method === "PATCH" && key === "rider/me") {
    const body = await bodyOf(req);
    return json(await renameRider((await openSession(auth, "rider")).sub, String(body.name ?? "")));
  }
  const near = key.match(/^(bike|auto)\/captains\/nearby$/);
  if (req.method === "GET" && near) {
    await openSession(auth, "rider");
    return json(await nearby(near[1], Number(url.searchParams.get("lat")), Number(url.searchParams.get("lng"))));
  }

  if (req.method === "POST" && key === "captain/register") {
    const who = await openSession(auth, "captain");
    const rider = await db().from("riders").select("phone,email").eq("user_id", who.sub).maybeSingle();
    const body = await bodyOf(req);
    // Keep email from the signed-in rider when the form omits it.
    if (!body.email && rider.data?.email) body.email = String(rider.data.email);
    return json(await registerCaptain(who.sub, String(rider.data?.phone ?? ""), body as Record<string, string>));
  }
  if (req.method === "GET" && key === "captain/me") return json(await captainMe((await openSession(auth, "captain")).sub));
  if (req.method === "POST" && key === "captain/duty") {
    const body = await bodyOf(req);
    return json(await setDuty((await openSession(auth, "captain")).sub, Boolean(body.online), body as { latitude?: number; longitude?: number; autoAccept?: boolean }));
  }
  if (req.method === "POST" && key === "captain/location") {
    const body = await bodyOf(req);
    return json(await moveCaptain((await openSession(auth, "captain")).sub, { latitude: Number(body.latitude), longitude: Number(body.longitude), heading: Number(body.heading ?? 0) }));
  }
  if (req.method === "GET" && key === "captain/offers/current") return json(await currentOffer((await openSession(auth, "captain")).sub));
  const offer = key.match(/^captain\/offers\/([^/]+)\/(accept|reject)$/);
  if (req.method === "POST" && offer) {
    const who = (await openSession(auth, "captain")).sub;
    const body = await bodyOf(req);
    return json(offer[2] === "accept" ? await acceptOffer(who, offer[1]) : await rejectOffer(who, offer[1], body.reason ? String(body.reason) : undefined));
  }
  if (req.method === "GET" && key === "captain/trips/current") return json(await currentCaptainTrip((await openSession(auth, "captain")).sub, url.searchParams.get("last")));
  const action = key.match(/^captain\/trips\/([^/]+)\/(arrived|start|complete|collect|cancel|rate)$/);
  if (req.method === "POST" && action) {
    const body = await bodyOf(req);
    return json(await captainTripAction((await openSession(auth, "captain")).sub, action[1], action[2], {
      otp: body.otp ? String(body.otp) : undefined,
      reason: body.reason ? String(body.reason) : undefined,
      stars: body.stars != null ? Number(body.stars) : undefined,
      tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
      note: body.note ? String(body.note) : undefined,
    }));
  }
  if (req.method === "GET" && key === "rides") return json(await passengerHistory((await openSession(auth, "rider")).sub));
  if (req.method === "GET" && key === "captains/nearby") {
    await openSession(auth, "rider");
    return json(await captainsNearby(Number(url.searchParams.get("lat")), Number(url.searchParams.get("lng"))));
  }
  if (req.method === "GET" && key === "support/tickets") {
    const who = await openSession(auth);
    return json(await listTickets(who.sub, url.searchParams.get("app") === "captain" ? "captain" : "rider"));
  }
  if (req.method === "POST" && key === "support/tickets") {
    const who = await openSession(auth);
    const body = await bodyOf(req);
    const app = body.app === "captain" ? "captain" : who.app;
    return json(await createTicket(who.sub, app, String(body.topic ?? ""), String(body.message ?? ""), body.tripCode ? String(body.tripCode) : undefined));
  }
  const ticket = key.match(/^support\/tickets\/([^/]+)$/);
  if (ticket && req.method === "GET") return json(await ticketThread((await openSession(auth)).sub, ticket[1]));
  if (ticket && req.method === "POST") {
    const body = await bodyOf(req);
    return json(await replyTicket((await openSession(auth)).sub, ticket[1], String(body.message ?? "")));
  }
  const feedback = key.match(/^support\/tickets\/([^/]+)\/feedback$/);
  if (req.method === "POST" && feedback) {
    const body = await bodyOf(req);
    return json(await ticketFeedback((await openSession(auth)).sub, feedback[1], Number(body.stars), body.note ? String(body.note) : undefined));
  }
  if (req.method === "POST" && key === "push/register") {
    const who = await openSession(auth);
    const body = await bodyOf(req);
    return json(await registerPush(who.sub, who.app, String(body.token ?? ""), String(body.platform ?? "")));
  }
  if (req.method === "DELETE" && key === "push/register") {
    const who = await openSession(auth);
    const body = await bodyOf(req);
    return json(await removePush(who.sub, String(body.token ?? "")));
  }
  if (req.method === "GET" && key === "captain/day-plan") return json(await readDayBook((await openSession(auth, "captain")).sub));
  if (req.method === "PATCH" && key === "captain/day-plan") {
    const body = await bodyOf(req);
    return json(await writeDayBook((await openSession(auth, "captain")).sub, body.dayBook));
  }
  if (req.method === "GET" && (key === "wallet" || key === "captain/earnings")) {
    const who = await openSession(auth);
    const pack = await captainEarnings(who.sub);
    if (key === "wallet") return json({ balance: pack.balance, entries: pack.entries });
    return json({ commissionPct: pack.commissionPct, trips: pack.trips });
  }
  if (req.method === "POST" && key === "captain/documents") {
    const body = await bodyOf(req);
    return json(await prepareDocument((await openSession(auth, "captain")).sub, String(body.kind ?? "")));
  }
  if (req.method === "POST" && key === "captain/documents/confirm") {
    const body = await bodyOf(req);
    return json(await confirmDocument((await openSession(auth, "captain")).sub, String(body.kind ?? ""), String(body.path ?? "")));
  }
  if (req.method === "POST" && key === "captain/payouts") {
    const body = await bodyOf(req);
    return json(await requestPayout((await openSession(auth, "captain")).sub, Number(body.amount)));
  }
  if (req.method === "POST" && key === "wallet/topup") {
    const { beginCaptainWalletTopup } = await import("@/lib/server/walletTopup");
    const body = await bodyOf(req);
    return json(await beginCaptainWalletTopup((await openSession(auth, "captain")).sub, body.amountPaise ?? body.amount));
  }
  if (req.method === "GET" && key === "wallet/topup/policy") {
    const { readTopupPolicyNote } = await import("@/lib/server/walletTopup");
    await openSession(auth, "captain");
    return json(await readTopupPolicyNote());
  }

  if (req.method === "GET" && key === "seats/search") {
    await allow("seats", address, 60, 60, "Too many seat searches. Wait a minute and try again.");
    return json(await searchSeatTrips(url.searchParams.get("from") ?? "", url.searchParams.get("to") ?? "", url.searchParams.get("date") ?? ""));
  }
  const seatTripId = key.match(/^seats\/trips\/([^/]+)$/);
  if (req.method === "GET" && seatTripId) return json(await seatTrip(seatTripId[1]));
  if (req.method === "POST" && key === "seats/bookings") {
    const body = await bodyOf(req);
    return json(await holdSeatBooking((await openSession(auth, "rider")).sub, body));
  }
  if (req.method === "GET" && key === "seats/bookings") return json(await listSeatBookings((await openSession(auth, "rider")).sub));
  if (req.method === "POST" && key === "seats/bookings/lookup") {
    const body = await bodyOf(req);
    await allow("pnr", address, 10, 600, "Too many booking lookups. Wait ten minutes and try again.");
    return json(await lookupSeatBooking(String(body.pnr ?? ""), String(body.phone ?? "")));
  }
  const seatBooking = key.match(/^seats\/bookings\/([^/]+)$/);
  if (req.method === "GET" && seatBooking) return json(await oneSeatBooking((await openSession(auth, "rider")).sub, seatBooking[1]));
  const payment = key.match(/^payments\/([^/]+)$/);
  if (req.method === "GET" && payment) return json(await paymentStatus((await openSession(auth, "rider")).sub, payment[1]));
  const seatPay = key.match(/^seats\/bookings\/([^/]+)\/pay$/);
  if (req.method === "POST" && seatPay) {
    const body = await bodyOf(req);
    return json(await paySeatBooking((await openSession(auth, "rider")).sub, seatPay[1], String(body.method ?? ""), new URL(req.url).origin));
  }
  const seatCancel = key.match(/^seats\/bookings\/([^/]+)\/cancel$/);
  if (req.method === "POST" && seatCancel) return json(await cancelSeatBooking((await openSession(auth, "rider")).sub, seatCancel[1]));
  const seatReview = key.match(/^seats\/bookings\/([^/]+)\/review$/);
  if (req.method === "POST" && seatReview) {
    const body = await bodyOf(req);
    return json(await reviewSeatBooking((await openSession(auth, "rider")).sub, seatReview[1], Number(body.rating), String(body.quote ?? "")));
  }
  const seatTrack = key.match(/^seats\/bookings\/([^/]+)\/track$/);
  if (req.method === "GET" && seatTrack) return json(await trackSeatBooking((await openSession(auth, "rider")).sub, seatTrack[1]));

  if (req.method === "GET" && key === "seats/captain/me") return json(await seatCaptainMe((await openSession(auth, "captain")).sub));
  if (req.method === "POST" && key === "seats/captain/register") {
    const who = await openSession(auth, "captain");
    const rider = await db().from("riders").select("phone").eq("user_id", who.sub).maybeSingle();
    const body = await bodyOf(req);
    return json(await registerSeatCaptain(who.sub, String(rider.data?.phone ?? ""), body));
  }
  if (req.method === "PATCH" && key === "seats/captain/car") {
    const body = await bodyOf(req);
    return json(await patchSeatCar((await openSession(auth, "captain")).sub, body));
  }
  if (req.method === "GET" && key === "seats/captain/fare-hint") {
    return json(await fareHint(url.searchParams.get("from") ?? "", url.searchParams.get("to") ?? "", (await openSession(auth, "captain")).sub));
  }
  if (req.method === "POST" && key === "seats/captain/trips") {
    const body = await bodyOf(req);
    return json(await publishSeatTrip((await openSession(auth, "captain")).sub, body));
  }
  if (req.method === "GET" && key === "seats/captain/trips") return json(await listCaptainTrips((await openSession(auth, "captain")).sub, url.searchParams.get("scope") ?? "upcoming"));
  const captainSeat = key.match(/^seats\/captain\/trips\/([^/]+)$/);
  if (req.method === "GET" && captainSeat) return json(await captainSeatTrip((await openSession(auth, "captain")).sub, captainSeat[1]));
  const captainSeatDo = key.match(/^seats\/captain\/trips\/([^/]+)\/(start|complete|cancel|block|unblock|board|rate|location)$/);
  if (req.method === "POST" && captainSeatDo) {
    const who = (await openSession(auth, "captain")).sub;
    const body = await bodyOf(req);
    const tripId = captainSeatDo[1];
    const action = captainSeatDo[2];
    if (action === "block") return json(await blockSeats(who, tripId, (body.seats as string[]) ?? [], body.gender ? String(body.gender) : null, body.note ? String(body.note) : undefined));
    if (action === "unblock") return json(await unblockSeats(who, tripId, (body.seats as string[]) ?? []));
    if (action === "board") return json(await boardTraveller(who, tripId, String(body.bookingId ?? ""), Boolean(body.boarded)));
    if (action === "rate") return json(await rateTraveller(who, tripId, String(body.bookingId ?? ""), Number(body.stars)));
    if (action === "location") return json(await moveSeatTrip(who, tripId, body));
    return json(await captainSeatAction(who, tripId, action, body.reason ? String(body.reason) : undefined));
  }
  if (req.method === "GET" && key === "seats/captain/earnings") return json(await seatEarnings((await openSession(auth, "captain")).sub));
  if (req.method === "GET" && key === "seats/captain/payouts") {
    const who = (await openSession(auth, "captain")).sub;
    const me = await seatCaptainMe(who);
    const pack = await seatPayoutPack(who);
    return json({ plan: pack.plan ?? me.plan, balance: me.balance, bankLast4: me.captain.bank_last4 ?? "", payouts: pack.payouts });
  }
  if (req.method === "POST" && key === "seats/captain/payouts") {
    const who = (await openSession(auth, "captain")).sub;
    const body = await bodyOf(req);
    return json(await saveSeatPlan(who, String(body.cycle ?? "weekly")));
  }

  return json({ error: "That request is not available yet." }, 404);
}

async function run(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  if (req.method === "OPTIONS") return new NextResponse(null, { status: 204, headers });
  try {
    const { path = [] } = await ctx.params;
    return await handle(req, path);
  } catch (error) {
    if (error instanceof ApiError) {
      return json(
        error.details ? { error: error.message, ...error.details } : { error: error.message },
        error.status || 400,
        error.retryAfter ? { "Retry-After": String(error.retryAfter) } : undefined,
      );
    }
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}

export const GET = run;
export const POST = run;
export const PATCH = run;
export const DELETE = run;
export const OPTIONS = run;
