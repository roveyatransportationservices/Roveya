import { z } from "zod";
import { check, readBody, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { controls } from "@/lib/server/db";
import { PERMISSION_KEYS, type Permission } from "@/lib/roles";

export const GET = route(async () => {
  await requireAdmin("admins.manage");
  const [roles, admins] = await Promise.all([controls().from("roles").select("*").order("created_at"), controls().from("admins").select("role")]);
  const used = new Map<string, number>();
  for (const row of admins.data ?? []) used.set(row.role, (used.get(row.role) ?? 0) + 1);
  return { roles: check(roles).map((role) => ({ ...role, members: used.get(role.key) ?? 0 })), permissions: PERMISSION_KEYS };
});

const schema = z.object({
  name: z.string().trim().min(2, "Name the role.").max(60),
  description: z.string().trim().max(240).optional().or(z.literal("")),
  permissions: z.array(z.enum(PERMISSION_KEYS as [Permission, ...Permission[]])).min(1, "Tick at least one permission."),
  workspace: z.enum(["admin", "support_desk"]).default("admin"),
});

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "r_$1")
    .slice(0, 36) || "role";

export const POST = route(async (req) => {
  const admin = await requireAdmin("admins.manage");
  const input = await readBody(req, schema);
  let key = slug(input.name);
  if (key.length < 3) key = `${key}_role`;
  const { data: taken } = await controls().from("roles").select("key").like("key", `${key}%`);
  if ((taken ?? []).some((row) => row.key === key)) key = `${key}_${(taken ?? []).length + 1}`;
  const role = check(
    await controls()
      .from("roles")
      .insert({ key, name: input.name, description: input.description || null, permissions: [...new Set(input.permissions)], workspace: input.workspace, created_by: admin.id })
      .select("*")
      .single(),
  );
  await audit(admin, "role.create", "role", key, { name: input.name, permissions: input.permissions, workspace: input.workspace });
  return { role };
});
