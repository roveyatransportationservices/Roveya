import { check, route, search, term } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { controls } from "@/lib/server/db";

export const GET = route(async (req) => {
  await requireAdmin("view.audit");
  const { get, from, to, page, size } = search(req);
  let query = controls().from("audit_log").select("*", { count: "exact" }).order("at", { ascending: false }).range(from, to);
  const entity = get("entity");
  if (entity && /^[a-z_]{2,40}$/.test(entity)) query = query.eq("entity", entity);
  const id = get("id");
  if (id) query = query.eq("entity_id", id);
  const needle = term(get("q"));
  if (needle) query = query.or(`action.ilike.%${needle}%,admin_email.ilike.%${needle}%`);
  const result = await query;
  return { entries: check(result), total: result.count ?? 0, page, size };
});
