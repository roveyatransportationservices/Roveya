import { route } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { istDay, istStart, people, type Row } from "@/lib/server/data";
import { db } from "@/lib/server/db";
import { OPEN, owed, rideLine, VEHICLES } from "@/lib/server/rides";

// Captains on duty right now, rides in progress, and today's totals per service.
export const GET = route(async () => {
  await requireAdmin("view.rides");
  const fresh = new Date(Date.now() - 2 * 60000).toISOString();
  const [presence, open, today] = await Promise.all([
    db().from("captain_presence").select("captain_id,vehicle,latitude,longitude,updated_at,online_since,auto_accept").eq("online", true).gte("updated_at", fresh).limit(1000),
    db().from("trips").select("*").in("status", OPEN).order("requested_at").limit(200),
    db().from("trips").select("vehicle,status,fare_paise,discount_paise").gte("requested_at", istStart(istDay())).limit(10000),
  ]);
  const onDuty = (presence.data ?? []) as Row[];
  const rides = (open.data ?? []) as Row[];
  const busy = new Set(rides.map((row) => row.captain_id).filter(Boolean));
  const who = await people([...onDuty.map((row) => row.captain_id), ...rides.flatMap((row) => [row.rider_id, row.captain_id])]);

  const services = VEHICLES.map((vehicle) => {
    const day = ((today.data ?? []) as Row[]).filter((row) => row.vehicle === vehicle);
    const done = day.filter((row) => row.status === "completed");
    const duty = onDuty.filter((row) => row.vehicle === vehicle);
    return {
      vehicle,
      onDuty: duty.length,
      free: duty.filter((row) => !busy.has(row.captain_id)).length,
      searching: rides.filter((row) => row.vehicle === vehicle && row.status === "searching").length,
      inProgress: rides.filter((row) => row.vehicle === vehicle && row.status !== "searching").length,
      requestedToday: day.length,
      completedToday: done.length,
      cancelledToday: day.filter((row) => row.status === "cancelled" || row.status === "expired").length,
      valueTodayPaise: done.reduce((sum, row) => sum + owed(row), 0),
    };
  });

  return {
    services,
    captains: onDuty.map((row) => ({ ...row, onTrip: busy.has(row.captain_id), captain: who.get(row.captain_id) ?? null })),
    rides: rides.map((row) => ({
      ...rideLine(row),
      waitingMin: Math.max(0, Math.round((Date.now() - Date.parse(row.requested_at)) / 60000)),
      rider: who.get(row.rider_id) ?? null,
      captain: row.captain_id ? (who.get(row.captain_id) ?? null) : null,
    })),
  };
});
