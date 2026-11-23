import { z } from "zod";
import { ApiError, check, mustId, readBody, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { controls } from "@/lib/server/db";
import { can } from "@/lib/roles";

const schema = z.object({
  status: z.enum(["todo", "in_progress", "done", "cancelled"]).optional(),
  note: z.string().trim().max(600).optional(),
  title: z.string().trim().min(3).max(120).optional(),
  details: z.string().trim().max(2000).optional().or(z.literal("")),
  assignedTo: z.string().uuid().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
});

// The person doing the task can move it along and leave a note; the assigner can change anything.
export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const admin = await requireAdmin();
  mustId(id, "Task");
  const input = await readBody(req, schema);
  const task = check(await controls().from("tasks").select("*").eq("id", id).maybeSingle(), "Task not found.");
  const manager = can(admin.permissions, "tasks.assign");
  if (!manager && task.assigned_to !== admin.id) throw new ApiError("This task is not assigned to you.", 403);
  const editing = input.title || input.details !== undefined || input.assignedTo || input.priority || input.dueAt !== undefined;
  if (editing && !manager) throw new ApiError("Only the person who assigns work can change the task itself.", 403);
  const fields: Record<string, unknown> = {};
  if (input.status) {
    fields.status = input.status;
    fields.completed_at = input.status === "done" ? new Date().toISOString() : null;
  }
  if (input.note) fields.last_note = `${admin.name}: ${input.note}`.slice(0, 600);
  if (input.title) fields.title = input.title;
  if (input.details !== undefined) fields.details = input.details || null;
  if (input.assignedTo) fields.assigned_to = input.assignedTo;
  if (input.priority) fields.priority = input.priority;
  if (input.dueAt !== undefined) fields.due_at = input.dueAt;
  if (!Object.keys(fields).length) throw new ApiError("Nothing to change.", 400);
  const saved = check(await controls().from("tasks").update(fields).eq("id", id).select("*").single());
  await audit(admin, input.status ? `task.${input.status}` : "task.update", "task", id, { ...input });
  return { task: saved };
});

export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  const admin = await requireAdmin("tasks.assign");
  mustId(id, "Task");
  check(await controls().from("tasks").delete().eq("id", id).select("id").maybeSingle(), "Task not found.");
  await audit(admin, "task.delete", "task", id);
  return { deleted: true };
});
