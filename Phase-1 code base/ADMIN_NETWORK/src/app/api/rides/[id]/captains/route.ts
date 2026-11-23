import { check, mustId, route, search, term } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import type { Row } from "@/lib/server/data";
import { db } from "@/lib/server/db";

const FRESH_MS = 2 * 60 * 1000;
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const rad = (value: number) => (value * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

// Captains the desk can give this ride to: active, same vehicle, not on another ride.
// On-duty captains near the pickup come first.
export const GET = route<{ id: string }>(async (req, { id }) => {
  await requireAdmin("rides.manage");
  mustId(id, "Ride");
  const trip = check(await db().from("trips").select("id,vehicle,pickup_lat,pickup_lng,captain_id").eq("id", id).maybeSingle(), "Ride not found.") as Row;
  let query = db().from("captains").select("user_id,name,phone,captain_code,vehicle_no,vehicle_model,rating").eq("status", "active").eq("service", "taxi").eq("vehicle", trip.vehicle).limit(200);
  const needle = term(search(req).get("q"));
  if (needle) query = query.or(`name.ilike.%${needle}%,phone.ilike.%${needle}%,captain_code.ilike.%${needle}%`);
  const captains = check(await query) as Row[];
  const ids = captains.map((row) => row.user_id);
  const [presence, busy] = ids.length
    ? await Promise.all([
        db().from("captain_presence").select("captain_id,online,latitude,longitude,updated_at").in("captain_id", ids),
        db().from("trips").select("captain_id").in("captain_id", ids).in("status", ["assigned", "arrived", "on_trip"]),
      ])
    : [{ data: [] }, { data: [] }];
  const onRide = new Set(((busy.data ?? []) as Row[]).map((row) => row.captain_id));
  const where = new Map(((presence.data ?? []) as Row[]).map((row) => [row.captain_id, row]));
  const pickup = { lat: Number(trip.pickup_lat), lng: Number(trip.pickup_lng) };
  const rows = captains
    .filter((row) => row.user_id !== trip.captain_id && !onRide.has(row.user_id))
    .map((row) => {
      const spot = where.get(row.user_id);
      const onDuty = Boolean(spot?.online && Date.parse(spot.updated_at) > Date.now() - FRESH_MS);
      const distanceKm = spot?.latitude != null ? Math.round(km(pickup, { lat: Number(spot.latitude), lng: Number(spot.longitude) }) * 10) / 10 : null;
      return { ...row, onDuty, distanceKm, seenAt: spot?.updated_at ?? null };
    })
    .sort((a, b) => Number(b.onDuty) - Number(a.onDuty) || (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
  return { captains: rows.slice(0, 30) };
});
