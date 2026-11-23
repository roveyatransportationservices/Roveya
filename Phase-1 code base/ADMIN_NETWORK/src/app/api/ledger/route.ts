import { check, route, search } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { people, PLATFORM_WALLET, type Row } from "@/lib/server/data";
import { db } from "@/lib/server/db";

// Every wallet movement: traveller payments, refunds, captain earnings, payouts, adjustments.
export const GET = route(async (req) => {
  await requireAdmin("view.finance");
  const { get, from, to, page, size } = search(req);
  let query = db().from("ledger_entries").select("*", { count: "exact" }).order("id", { ascending: false }).range(from, to);
  const owner = get("owner");
  if (owner === "platform") query = query.eq("owner_id", PLATFORM_WALLET);
  else if (owner) query = query.eq("owner_id", owner);
  else query = query.neq("owner_id", PLATFORM_WALLET);
  const kind = get("kind");
  if (kind && /^[a-z_]{3,30}$/.test(kind)) query = query.eq("kind", kind);
  const result = await query;
  const rows = check(result) as Row[];
  const who = await people(rows.map((row) => row.owner_id));
  return { entries: rows.map((row) => ({ ...row, owner: who.get(row.owner_id) ?? (row.owner_id === PLATFORM_WALLET ? { name: "ROVEYA", kind: "Platform" } : null) })), total: result.count ?? 0, page, size };
});
