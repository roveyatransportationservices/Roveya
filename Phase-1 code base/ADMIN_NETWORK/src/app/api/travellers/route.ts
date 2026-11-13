import { check, route, search, term } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { balances, type Row } from "@/lib/server/data";
import { db } from "@/lib/server/db";
import { customerIds } from "@/lib/server/services";
import { isService, SERVICE_INFO, type ServiceKey } from "@/lib/services";

type Stats = { bookings: number; completed: number; spentPaise: number; lastAt: string | null };

// What each passenger did on one service. Carpool counts seat bookings; Bike, Auto and Taxi count rides.
async function statsFor(kind: ServiceKey | null, ids: string[]) {
  const stats = new Map<string, Stats>();
  if (!ids.length) return stats;
  const add = (id: string, at: string, done: boolean, paid: number) => {
    const item = stats.get(id) ?? { bookings: 0, completed: 0, spentPaise: 0, lastAt: null };
    item.bookings += 1;
    if (done) {
      item.completed += 1;
      item.spentPaise += paid;
    }
    if (!item.lastAt || at > item.lastAt) item.lastAt = at;
    stats.set(id, item);
  };
  if (!kind || kind === "carpool") {
    const { data } = await db().from("seat_bookings").select("rider_id,status,total_paise,cash_paise,created_at").in("rider_id", ids).in("status", ["confirmed", "completed", "cancelled"]).limit(20000);
    for (const row of (data ?? []) as Row[]) add(row.rider_id, row.created_at, row.status !== "cancelled", Number(row.total_paise) + Number(row.cash_paise));
  }
  if (!kind || kind !== "carpool") {
    let query = db().from("trips").select("rider_id,status,fare_paise,discount_paise,requested_at").in("rider_id", ids).limit(20000);
    if (kind) query = query.eq("vehicle", SERVICE_INFO[kind].vehicle);
    const { data } = await query;
    for (const row of (data ?? []) as Row[]) add(row.rider_id, row.requested_at, row.status === "completed", Number(row.fare_paise) - Number(row.discount_paise ?? 0));
  }
  return stats;
}

export const GET = route(async (req) => {
  await requireAdmin("view.travellers");
  const { get, from, to, page, size } = search(req);
  const kind = isService(get("kind")) ? (get("kind") as ServiceKey) : null;
  let query = db().from("riders").select("user_id,name,phone,email,created_at", { count: "exact" }).order("created_at", { ascending: false }).range(from, to);
  if (kind) {
    const ids = await customerIds(kind);
    if (!ids.length) return { travellers: [], total: 0, page, size };
    query = query.in("user_id", ids);
  }
  const needle = term(get("q"));
  if (needle) query = query.or(`name.ilike.%${needle}%,phone.ilike.%${needle}%,email.ilike.%${needle}%`);
  const result = await query;
  const rows = check(result) as Row[];
  const ids = rows.map((row) => row.user_id);
  const [wallets, stats] = await Promise.all([balances(ids), statsFor(kind, ids)]);
  return {
    travellers: rows.map((row) => ({ ...row, walletPaise: wallets.get(row.user_id) ?? 0, ...(stats.get(row.user_id) ?? { bookings: 0, completed: 0, spentPaise: 0, lastAt: null }) })),
    total: result.count ?? 0,
    page,
    size,
  };
});
