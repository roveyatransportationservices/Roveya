import { z } from "zod";
import { ApiError, check, readBody, route, search, term } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { controls } from "@/lib/server/db";
import { can } from "@/lib/roles";

const STATUSES = ["todo", "in_progress", "done", "cancelled"];

// "mine" is everyone's own list; "all" and "created" need the assign permission.
export const GET = route(async (req) => {
  const admin = await requireAdmin();
  const { get, from, to, page, size } = search(req);
  const scope = get("scope") ?? "mine";
  if (scope !== "mine" && !can(admin.permissions, "tasks.assign")) throw new ApiError("Only people who assign work can see everyone's tasks.", 403);
  let query = controls().from("tasks").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(from, to);
  if (scope === "mine") query = query.eq("assigned_to", admin.id);
  if (scope === "created") query = query.eq("created_by", admin.id);
  const assignee = get("assignee");
  if (assignee && scope === "all") query = query.eq("assigned_to", assignee);
  const status = get("status");
  if (status === "open") query = query.in("status", ["todo", "in_progress"]);
  else if (status && STATUSES.includes(status)) query = query.eq("status", status);
  const needle = term(get("q"));
  if (needle) query = query.or(`title.ilike.%${needle}%,code.ilike.%${needle}%`);
  const result = await query;
  const rows = check(result);
  const ids = [...new Set(rows.flatMap((row) => [row.assigned_to, row.created_by]).filter(Boolean))];
  const { data: people } = ids.length ? await controls().from("admins").select("id,name,role").in("id", ids) : { data: [] };
  const who = new Map((people ?? []).map((row) => [row.id, row]));
  return {
    tasks: rows.map((row) => ({ ...row, assignee: who.get(row.assigned_to) ?? null, creator: who.get(row.created_by) ?? null })),
    total: result.count ?? 0,
    page,
    size,
  };
});

const taskSchema = z.object({
  title: z.string().trim().min(3, "Write what needs to be done.").max(120),
  details: z.string().trim().max(2000).optional().or(z.literal("")),
  assignedTo: z.string().uuid("Pick who does it."),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  entity: z.enum(["captain", "traveller", "trip", "booking", "ticket", "safety", "payout", "other"]).optional(),
  entityId: z.string().max(80).optional(),
  link: z.string().regex(/^\/[A-Za-z0-9/_?=&.-]*$/).max(200).optional(),
});

export const POST = route(async (req) => {
  const admin = await requireAdmin("tasks.assign");
  const input = await readBody(req, taskSchema);
  const { data: person } = await controls().from("admins").select("id,active").eq("id", input.assignedTo).maybeSingle();
  if (!person?.active) throw new ApiError("That team member is switched off or no longer exists.", 400);
  const task = check(
    await controls()
      .from("tasks")
      .insert({ title: input.title, details: input.details || null, assigned_to: input.assignedTo, created_by: admin.id, priority: input.priority, due_at: input.dueAt ?? null, entity: input.entity ?? null, entity_id: input.entityId ?? null, link: input.link ?? null })
      .select("*")
      .single(),
  );
  await audit(admin, "task.create", "task", task.id, { title: input.title, assignedTo: input.assignedTo });
  return { task };
});
