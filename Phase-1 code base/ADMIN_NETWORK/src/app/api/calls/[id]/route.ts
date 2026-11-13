import { z } from "zod";
import { ApiError, check, readBody, route } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { controls } from "@/lib/server/db";

const schema = z.object({
  outcome: z.enum(["reached", "no_answer", "busy", "wrong_number", "callback"]),
  note: z.string().trim().max(1000).optional(),
});

// After a bridged call, the caller records how it went.
export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const admin = await requireAdmin("calls.make");
  if (!/^\d{1,18}$/.test(id)) throw new ApiError("Call not found.", 404);
  const input = await readBody(req, schema);
  const call = check(await controls().from("call_log").update({ outcome: input.outcome, note: input.note || null }).eq("id", id).eq("admin_id", admin.id).select("*").maybeSingle(), "Call not found.");
  return { call };
});
