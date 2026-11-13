import { check, route, search, term } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { people, type Row } from "@/lib/server/data";
import { db } from "@/lib/server/db";

export const GET = route(async (req) => {
  await requireAdmin("view.support");
  const { get, from, to, page, size } = search(req);
  let query = db().from("support_tickets").select("*", { count: "exact" }).order("last_message_at", { ascending: false }).range(from, to);
  const status = get("status");
  if (status === "active") query = query.in("status", ["open", "pending"]);
  else if (status && ["open", "pending", "resolved", "closed"].includes(status)) query = query.eq("status", status);
  const app = get("app");
  if (app && ["rider", "captain"].includes(app)) query = query.eq("app", app);
  const kind = get("kind");
  if (kind === "feedback") query = query.ilike("topic", "Feedback%");
  if (kind === "call") query = query.eq("channel", "call");
  if (kind === "email") query = query.eq("channel", "email");
  const needle = term(get("q"));
  if (needle) query = query.or(`code.ilike.%${needle}%,topic.ilike.%${needle}%,trip_code.ilike.%${needle}%`);
  const result = await query;
  const rows = check(result) as Row[];
  const who = await people(rows.map((row) => row.user_id));
  return { tickets: rows.map((row) => ({ ...row, person: who.get(row.user_id) ?? null })), total: result.count ?? 0, page, size };
});
