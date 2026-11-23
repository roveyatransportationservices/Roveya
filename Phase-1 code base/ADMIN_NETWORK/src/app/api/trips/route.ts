import { check, route, search, term } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { istStart, shiftIst } from "@/lib/server/data";
import { controls } from "@/lib/server/db";

export const GET = route(async (req) => {
  await requireAdmin("view.trips");
  const { get, from, to, page, size } = search(req);
  let query = controls().from("trip_finance").select("*", { count: "exact" }).range(from, to);
  const status = get("status");
  if (status && ["scheduled", "on_trip", "completed", "cancelled"].includes(status)) query = query.eq("status", status);
  const needle = term(get("q"));
  if (needle) query = query.or(`code.ilike.%${needle}%,captain_name.ilike.%${needle}%,plate.ilike.%${needle}%,captain_code.ilike.%${needle}%`);
  const day = get("from");
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) query = query.gte("depart_at", istStart(day));
  const until = get("to");
  if (until && /^\d{4}-\d{2}-\d{2}$/.test(until)) query = query.lt("depart_at", istStart(shiftIst(until, 1)));
  const captain = get("captain");
  if (captain) query = query.eq("captain_id", captain);
  query = get("sort") === "upcoming" ? query.order("depart_at", { ascending: true }) : query.order("depart_at", { ascending: false });
  const result = await query;
  return { trips: check(result), total: result.count ?? 0, page, size };
});
