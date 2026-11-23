import { route } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { type Row } from "@/lib/server/data";
import { db } from "@/lib/server/db";

const PLATFORM = (process.env.NEXT_PUBLIC_PLATFORM_URL || "https://roveya-website-0zvf.onrender.com").replace(/\/$/, "");

// Cars on the road now and cars leaving in the next 3 hours, with their last position.
export const GET = route(async () => {
  await requireAdmin(["view.trips", "view.safety"]);
  const soon = new Date(Date.now() + 3 * 3600000).toISOString();
  const { data: trips } = await db()
    .from("seat_trips")
    .select("id,code,status,from_city,to_city,depart_at,arrive_at,started_at,captain_id,car_id")
    .or(`status.eq.on_trip,and(status.eq.scheduled,depart_at.lte.${soon})`)
    .order("depart_at")
    .limit(200);
  const rows = (trips ?? []) as Row[];
  const ids = rows.map((row) => row.id);
  const captainIds = [...new Set(rows.map((row) => row.captain_id))];
  const [positions, captains, cars, bookings, incidents, shares] = await Promise.all([
    ids.length ? db().from("seat_trip_positions").select("trip_id,latitude,longitude,speed_kmh,moved_at,updated_at").in("trip_id", ids) : Promise.resolve({ data: [] }),
    captainIds.length ? db().from("captains").select("user_id,name,phone,captain_code").in("user_id", captainIds) : Promise.resolve({ data: [] }),
    ids.length ? db().from("seat_cars").select("id,make_model,plate").in("id", rows.map((row) => row.car_id)) : Promise.resolve({ data: [] }),
    ids.length ? db().from("seat_bookings").select("trip_id,seat_ids,boarded_at").in("trip_id", ids).eq("status", "confirmed") : Promise.resolve({ data: [] }),
    ids.length ? db().from("safety_incidents").select("id,code,kind,status,trip_id,created_at").in("trip_id", ids).in("status", ["open", "acknowledged"]) : Promise.resolve({ data: [] }),
    ids.length ? db().from("trip_shares").select("token,trip_id,expires_at").in("trip_id", ids).gt("expires_at", new Date().toISOString()) : Promise.resolve({ data: [] }),
  ]);
  const by = <T extends Row>(list: T[] | null, key: string) => new Map((list ?? []).map((row) => [row[key], row]));
  const pos = by(positions.data as Row[], "trip_id");
  const cap = by(captains.data as Row[], "user_id");
  const car = by(cars.data as Row[], "id");
  const share = by(shares.data as Row[], "trip_id");
  const seats = new Map<string, { booked: number; boarded: number }>();
  for (const row of (bookings.data ?? []) as Row[]) {
    const item = seats.get(row.trip_id) ?? { booked: 0, boarded: 0 };
    item.booked += row.seat_ids.length;
    if (row.boarded_at) item.boarded += row.seat_ids.length;
    seats.set(row.trip_id, item);
  }
  const alerts = new Map<string, Row[]>();
  for (const row of (incidents.data ?? []) as Row[]) alerts.set(row.trip_id, [...(alerts.get(row.trip_id) ?? []), row]);

  return {
    trips: rows.map((row) => {
      const position = pos.get(row.id) ?? null;
      const stale = position ? Date.now() - Date.parse(position.updated_at) > 5 * 60000 : true;
      return {
        ...row,
        captain: cap.get(row.captain_id) ?? null,
        car: car.get(row.car_id) ?? null,
        position,
        stale,
        seats: seats.get(row.id) ?? { booked: 0, boarded: 0 },
        alerts: alerts.get(row.id) ?? [],
        trackUrl: share.get(row.id) ? `${PLATFORM}/t/${share.get(row.id)!.token}` : null,
      };
    }),
  };
});
