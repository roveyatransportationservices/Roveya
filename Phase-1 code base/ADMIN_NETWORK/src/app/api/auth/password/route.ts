import { z } from "zod";
import { readBody, route } from "@/lib/server/api";
import { audit, changePassword, requireAdmin } from "@/lib/server/auth";

const schema = z.object({ current: z.string().min(1, "Enter your current password."), next: z.string().max(200) });

export const POST = route(async (req) => {
  const admin = await requireAdmin();
  const input = await readBody(req, schema);
  await changePassword(admin, input.current, input.next);
  await audit(admin, "admin.password", "admin", admin.id);
  return { ok: true };
});
