import { check, route, search } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { controls } from "@/lib/server/db";

// Access requests: people who asked to join the team, waiting for the CEO.
export const GET = route(async (req) => {
  await requireAdmin("admins.manage");
  const status = search(req).get("status");
  let query = controls().from("access_requests").select("*").order("created_at", { ascending: false }).limit(200);
  if (status && ["pending", "approved", "rejected"].includes(status)) query = query.eq("status", status);
  const rows = check(await query);
  const ids = [...new Set(rows.flatMap((row) => [row.requested_by, row.decided_by]).filter(Boolean))];
  const { data: names } = ids.length ? await controls().from("admins").select("id,name").in("id", ids) : { data: [] };
  const nameOf = new Map((names ?? []).map((row) => [row.id, row.name]));
  return { requests: rows.map((row) => ({ ...row, requestedByName: nameOf.get(row.requested_by) ?? null, decidedByName: nameOf.get(row.decided_by) ?? null })) };
});
