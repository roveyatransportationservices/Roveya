import { randomInt } from "node:crypto";
import { z } from "zod";
import { ApiError, check } from "./api";
import { PLATFORM_WALLET, type Row } from "./data";
import { controls, db } from "./db";
import { kickConsumers } from "./rides";

// Desk bookings price exactly like the passenger app: the fare card in platform_settings,
// road distance estimated from the straight line, and the peak-hour captain bonus.
const DEFAULT_RATES = { bike: { base: 25, perKm: 7, min: 35 }, auto: { base: 40, perKm: 13, min: 60 }, cab: { base: 60, perKm: 16, min: 90 } } as const;
const MINUTES_PER_KM = { bike: 1, auto: 1.4, cab: 1.8 } as const;
export type CityVehicle = keyof typeof DEFAULT_RATES;
export type Place = { name: string; latitude: number; longitude: number };

const straightKm = (a: Place, b: Place) => {
  const rad = (value: number) => (value * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};
const isPeak = (at = new Date()) => {
  const hour = new Date(at.getTime() + 330 * 60000).getUTCHours();
  return (hour >= 8 && hour < 11) || (hour >= 17 && hour < 21);
};

async function settings(keys: string[]) {
  const { data } = await db().from("platform_settings").select("key,value").in("key", keys);
  return new Map(((data ?? []) as Row[]).map((row) => [row.key as string, Number(row.value)]));
}

export async function priceRide(vehicle: CityVehicle, pickup: Place, drop: Place) {
  const values = await settings([`fare_${vehicle}_base`, `fare_${vehicle}_per_km`, `fare_${vehicle}_min`, "peak_bonus_paise"]);
  const read = (key: string, fallback: number) => {
    const value = values.get(key);
    return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
  };
  const rate = DEFAULT_RATES[vehicle];
  const km = Math.max(1, Math.round(straightKm(pickup, drop) * 1.25 * 100) / 100);
  if (km > 300) throw new ApiError("That drop is too far for a city ride. Book Carpool Travels instead.", 400);
  const rupees = Math.max(read(`fare_${vehicle}_min`, rate.min), Math.round(read(`fare_${vehicle}_base`, rate.base) + read(`fare_${vehicle}_per_km`, rate.perKm) * km));
  return {
    km,
    etaMin: Math.max(4, Math.round(km * MINUTES_PER_KM[vehicle] + 3)),
    farePaise: rupees * 100,
    bonusPaise: isPeak() ? read("peak_bonus_paise", 1000) : 0,
  };
}

export async function riderByPhone(phone: string) {
  const { data } = await db().from("riders").select("user_id,name,phone,status").eq("phone", phone).maybeSingle();
  if (!data) throw new ApiError("No passenger has signed up with this number. Ask them to sign in to the ROVEYA app once, then book.", 404);
  if (data.status && data.status !== "active") throw new ApiError("This passenger's account is blocked.", 409);
  return data as Row;
}

// A city ride booked by the desk for a passenger. Offers go out to the nearest free captain.
export async function createCityRide(input: { vehicle: CityVehicle; phone: string; pickup: Place; drop: Place; payment: "cash" | "wallet" }) {
  if (input.vehicle === "cab") throw new ApiError("ROVEYA Taxi is coming soon. Book a bike or an auto.", 400);
  const rider = await riderByPhone(input.phone);
  const price = await priceRide(input.vehicle, input.pickup, input.drop);
  if (input.payment === "wallet") {
    const { data: wallet } = await db().from("wallets").select("balance_paise").eq("owner_id", rider.user_id).maybeSingle();
    if (!wallet || Number(wallet.balance_paise) < price.farePaise) throw new ApiError("The passenger's ROVEYA Cash is too low for this fare. Book with cash.", 402);
  }
  const inserted = await db()
    .from("trips")
    .insert({
      rider_id: rider.user_id,
      vehicle: input.vehicle,
      pickup_name: input.pickup.name,
      pickup_lat: input.pickup.latitude,
      pickup_lng: input.pickup.longitude,
      drop_name: input.drop.name,
      drop_lat: input.drop.latitude,
      drop_lng: input.drop.longitude,
      distance_km: price.km,
      eta_min: price.etaMin,
      fare_paise: price.farePaise,
      bonus_paise: price.bonusPaise,
      payment: input.payment,
      route_source: "estimate",
    })
    .select("*")
    .single();
  if (inserted.error?.code === "23505") throw new ApiError("This passenger already has a ride in progress.", 409);
  const trip = check(inserted) as Row;
  check(await db().from("trip_secrets").insert({ trip_id: trip.id, otp: String(randomInt(1000, 10000)) }).select("trip_id").single());
  await db().rpc("offer_next_captain", { p_trip: trip.id });
  await notify(rider.user_id, "rider", `ROVEYA desk booked ${trip.code} for you`, `${input.vehicle === "bike" ? "Bike" : "Auto"} from ${input.pickup.name} to ${input.drop.name}. Open the app to follow your captain and see your ride code.`, { tripId: trip.id, code: trip.code });
  void kickConsumers();
  return trip;
}

// Phone notification through the same Expo pipeline the apps use. Never fails the desk action.
export async function notify(userId: string | null | undefined, app: "rider" | "captain", title: string, body: string, data: Record<string, unknown>, channel: "rides" | "offers" = "rides") {
  if (!userId) return;
  await db().rpc("push_send", { p_user: userId, p_app: app, p_kind: "trip", p_title: title, p_body: body, p_data: data, p_channel: channel }).then(
    () => undefined,
    () => undefined,
  );
}

// Money ever moved on a record means it can only be cancelled or refunded, never deleted.
export async function moneyMoved(refId: string) {
  const [{ count: ledger }, { count: payments }] = await Promise.all([
    db().from("ledger_entries").select("id", { count: "exact", head: true }).eq("ref_id", refId),
    db().from("payment_intents").select("id", { count: "exact", head: true }).eq("ref_id", refId),
  ]);
  return (ledger ?? 0) + (payments ?? 0) > 0;
}

// Everything the team did to one record, newest first.
export async function activity(entityId: string) {
  const { data } = await controls().from("audit_log").select("id,admin_email,action,detail,at").eq("entity_id", entityId).order("at", { ascending: false }).limit(50);
  return (data ?? []) as Row[];
}

type Stop = { id: string; name: string; landmark?: string; offsetMin?: number };

export const traveller = z.object({
  seatId: z.string().regex(/^[A-Z0-9]{1,4}$/, "Pick a seat for each traveller."),
  name: z.string().trim().min(2, "Enter each traveller's name.").max(60),
  age: z.number().int().min(1, "Check the traveller's age.").max(99),
  gender: z.enum(["Male", "Female"]),
});
export type DeskTraveller = z.infer<typeof traveller>;

const istTime = (at: Date) => new Date(at.getTime() + 330 * 60000).toISOString().slice(11, 16);
const stopAt = (stop: Stop, departAt: string) => ({ ...stop, time: istTime(new Date(Date.parse(departAt) + (stop.offsetMin ?? 0) * 60000)) });

export async function tripStops(tripId: string, boardingId: string, dropId: string) {
  const trip = check(await db().from("seat_trips").select("id,code,status,depart_at,boarding,drops").eq("id", tripId).maybeSingle(), "Trip not found.") as Row;
  const boarding = (trip.boarding as Stop[]).find((stop) => stop.id === boardingId);
  const drop = (trip.drops as Stop[]).find((stop) => stop.id === dropId);
  if (!boarding || !drop) throw new ApiError("Pick a boarding and drop point from the trip's list.", 400);
  return { trip, boarding: stopAt(boarding, trip.depart_at), drop: stopAt(drop, trip.depart_at) };
}

// Seats booked by the desk: held, then confirmed at once as paid in cash at the desk or from ROVEYA Cash.
export async function createSeatBooking(input: { tripId: string; phone: string; email?: string; travellers: DeskTraveller[]; boardingId: string; dropId: string; secured: boolean; payment: "desk_cash" | "wallet" }) {
  const rider = await riderByPhone(input.phone);
  const { trip, boarding, drop } = await tripStops(input.tripId, input.boardingId, input.dropId);
  const held = check(
    await db().rpc("seat_book", {
      p_rider: rider.user_id,
      p_trip: trip.id,
      p_travellers: input.travellers,
      p_boarding: boarding,
      p_drop: drop,
      p_phone: input.phone,
      p_email: input.email || null,
      p_secured: input.secured,
      p_coupon: null,
      p_discount: 0,
      p_use_cash: false,
    }),
  ) as unknown as Row;
  if (input.payment === "wallet") {
    const { data: wallet } = await db().from("wallets").select("balance_paise").eq("owner_id", rider.user_id).maybeSingle();
    if (!wallet || Number(wallet.balance_paise) < Number(held.total_paise)) {
      await releaseSeats(held.id);
      await db().from("seat_bookings").delete().eq("id", held.id);
      throw new ApiError("The passenger's ROVEYA Cash is too low for these seats. Take the payment at the desk instead.", 402);
    }
  }
  const confirmed = await db().rpc("seat_confirm", { p_booking: held.id, p_paid_with: input.payment === "wallet" ? "ROVEYA Cash" : "Desk · cash", p_from_wallet: input.payment === "wallet" });
  if (confirmed.error) {
    await releaseSeats(held.id);
    await db().from("seat_bookings").delete().eq("id", held.id);
    check(confirmed);
  }
  // Cash taken at the desk goes on ROVEYA's books, so a later refund to ROVEYA Cash balances.
  if (input.payment === "desk_cash" && Number(held.total_paise) > 0) {
    check(await db().rpc("ledger_post", { p_owner: PLATFORM_WALLET, p_kind: "seat_payment", p_amount: Number(held.total_paise), p_ref_type: "seat_booking", p_ref_id: held.id, p_note: `Cash at the desk for ${held.pnr}` }));
  }
  void kickConsumers();
  return { booking: confirmed.data as unknown as Row, trip };
}

// Frees seats still held for a booking that never got confirmed.
export async function releaseSeats(bookingId: string) {
  await db().from("seat_trip_seats").update({ state: "available", gender: null, booking_id: null, held_until: null }).eq("booking_id", bookingId).eq("state", "held");
}
