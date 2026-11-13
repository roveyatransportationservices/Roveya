import { check, route, search, term } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { balances, type Row } from "@/lib/server/data";
import { db } from "@/lib/server/db";
import { onlyService, waitingCaptains } from "@/lib/server/services";
import { can } from "@/lib/roles";
import { isService } from "@/lib/services";

export const GET = route(async (req) => {
  const admin = await requireAdmin("view.captains");
  const { get, from, to, page, size } = search(req);
  let query = db()
    .from("captains")
    .select("user_id,captain_code,name,phone,email,city,gender,status,rating,service,vehicle,vehicle_no,vehicle_model,vehicle_color,created_at,approved_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  const status = get("status");
  const status = get("status");
  if (status && ["review", "active", "suspended"].includes(status)) query = query.eq("status", status);
  // kind = bike | auto | taxi | carpool picks one service; the older service = seats | taxi | all still works.
  const kind = get("kind");
  const service = isService(kind) ? (kind === "carpool" ? "seats" : "taxi") : (get("service") ?? "seats");
  if (isService(kind)) query = onlyService(query, kind) as typeof query;
  else if (service !== "all") query = query.eq("service", service);
  const needle = term(get("q"));
  if (needle) query = query.or(`name.ilike.%${needle}%,phone.ilike.%${needle}%,captain_code.ilike.%${needle}%,city.ilike.%${needle}%`);
  if (get("attention") === "1") {
    const waiting = await waitingCaptains();
    const ids = isService(kind) ? waiting[kind] : Object.values(waiting).flat();
    if (!ids.length) return { captains: [], total: 0, page, size };
    query = query.in("user_id", ids);
  }
  if (get("docs") === "pending") {
    const { data: waiting } = await db().from("captain_documents").select("captain_id").eq("status", "uploaded").limit(5000);
    const ids = [...new Set((waiting ?? []).map((row) => row.captain_id))];
    if (!ids.length) return { captains: [], total: 0, page, size };
    query = query.in("user_id", ids);
  }
  const result = await query;
  const rows = check(result) as Row[];
  const ids = rows.map((row) => row.user_id);
  const [cars, wallets, trips, docs] = await Promise.all([
    ids.length ? db().from("seat_cars").select("id,captain_id,make_model,plate,car_class,layout_kind,status").in("captain_id", ids) : Promise.resolve({ data: [] }),
    can(admin.permissions, "view.finance") ? balances(ids) : Promise.resolve(new Map<string, number>()),
    ids.length ? db().from(service === "taxi" ? "trips" : "seat_trips").select("captain_id,status").in("captain_id", ids).limit(10000) : Promise.resolve({ data: [] }),
    ids.length ? db().from("captain_documents").select("captain_id,status").in("captain_id", ids) : Promise.resolve({ data: [] }),
  ]);
  const docCount = new Map<string, { waiting: number; verified: number; rejected: number }>();
  for (const doc of (docs.data ?? []) as Row[]) {
    const item = docCount.get(doc.captain_id) ?? { waiting: 0, verified: 0, rejected: 0 };
    if (doc.status === "uploaded") item.waiting += 1;
    else if (doc.status === "verified") item.verified += 1;
    else item.rejected += 1;
    docCount.set(doc.captain_id, item);
  }
  const carOf = new Map((cars.data ?? []).map((car: Row) => [car.captain_id, car]));
  const tripCount = new Map<string, { total: number; completed: number }>();
  for (const trip of (trips.data ?? []) as Row[]) {
    const item = tripCount.get(trip.captain_id) ?? { total: 0, completed: 0 };
    item.total += 1;
    if (trip.status === "completed") item.completed += 1;
    tripCount.set(trip.captain_id, item);
  }
  return {
    captains: rows.map((row) => ({ ...row, car: carOf.get(row.user_id) ?? null, walletPaise: wallets.get(row.user_id) ?? null, trips: tripCount.get(row.user_id) ?? { total: 0, completed: 0 }, docs: docCount.get(row.user_id) ?? { waiting: 0, verified: 0, rejected: 0 } })),
    total: result.count ?? 0,
    page,
    size,
  };
});
