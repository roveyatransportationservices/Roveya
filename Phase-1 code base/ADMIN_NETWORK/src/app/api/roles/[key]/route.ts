import { z } from "zod";
import { ApiError, check, readBody, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { controls } from "@/lib/server/db";
import { PERMISSION_KEYS, type Permission } from "@/lib/roles";

const schema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(240).optional().or(z.literal("")),
  permissions: z.array(z.enum(PERMISSION_KEYS as [Permission, ...Permission[]])).min(1, "Tick at least one permission.").optional(),
  workspace: z.enum(["admin", "support_desk"]).optional(),
});

const validKey = (key: string) => {
  if (!/^[a-z][a-z0-9_]{2,39}$/.test(key)) throw new ApiError("Role not found.", 404);
  return key;
};

// The founder role always has everything and cannot be edited or removed.
export const PATCH = route<{ key: string }>(async (req, { key }) => {
  const admin = await requireAdmin("admins.manage");
  validKey(key);
  if (key === "super_admin") throw new ApiError("The founder role always has every permission.", 409);
  const input = await readBody(req, schema);
  const fields: Record<string, unknown> = {};
  if (input.name) fields.name = input.name;
  if (input.description !== undefined) fields.description = input.description || null;
  if (input.permissions) fields.permissions = [...new Set(input.permissions)];
  if (input.workspace) fields.workspace = input.workspace;
  if (!Object.keys(fields).length) throw new ApiError("Nothing to change.", 400);
  const role = check(await controls().from("roles").update(fields).eq("key", key).select("*").maybeSingle(), "Role not found.");
  // Signed-in members pick up a new workspace or permissions on their next sign-in.
  if (input.workspace || input.permissions) {
    const { data: members } = await controls().from("admins").select("id").eq("role", key);
    const ids = (members ?? []).map((row) => row.id);
    if (ids.length) await controls().from("sessions").delete().in("admin_id", ids);
  }
  await audit(admin, "role.update", "role", key, fields);
  return { role };
});

export const DELETE = route<{ key: string }>(async (_req, { key }) => {
  const admin = await requireAdmin("admins.manage");
  validKey(key);
  if (key === "super_admin") throw new ApiError("The founder role cannot be removed.", 409);
  const { count: members } = await controls().from("admins").select("id", { count: "exact", head: true }).eq("role", key);
  if (members) throw new ApiError(`${members} team member${members > 1 ? "s use" : " uses"} this role. Move them to another role first.`, 409);
  check(await controls().from("roles").delete().eq("key", key).select("key").maybeSingle(), "Role not found.");
  await audit(admin, "role.delete", "role", key);
  return { deleted: true };
});
