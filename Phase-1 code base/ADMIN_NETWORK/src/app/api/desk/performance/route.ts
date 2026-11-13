import { route, search } from "@/lib/server/api";
import { can } from "@/lib/roles";
import { requireAdmin } from "@/lib/server/auth";
import { deskPerformance } from "@/lib/server/desk";

const PERIODS = [1, 7, 30, 90];

// The founder and managers see everyone; a support executive sees only their own numbers.
export const GET = route(async (req) => {
  const admin = await requireAdmin();
  const days = Number(search(req).get("days"));
  const everyone = admin.role === "super_admin" || can(admin.permissions, "admins.manage") || can(admin.permissions, "view.audit");
  const data = await deskPerformance(PERIODS.includes(days) ? days : 7, everyone ? undefined : admin.id);
  return { ...data, scope: everyone ? "team" : "me" };
});
