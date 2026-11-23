import { z } from "zod";
import { readBody, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import type { Row } from "@/lib/server/data";
import { loadDispatchSettings, saveDispatchSetting } from "@/lib/server/cityRides";
import { db } from "@/lib/server/db";
import { bookingPhase, captainAvailability } from "@/lib/server/dispatch";

const schema = z.object({
  key: z.enum(["dispatch_offer_seconds", "dispatch_search_seconds", "dispatch_gps_fresh_seconds", "dispatch_batch", "dispatch_radius_km"]),
  value: z.union([z.string(), z.number()]),
});

export const GET = route(async () => {
  await requireAdmin("view.rides");
  const settings = await loadDispatchSettings();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const freshAfter = Date.now() - settings.gpsFreshSeconds * 1000;
  const now = new Date().toISOString();
  const [presence, trips, offers, recent] = await Promise.all([
    db().from("captain_presence").select("captain_id,online,updated_at").eq("online", true).limit(1000),
    db().from("trips").select("id,status,captain_id,payment_status,cancelled_by,vehicle").gte("requested_at", since).limit(3000),
    db().from("trip_offers").select("trip_id,captain_id,status,expires_at").gte("created_at", since).order("created_at", { ascending: false }).limit(1000),
    db().from("captains").select("user_id,status").in("status", ["active", "suspended"]).limit(1000),
  ]);
  const openOffers = ((offers.data ?? []) as Row[]).filter((row) => row.status === "offered" && Date.parse(String(row.expires_at)) > Date.now());
  const pending = new Set(openOffers.map((row) => String(row.captain_id)));
  const activeTrip = new Map<string, string>();
  for (const trip of (trips.data ?? []) as Row[]) {
    if (trip.captain_id && ["assigned", "arrived", "on_trip"].includes(String(trip.status))) activeTrip.set(String(trip.captain_id), String(trip.status));
  }
  const online = new Map(((presence.data ?? []) as Row[]).map((row) => [String(row.captain_id), row]));
  const duty = { AVAILABLE: 0, OFFER_PENDING: 0, GOING_TO_PICKUP: 0, ARRIVED_AT_PICKUP: 0, RIDE_IN_PROGRESS: 0, TEMPORARILY_UNAVAILABLE: 0, OFFLINE: 0, SUSPENDED: 0 };
  for (const captain of (recent.data ?? []) as Row[]) {
    const spot = online.get(String(captain.user_id));
    const state = captainAvailability({
      account: String(captain.status),
      online: Boolean(spot?.online),
      gpsFresh: Boolean(spot && Date.parse(String(spot.updated_at)) > freshAfter),
      offerPending: pending.has(String(captain.user_id)),
      tripStatus: activeTrip.get(String(captain.user_id)) ?? null,
    });
    duty[state] += 1;
  }
  const day = (trips.data ?? []) as Row[];
  const phases = { SEARCHING: 0, OFFERED: 0, CAPTAIN_ARRIVING: 0, ARRIVED: 0, STARTED: 0, PAYMENT_PENDING: 0, PAYMENT_COMPLETED: 0, CUSTOMER_CANCELLED: 0, CAPTAIN_CANCELLED: 0, EXPIRED: 0 };
  const offeredTrips = new Set(openOffers.map((row) => String((row as Row).trip_id ?? "")));
  for (const trip of day) {
    const phase = bookingPhase({ status: String(trip.status), cancelledBy: trip.cancelled_by ? String(trip.cancelled_by) : null, paymentStatus: trip.payment_status ? String(trip.payment_status) : null, offered: offeredTrips.has(String(trip.id)) });
    if (phase in phases) phases[phase as keyof typeof phases] += 1;
  }
  const decided = ((offers.data ?? []) as Row[]).filter((row) => ["accepted", "rejected", "expired"].includes(String(row.status)));
  const accepted = decided.filter((row) => row.status === "accepted").length;
  return {
    settings,
    freshBefore: now,
    duty,
    phases,
    offers: { pending: openOffers.length, accepted, declined: decided.length - accepted },
    note: "A rejection is recorded. It does not by itself take a captain off duty.",
  };
});

export const PATCH = route(async (req) => {
  const admin = await requireAdmin(["rides.manage", "settings.manage"]);
  const input = await readBody(req, schema);
  const settings = await saveDispatchSetting(input.key, String(input.value));
  await audit(admin, "dispatch.update", "platform_setting", input.key, { to: input.value });
  return { settings };
});
