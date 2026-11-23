import { z } from "zod";
import { ApiError, check, mustId, readBody, route } from "@/lib/server/api";
import { audit, hashPassword, requireAdmin } from "@/lib/server/auth";
import { controls } from "@/lib/server/db";
import { ADMIN_COLUMNS, oneTimePassword, roleExists } from "@/lib/server/team";

const schema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  role: z.string().regex(/^[a-z][a-z0-9_]{2,39}$/).optional(),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number.").or(z.literal("")).optional(),
  active: z.boolean().optional(),
  resetPassword: z.boolean().optional(),
});

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const admin = await requireAdmin("admins.manage");
  mustId(id, "Admin");
  const input = await readBody(req, schema);
  if (id === admin.id && (input.active === false || (input.role && input.role !== admin.role))) {
    throw new ApiError("You cannot switch off or change the role of your own account. Ask another super admin.", 409);
  }
  if (input.role) await roleExists(input.role);
  const fields: Record<string, unknown> = {};
  if (input.name) fields.name = input.name;
  if (input.role) fields.role = input.role;
  if (input.phone !== undefined) fields.phone = input.phone || null;
  if (input.active !== undefined) fields.active = input.active;
  let password: string | null = null;
  if (input.resetPassword) {
    password = oneTimePassword();
    Object.assign(fields, { password_hash: await hashPassword(password), must_change_password: true, failed_logins: 0, locked_until: null });
  }
  if (!Object.keys(fields).length) throw new ApiError("Nothing to change.", 400);
  const saved = check(await controls().from("admins").update(fields).eq("id", id).select(ADMIN_COLUMNS).maybeSingle(), "Admin not found.");
  if (input.active === false || input.resetPassword || input.role) await controls().from("sessions").delete().eq("admin_id", id);
  await audit(admin, input.resetPassword ? "admin.reset_password" : "admin.update", "admin", id, { name: input.name, role: input.role, active: input.active, phone: input.phone });
  return { admin: saved, password };
});

export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  const admin = await requireAdmin("admins.manage");
  mustId(id, "Admin");
  if (id === admin.id) throw new ApiError("You cannot remove your own account.", 409);
  const removed = check(await controls().from("admins").delete().eq("id", id).select("email").maybeSingle(), "Admin not found.");
  await audit(admin, "admin.delete", "admin", id, { email: removed.email });
  return { deleted: true };
});
