import { check, route, search } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { people, type Row } from "@/lib/server/data";
import { db } from "@/lib/server/db";

export const GET = route(async (req) => {
  await requireAdmin("view.finance");
  const { get, from, to, page, size } = search(req);
  let query = db().from("payout_requests").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(from, to);
  const status = get("status");
  if (status && ["requested", "paid", "rejected"].includes(status)) query = query.eq("status", status);
  const captain = get("captain");
  if (captain) query = query.eq("captain_id", captain);
  const result = await query;
  const rows = check(result) as Row[];
  const ids = rows.map((row) => row.captain_id);
  const [who, banks] = await Promise.all([
    people(ids),
    ids.length ? db().from("captains").select("user_id,bank_holder,ifsc,upi").in("user_id", ids) : Promise.resolve({ data: [] }),
  ]);
  const bankOf = new Map((banks.data ?? []).map((row: Row) => [row.user_id, row]));
  const { data: open } = await db().from("payout_requests").select("amount_paise").eq("status", "requested").limit(5000);
  return {
    payouts: rows.map((row) => ({ ...row, captain: who.get(row.captain_id) ?? null, bank: bankOf.get(row.captain_id) ?? null })),
    total: result.count ?? 0,
    page,
    size,
    openPaise: (open ?? []).reduce((sum, row) => sum + Number(row.amount_paise), 0),
    openCount: open?.length ?? 0,
  };
});
