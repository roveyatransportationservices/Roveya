import { check, route } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { controls } from "@/lib/server/db";

// Who work can be assigned to.
export const GET = route(async () => {
  await requireAdmin("tasks.assign");
  const [admins, roles] = await Promise.all([controls().from("admins").select("id,name,role").eq("active", true).order("name"), controls().from("roles").select("key,name")]);
  const roleName = new Map((roles.data ?? []).map((row) => [row.key, row.name]));
  return { team: check(admins).map((row) => ({ ...row, roleName: roleName.get(row.role) ?? row.role })) };
});
