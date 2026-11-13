import "server-only";
import { randomInt } from "crypto";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { db, dbError, kickConsumers, must, rupees } from "@/lib/platform/gateway";
import { roadRoute, streetName } from "@/lib/platform/maps";
import { couponDiscount, peakBonusPaise, quote, ratesFrom, VEHICLES, type CouponRule, type Vehicle } from "@/lib/platform/pricing";
import { loadSettings, settingNumber } from "@/lib/platform/settings";

export const placeSchema = z.object({
  name: z.string().trim().min(2, "Name the place.").max(120),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const quoteSchema = z.object({
  pickup: placeSchema,
  drop: placeSchema,
  coupon: z.string().trim().toUpperCase().max(20).optional(),
});

export const tripRequestSchema = z.object({
  quoteId: z.string().uuid("Refresh the fares and book again."),
  vehicle: z.enum(["bike", "auto", "cab"]),
  payment: z.enum(["cash", "wallet", "online"]),
});

type QuoteOption = { vehicle: Vehicle; fare_paise: number; discount_paise: number; eta_min: number };

type CouponRow = CouponRule & {
  id: string;
  code: string;
  title: string;
  active: boolean;
  starts_at: string;
  ends_at: string | null;
  max_redemptions: number | null;
  redeemed_count: number;
  per_rider_limit: number;
  new_riders_only: boolean;
};

const OPEN = ["searching", "assigned", "arrived", "on_trip"];

type TripRow = {
  id: string;
  code: string;
  rider_id: string;
  captain_id: string | null;
  vehicle: Vehicle;
  pickup_name: string;
  pickup_lat: number;
  pickup_lng: number;
  drop_name: string;
  drop_lat: number;
  drop_lng: number;
  distance_km: number;
  eta_min: number;
  fare_paise: number;
  discount_paise: number;
  coupon_id: string | null;
  bonus_paise: number;
  payment: "cash" | "wallet" | "online";
  payment_status: string;
  status: string;
  cancel_reason: string | null;
  cancelled_by: string | null;
  requested_at: string;
  assigned_at: string | null;
  arrived_at: string | null;
  started_at: string | null;
  completed_at: string | null;
};

function shapeTrip(row: TripRow) {
  return {
    id: row.id,
    code: row.code,
    vehicle: row.vehicle,
    status: row.status,
    pickup: { name: row.pickup_name, latitude: row.pickup_lat, longitude: row.pickup_lng },
    drop: { name: row.drop_name, latitude: row.drop_lat, longitude: row.drop_lng },
    distanceKm: Number(row.distance_km),
    etaMin: row.eta_min,
    fare: rupees(payable(row)),
    fullFare: rupees(row.fare_paise),
    discount: rupees(row.discount_paise ?? 0),
    payment: row.payment,
    paymentStatus: row.payment_status,
    cancelReason: row.cancel_reason,
    cancelledBy: row.cancelled_by,
    requestedAt: row.requested_at,
    assignedAt: row.assigned_at,
    arrivedAt: row.arrived_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

// What the passenger pays after any coupon.
export function payable(row: { fare_paise: number; discount_paise?: number | null }) {
  return row.fare_paise - (row.discount_paise ?? 0);
}

async function couponFor(riderId: string, code: string): Promise<{ coupon: CouponRow | null; message: string }> {
  const client = db();
  const { data } = await client.from("coupons").select("*").eq("code", code).maybeSingle();
  const coupon = data as CouponRow | null;
  const now = Date.now();
  const closed =
    !coupon ||
    !coupon.active ||
    Date.parse(coupon.starts_at) > now ||
    (coupon.ends_at !== null && Date.parse(coupon.ends_at) <= now) ||
    (coupon.max_redemptions !== null && coupon.redeemed_count >= coupon.max_redemptions);
  if (closed) return { coupon: null, message: "That code is not active." };
  const { count: used } = await client.from("coupon_redemptions").select("id", { count: "exact", head: true }).eq("coupon_id", coupon.id).eq("rider_id", riderId).neq("status", "released");
  if ((used ?? 0) >= coupon.per_rider_limit) return { coupon: null, message: "You have already used this code." };
  if (coupon.new_riders_only) {
    const { count } = await client.from("trips").select("id", { count: "exact", head: true }).eq("rider_id", riderId).eq("status", "completed");
    if ((count ?? 0) > 0) return { coupon: null, message: "This code is for your first ride." };
  }
  return { coupon, message: coupon.title };
}

export async function quoteTrip(riderId: string, input: z.infer<typeof quoteSchema>) {
  const settings = await loadSettings();
  const route = await roadRoute(input.pickup, input.drop);
  if (route.km > 300) throw new AppError("That drop is too far for a city ride. Try Taxipool.", 400);
  const pickupName = /^current location$/i.test(input.pickup.name) ? ((await streetName(input.pickup)) ?? input.pickup.name) : input.pickup.name;
  const code = input.coupon?.trim().toUpperCase() || "";
  const found = code ? await couponFor(riderId, code) : { coupon: null, message: "" };
  const rates = ratesFrom(settings);
  const options: QuoteOption[] = VEHICLES.map((vehicle) => {
    const priced = quote(vehicle, route.km, rates, route.minutes);
    const discount = found.coupon ? couponDiscount(found.coupon, priced.farePaise, vehicle) : 0;
    return { vehicle, fare_paise: priced.farePaise, discount_paise: discount, eta_min: priced.etaMin };
  });
  const expiresAt = new Date(Date.now() + settingNumber(settings, "quote_ttl_minutes", 10) * 60 * 1000).toISOString();
  const saved = must(
    await db()
      .from("fare_quotes")
      .insert({
        rider_id: riderId,
        pickup_name: pickupName,
        pickup_lat: input.pickup.latitude,
        pickup_lng: input.pickup.longitude,
        drop_name: input.drop.name,
        drop_lat: input.drop.latitude,
        drop_lng: input.drop.longitude,
        distance_km: route.km,
        duration_min: route.minutes,
        route_source: route.source,
        options: Object.fromEntries(options.map((option) => [option.vehicle, option])),
        coupon_id: found.coupon?.id ?? null,
        expires_at: expiresAt,
      })
      .select("id")
      .single(),
  ) as { id: string };
  const applied = Boolean(found.coupon) && options.some((option) => option.discount_paise > 0);
  return {
    quoteId: saved.id,
    expiresAt,
    distanceKm: route.km,
    durationMin: route.minutes,
    routeSource: route.source,
    route: route.coords,
    pickupName,
    options: options.map((option) => ({
      vehicle: option.vehicle,
      fare: rupees(option.fare_paise - option.discount_paise),
      fullFare: rupees(option.fare_paise),
      discount: rupees(option.discount_paise),
      etaMin: option.eta_min,
    })),
    coupon: code ? { code, applied, note: found.coupon && !applied ? "Add a longer ride to use this code." : found.message } : null,
  };
}

export async function listCoupons(riderId: string) {
  const now = new Date().toISOString();
  const { data } = await db()
    .from("coupons")
    .select("id,code,title,description,min_fare_paise,vehicles,ends_at,max_redemptions,redeemed_count,per_rider_limit,new_riders_only")
    .eq("active", true)
    .eq("listed", true)
    .lte("starts_at", now)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .order("created_at", { ascending: false })
    .limit(20);
  const rows = (data ?? []).filter((row) => row.max_redemptions === null || row.redeemed_count < row.max_redemptions);
  const { data: used } = await db().from("coupon_redemptions").select("coupon_id").eq("rider_id", riderId).neq("status", "released");
  const counts = new Map<string, number>();
  for (const row of used ?? []) counts.set(row.coupon_id, (counts.get(row.coupon_id) ?? 0) + 1);
  return {
    coupons: rows
      .filter((row) => (counts.get(row.id) ?? 0) < row.per_rider_limit)
      .map((row) => ({ code: row.code, title: row.title, description: row.description, minFare: rupees(row.min_fare_paise), vehicles: row.vehicles, endsAt: row.ends_at, firstRideOnly: row.new_riders_only })),
  };
}

export async function nearbyCaptains(latitude: number, longitude: number) {
  const span = 0.03;
  const { data } = await db()
    .from("captain_presence")
    .select("vehicle,latitude,longitude,heading,updated_at")
    .eq("online", true)
    .gte("updated_at", new Date(Date.now() - 2 * 60 * 1000).toISOString())
    .gte("latitude", latitude - span)
    .lte("latitude", latitude + span)
    .gte("longitude", longitude - span)
    .lte("longitude", longitude + span)
    .limit(60);
  // Positions are blurred and carry no identity, so riders cannot track a captain.
  return (data ?? []).map((row) => ({
    vehicle: row.vehicle,
    latitude: Math.round((row.latitude + (Math.random() - 0.5) * 0.002) * 10000) / 10000,
    longitude: Math.round((row.longitude + (Math.random() - 0.5) * 0.002) * 10000) / 10000,
    heading: Math.round(row.heading ?? 0),
  }));
}

// Books exactly the fare the passenger saw. The quote is claimed once, so a
// stale screen or a replayed request cannot book a different price.
export async function createTrip(riderId: string, input: z.infer<typeof tripRequestSchema>) {
  const client = db();
  const now = new Date().toISOString();
  const claimed = await client
    .from("fare_quotes")
    .update({ used_at: now })
    .eq("id", input.quoteId)
    .eq("rider_id", riderId)
    .is("used_at", null)
    .gt("expires_at", now)
    .select("*")
    .maybeSingle();
  if (!claimed.data) {
    const { data: existing } = await client.from("fare_quotes").select("used_at").eq("id", input.quoteId).eq("rider_id", riderId).maybeSingle();
    if (!existing) throw new AppError("Refresh the fares and book again.", 404);
    if (existing.used_at) throw new AppError("This fare was already booked.", 409);
    throw new AppError("Fares were refreshed. Check the new price and book again.", 409);
  }
  const fareQuote = claimed.data;
  const release = () => client.from("fare_quotes").update({ used_at: null }).eq("id", fareQuote.id);
  const option = (fareQuote.options as Record<Vehicle, QuoteOption>)[input.vehicle];
  if (!option) {
    await release();
    throw new AppError("Pick a ride type from the list.", 400);
  }
  const due = option.fare_paise - option.discount_paise;

  if (input.payment === "wallet") {
    const { data: wallet } = await client.from("wallets").select("balance_paise").eq("owner_id", riderId).maybeSingle();
    if (!wallet || Number(wallet.balance_paise) < due) {
      await release();
      throw new AppError("Your wallet balance is too low for this ride.", 402);
    }
  }

  const settings = await loadSettings();
  const couponId = option.discount_paise > 0 ? (fareQuote.coupon_id as string | null) : null;
  const inserted = await client
    .from("trips")
    .insert({
      rider_id: riderId,
      vehicle: input.vehicle,
      pickup_name: fareQuote.pickup_name,
      pickup_lat: fareQuote.pickup_lat,
      pickup_lng: fareQuote.pickup_lng,
      drop_name: fareQuote.drop_name,
      drop_lat: fareQuote.drop_lat,
      drop_lng: fareQuote.drop_lng,
      distance_km: fareQuote.distance_km,
      eta_min: option.eta_min,
      fare_paise: option.fare_paise,
      discount_paise: couponId ? option.discount_paise : 0,
      coupon_id: couponId,
      quote_id: fareQuote.id,
      route_source: fareQuote.route_source,
      bonus_paise: peakBonusPaise(new Date(), settingNumber(settings, "peak_bonus_paise", 1000)),
      payment: input.payment,
    })
    .select("*")
    .single();
  if (inserted.error) await release();
  if (inserted.error?.code === "23505") throw new AppError("You already have a ride in progress.", 409);
  const trip = must(inserted) as TripRow;

  if (couponId) {
    const held = await client.rpc("redeem_coupon", { p_coupon: couponId, p_rider: riderId, p_trip: trip.id, p_discount: option.discount_paise });
    if (held.error) {
      await client.from("trips").delete().eq("id", trip.id);
      await release();
      throw dbError(held.error) ?? new AppError("That code is no longer available.", 409);
    }
  }

  const otp = String(randomInt(1000, 10000));
  const secret = await client.from("trip_secrets").insert({ trip_id: trip.id, otp });
  const failure = dbError(secret.error);
  if (failure) throw failure;

  await client.rpc("offer_next_captain", { p_trip: trip.id });
  void kickConsumers();
  return riderView(riderId, trip.id);
}

async function captainCard(captainId: string | null) {
  if (!captainId) return null;
  const client = db();
  const [{ data: captain }, { data: presence }] = await Promise.all([
    client.from("captains").select("name,rating,vehicle,vehicle_no,vehicle_model,vehicle_color,captain_code").eq("user_id", captainId).maybeSingle(),
    client.from("captain_presence").select("latitude,longitude,heading,updated_at").eq("captain_id", captainId).maybeSingle(),
  ]);
  if (!captain) return null;
  const { count } = await client.from("trips").select("id", { count: "exact", head: true }).eq("captain_id", captainId).eq("status", "completed");
  return {
    name: captain.name.split(" ")[0],
    rating: Number(captain.rating),
    trips: count ?? 0,
    vehicleNo: captain.vehicle_no,
    vehicleName: `${captain.vehicle_model} · ${captain.vehicle_color}`,
    location: presence ? { latitude: presence.latitude, longitude: presence.longitude, heading: presence.heading, at: presence.updated_at } : null,
  };
}

export async function riderView(riderId: string, tripId: string) {
  const client = db();
  await client.rpc("sweep_offers");
  const { data: trip } = await client.from("trips").select("*").eq("id", tripId).eq("rider_id", riderId).maybeSingle();
  if (!trip) throw new AppError("Ride not found.", 404);
  const row = trip as TripRow;
  const open = OPEN.includes(row.status);
  const { data: secret } = open ? await client.from("trip_secrets").select("otp").eq("trip_id", tripId).maybeSingle() : { data: null };
  return { ...shapeTrip(row), otp: secret?.otp ?? null, captain: await captainCard(row.captain_id) };
}

export async function listRiderTrips(riderId: string) {
  const { data } = await db().from("trips").select("*").eq("rider_id", riderId).order("requested_at", { ascending: false }).limit(50);
  return { trips: (data ?? []).map((row) => shapeTrip(row as TripRow)) };
}

export async function currentRiderTrip(riderId: string) {
  const { data } = await db().from("trips").select("id").eq("rider_id", riderId).in("status", OPEN).maybeSingle();
  return data ? riderView(riderId, data.id) : { trip: null };
}

export async function cancelByRider(riderId: string, tripId: string, reason: string) {
  const client = db();
  const { data, error } = await client
    .from("trips")
    .update({ status: "cancelled", cancelled_by: "rider", cancel_reason: reason, cancelled_at: new Date().toISOString() })
    .eq("id", tripId)
    .eq("rider_id", riderId)
    .in("status", ["searching", "assigned", "arrived"])
    .select("id");
  const failure = dbError(error);
  if (failure) throw failure;
  if (!data?.length) throw new AppError("This ride can no longer be cancelled.", 409);
  await client.from("trip_offers").update({ status: "withdrawn", decided_at: new Date().toISOString() }).eq("trip_id", tripId).eq("status", "offered");
  void kickConsumers();
  return riderView(riderId, tripId);
}

export async function payWithWallet(riderId: string, tripId: string) {
  const client = db();
  const { data: trip } = await client.from("trips").select("*").eq("id", tripId).eq("rider_id", riderId).maybeSingle();
  if (!trip) throw new AppError("Ride not found.", 404);
  if (trip.payment_status === "paid") return riderView(riderId, tripId);
  if (!["on_trip", "completed"].includes(trip.status)) throw new AppError("Pay once the ride has started.", 409);
  const amount = payable(trip);
  const debit = await client.rpc("ledger_post", { p_owner: riderId, p_kind: "ride_payment", p_amount: -amount, p_ref_type: "trip", p_ref_id: tripId, p_note: `Ride ${trip.code}` });
  const failure = dbError(debit.error);
  if (failure) throw failure;
  await client.rpc("ledger_post", { p_owner: "00000000-0000-0000-0000-000000000001", p_kind: "ride_payment", p_amount: amount, p_ref_type: "trip", p_ref_id: tripId });
  await client.from("trips").update({ payment: "wallet", payment_status: "paid" }).eq("id", tripId);
  return riderView(riderId, tripId);
}

export const ratingSchema = z.object({
  stars: z.number().int().min(1).max(5),
  tags: z.array(z.string().trim().max(40)).max(8).default([]),
  note: z.string().trim().max(400).optional(),
});

export async function rateTrip(byRole: "rider" | "captain", userId: string, tripId: string, input: z.infer<typeof ratingSchema>) {
  const client = db();
  const column = byRole === "rider" ? "rider_id" : "captain_id";
  const { data: trip } = await client.from("trips").select("id,status,captain_id").eq("id", tripId).eq(column, userId).maybeSingle();
  if (!trip) throw new AppError("Ride not found.", 404);
  if (trip.status !== "completed") throw new AppError("Rate the ride once it is complete.", 409);
  const saved = await client.from("trip_ratings").upsert({ trip_id: tripId, by_role: byRole, stars: input.stars, tags: input.tags, note: input.note ?? null });
  const failure = dbError(saved.error);
  if (failure) throw failure;

  if (byRole === "rider" && trip.captain_id) {
    const { data: rows } = await client.from("trip_ratings").select("stars, trips!inner(captain_id)").eq("by_role", "rider").eq("trips.captain_id", trip.captain_id).limit(500);
    const stars = (rows ?? []).map((row) => row.stars as number);
    if (stars.length) {
      const average = stars.reduce((sum, value) => sum + value, 0) / stars.length;
      await client.from("captains").update({ rating: Math.round(average * 100) / 100 }).eq("user_id", trip.captain_id);
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Captain side of the ride
// ---------------------------------------------------------------------------

export async function currentOffer(captainId: string) {
  const client = db();
  await client.rpc("sweep_offers");
  const { data: offer } = await client
    .from("trip_offers")
    .select("id,trip_id,pickup_km,expires_at")
    .eq("captain_id", captainId)
    .eq("status", "offered")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!offer) return { offer: null };
  const { data: trip } = await client.from("trips").select("*").eq("id", offer.trip_id).maybeSingle();
  if (!trip) return { offer: null };
  const row = trip as TripRow;
  const { data: rider } = await client.from("riders").select("name").eq("user_id", row.rider_id).maybeSingle();
  const { count } = await client.from("trips").select("id", { count: "exact", head: true }).eq("rider_id", row.rider_id).eq("status", "completed");
  const pickupKm = Number(offer.pickup_km);
  const settings = await loadSettings();
  const longPickup = pickupKm > settingNumber(settings, "long_pickup_km", 2.5) ? settingNumber(settings, "long_pickup_bonus_paise", 1500) : 0;
  return {
    offer: {
      id: offer.id,
      expiresAt: offer.expires_at,
      tripId: row.id,
      code: row.code,
      vehicle: row.vehicle,
      pickup: { name: row.pickup_name, latitude: row.pickup_lat, longitude: row.pickup_lng },
      drop: { name: row.drop_name, latitude: row.drop_lat, longitude: row.drop_lng },
      pickupKm,
      pickupMin: Math.max(2, Math.round(pickupKm * 3) + 1),
      tripKm: Number(row.distance_km),
      tripMin: row.eta_min,
      fare: rupees(row.fare_paise),
      collect: rupees(payable(row)),
      bonus: rupees(row.bonus_paise + longPickup),
      payment: row.payment === "cash" ? "cash" : "online",
      passenger: { name: (rider?.name ?? "Passenger").split(" ")[0], rides: count ?? 0 },
    },
  };
}

export async function acceptOffer(captainId: string, offerId: string) {
  const { error } = await db().rpc("accept_offer", { p_offer: offerId, p_captain: captainId });
  const failure = dbError(error, "This ride request is no longer available.");
  if (failure) throw failure;
  void kickConsumers();
  return captainTrip(captainId);
}

export async function rejectOffer(captainId: string, offerId: string) {
  const client = db();
  const { data } = await client
    .from("trip_offers")
    .update({ status: "rejected", decided_at: new Date().toISOString() })
    .eq("id", offerId)
    .eq("captain_id", captainId)
    .eq("status", "offered")
    .select("trip_id")
    .maybeSingle();
  if (data) await client.rpc("offer_next_captain", { p_trip: data.trip_id });
  return { ok: true };
}

export async function captainTrip(captainId: string) {
  const client = db();
  const { data: trip } = await client.from("trips").select("*").eq("captain_id", captainId).in("status", ["assigned", "arrived", "on_trip"]).maybeSingle();
  if (!trip) return { trip: null };
  const row = trip as TripRow;
  const { data: rider } = await client.from("riders").select("name").eq("user_id", row.rider_id).maybeSingle();
  // The captain never receives the OTP or the passenger's phone number.
  return { trip: captainShape(row, (rider?.name ?? "Passenger").split(" ")[0]) };
}

// Captains earn on the full fare; on a cash ride they collect what the passenger owes.
function captainShape(row: TripRow, passenger?: string) {
  return {
    ...shapeTrip(row),
    fare: rupees(row.fare_paise),
    collect: rupees(payable(row)),
    bonus: rupees(row.bonus_paise),
    ...(passenger ? { passenger: { name: passenger } } : null),
  };
}

const transitions = {
  arrived: { from: ["assigned"], to: "arrived", stamp: "arrived_at" },
  start: { from: ["arrived"], to: "on_trip", stamp: "started_at" },
  complete: { from: ["on_trip"], to: "completed", stamp: "completed_at" },
} as const;

export async function advanceTrip(captainId: string, tripId: string, action: keyof typeof transitions, otp?: string) {
  const client = db();
  const step = transitions[action];
  if (action === "start") {
    const { data: secret } = await client.from("trip_secrets").select("otp").eq("trip_id", tripId).maybeSingle();
    if (!secret || !otp || secret.otp !== otp) throw new AppError("That OTP does not match. Ask the passenger again.", 422);
  }
  const { data, error } = await client
    .from("trips")
    .update({ status: step.to, [step.stamp]: new Date().toISOString() })
    .eq("id", tripId)
    .eq("captain_id", captainId)
    .in("status", [...step.from])
    .select("*")
    .maybeSingle();
  const failure = dbError(error);
  if (failure) throw failure;
  if (!data) throw new AppError("This ride has moved on. Refresh and try again.", 409);
  if (action === "complete") await kickConsumers();
  return { trip: captainShape(data as TripRow) };
}

export async function collectCash(captainId: string, tripId: string) {
  const { data, error } = await db()
    .from("trips")
    .update({ payment_status: "paid" })
    .eq("id", tripId)
    .eq("captain_id", captainId)
    .eq("status", "completed")
    .eq("payment", "cash")
    .select("id")
    .maybeSingle();
  const failure = dbError(error);
  if (failure) throw failure;
  if (!data) throw new AppError("Only a completed cash ride can be marked as collected.", 409);
  return { ok: true };
}

export async function cancelByCaptain(captainId: string, tripId: string, reason: string) {
  const { data, error } = await db()
    .from("trips")
    .update({ status: "cancelled", cancelled_by: "captain", cancel_reason: reason, cancelled_at: new Date().toISOString() })
    .eq("id", tripId)
    .eq("captain_id", captainId)
    .in("status", ["assigned", "arrived"])
    .select("id")
    .maybeSingle();
  const failure = dbError(error);
  if (failure) throw failure;
  if (!data) throw new AppError("This ride can no longer be cancelled.", 409);
  void kickConsumers();
  return { ok: true };
}
