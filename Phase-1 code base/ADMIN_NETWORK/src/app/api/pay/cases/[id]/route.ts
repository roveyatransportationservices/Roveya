import { z } from "zod";
import { ApiError, check, readBody, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { controls } from "@/lib/server/db";

const schema = z.object({
  status: z.enum(["open", "watching", "resolved"]).optional(),
  note: z.string().trim().min(3, "Write a short note.").max(1000),
});

// Adds a note to a case and moves it to open, watching or resolved.
export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const admin = await requireAdmin(["money.wallets", "support.reply"]);
  if (!/^\d+$/.test(id)) throw new ApiError("Case not found.", 404);
  const input = await readBody(req, schema);
  const current = check(await controls().from("money_cases").select("*").eq("id", id).maybeSingle(), "Case not found.");
  const status = input.status ?? current.status;
  const notes = [...(current.notes ?? []), { at: new Date().toISOString(), by: admin.name, text: input.note, status }];
  const row = check(await controls().from("money_cases").update({ status, notes, resolved_at: status === "resolved" ? new Date().toISOString() : null }).eq("id", id).select("*").single());
  await audit(admin, `money_case.${status === current.status ? "note" : status}`, "money_case", id, { code: current.code, from: current.status, to: status, note: input.note });
  return { case: row };
});
