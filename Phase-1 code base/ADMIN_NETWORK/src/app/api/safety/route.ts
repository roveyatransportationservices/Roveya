import { check, route, search } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { people, type Row } from "@/lib/server/data";
import { db } from "@/lib/server/db";

export const GET = route(async (req) => {
  await requireAdmin("view.safety");
  const { get, from, to, page, size } = search(req);
  let query = db().from("safety_incidents").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(from, to);
  const status = get("status");
  if (status === "active") query = query.in("status", ["open", "acknowledged"]);
  else if (status && ["open", "acknowledged", "resolved", "false_alarm"].includes(status)) query = query.eq("status", status);
  const kind = get("kind");
  if (kind && ["sos", "deviation", "long_stop", "speeding"].includes(kind)) query = query.eq("kind", kind);
  const result = await query;
  const rows = check(result) as Row[];
  const tripIds = [...new Set(rows.map((row) => row.trip_id).filter(Boolean))];
  const escalatedIds = rows.filter((row) => row.escalation_level > 0).map((row) => row.id);
  const [who, trips, calls] = await Promise.all([
    people(rows.map((row) => row.raised_by)),
    tripIds.length ? db().from("seat_trips").select("id,code,from_city,to_city").in("id", tripIds) : Promise.resolve({ data: [] }),
    escalatedIds.length ? db().from("sos_escalation_calls").select("incident_id,level,name,status,error,created_at,placed_at").in("incident_id", escalatedIds).order("created_at") : Promise.resolve({ data: [] }),
  ]);
  const tripOf = new Map((trips.data ?? []).map((row: Row) => [row.id, row]));
  const callsOf = (id: string) => ((calls.data ?? []) as Row[]).filter((row) => row.incident_id === id);
  return { incidents: rows.map((row) => ({ ...row, person: who.get(row.raised_by) ?? null, trip: tripOf.get(row.trip_id) ?? null, escalationCalls: callsOf(row.id) })), total: result.count ?? 0, page, size };
});
