import { z } from "zod";
import { check, mustId, readBody, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

const schema = z.object({
  status: z.enum(["open", "acknowledged", "resolved", "false_alarm"]),
  note: z.string().trim().max(600).optional(),
});

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const admin = await requireAdmin("safety.respond");
  mustId(id, "Alert");
  const input = await readBody(req, schema);
  const before = check(await db().from("safety_incidents").select("status,notes").eq("id", id).maybeSingle(), "Alert not found.");
  const stamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const notes = input.note ? `${before.notes ? `${before.notes}\n` : ""}[${stamp} · ${admin.name}] ${input.note}`.slice(-4000) : before.notes;
  const incident = check(
    await db()
      .from("safety_incidents")
      .update({
        status: input.status,
        notes,
        ...(input.status === "acknowledged" ? { acknowledged_at: new Date().toISOString() } : null),
        ...(input.status === "resolved" || input.status === "false_alarm" ? { resolved_at: new Date().toISOString() } : null),
      })
      .eq("id", id)
      .select("*")
      .single(),
  );
  await audit(admin, `safety.${input.status}`, "safety_incident", id, { from: before.status, note: input.note ?? null });
  return { incident };
});
