import { db } from "./db";
import { PLATFORM_WALLET, type Row } from "./data";

// ROVEYA Bike and ROVEYA Auto city rides live in public.trips, shared with the
// passenger and captain apps. Cab rides are kept in the same table for later.
export const VEHICLES = ["bike", "auto", "cab"] as const;
export type Vehicle = (typeof VEHICLES)[number];
export const SERVICE_NAME: Record<Vehicle, string> = { bike: "ROVEYA Bike", auto: "ROVEYA Auto", cab: "ROVEYA Taxi" };

export const OPEN = ["searching", "assigned", "arrived", "on_trip"];
export const STATUSES = [...OPEN, "completed", "cancelled", "expired"];

export const owed = (trip: Row) => Number(trip.fare_paise) - Number(trip.discount_paise ?? 0);

export function rideLine(trip: Row) {
  return {
    id: trip.id,
    code: trip.code,
    vehicle: trip.vehicle,
    service: SERVICE_NAME[trip.vehicle as Vehicle] ?? trip.vehicle,
    status: trip.status,
    pickup: trip.pickup_name,
    drop: trip.drop_name,
    distanceKm: Number(trip.distance_km),
    farePaise: Number(trip.fare_paise),
    discountPaise: Number(trip.discount_paise ?? 0),
    owedPaise: owed(trip),
    bonusPaise: Number(trip.bonus_paise ?? 0),
    payment: trip.payment,
    // A ride that never started was never charged, whatever the stored status says.
    paymentStatus: (trip.status === "cancelled" || trip.status === "expired") && trip.payment_status === "due" ? "not_charged" : trip.payment_status,
    riderId: trip.rider_id,
    captainId: trip.captain_id,
    requestedAt: trip.requested_at,
    completedAt: trip.completed_at,
    cancelledBy: trip.cancelled_by,
    cancelReason: trip.cancel_reason,
  };
}

// Posts billing and analytics events straight away, so the captain's earning
// and ROVEYA's commission show up without waiting for the minute job.
let consumers: Promise<void> | null = null;

// One run at a time. The database functions move their own offset, and settle_trip
// refuses a trip that already has a ledger line, so a second call does not pay twice.
export function kickConsumers() {
  if (consumers) return consumers;
  consumers = Promise.allSettled([db().rpc("consume_billing", { p_limit: 500 }), db().rpc("consume_analytics", { p_limit: 500 })]).then(() => undefined).finally(() => {
    consumers = null;
  });
  return consumers;
}

export const whoOwns = (trip: Row, ownerId: string) => (ownerId === PLATFORM_WALLET ? "ROVEYA" : ownerId === trip.rider_id ? "Passenger" : ownerId === trip.captain_id ? "Captain" : "Other");
