import { route } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { count } from "@/lib/server/data";
import { controls, db } from "@/lib/server/db";
import { waitingCaptains } from "@/lib/server/services";
import { can } from "@/lib/roles";
import { SERVICE_KEYS, serviceOfCaptain, type ServiceKey } from "@/lib/services";

// Badge counts for the sidebar and top bar, polled every minute. Each person sees only their areas.
export const GET = route(async () => {
  const admin = await requireAdmin();
  const has = (key: Parameters<typeof can>[1]) => can(admin.permissions, key);
  const zero = Promise.resolve(0);
  const [sos, tickets, docs, payouts, tasks, waiting] = await Promise.all([
    has("view.safety") ? count("safety_incidents", (q) => q.in("status", ["open", "acknowledged"])) : zero,
    has("view.support") ? count("support_tickets", (q) => q.eq("status", "open")) : zero,
    has("view.captains") ? count("captain_documents", (q) => q.eq("status", "uploaded")) : zero,
    has("view.finance") ? count("payout_requests", (q) => q.eq("status", "requested")) : zero,
    controls()
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", admin.id)
      .in("status", ["todo", "in_progress"])
      .then((result) => result.count ?? 0, () => 0),
    has("view.captains") ? waitingCaptains() : Promise.resolve(null),
  ]);
  // Captains waiting for the desk in each service: new registrations, documents or cars to check.
  // Captains (Vado) waiting for the desk in each service.
  const vado = Object.fromEntries(SERVICE_KEYS.map((key) => [key, waiting?.[key].length ?? 0])) as Record<ServiceKey, number>;
  const captains = SERVICE_KEYS.reduce((sum, key) => sum + vado[key], 0);
  // Payouts waiting in each service, for the Vado Payments menu items.
  const payoutsBy = Object.fromEntries(SERVICE_KEYS.map((key) => [key, 0])) as Record<ServiceKey, number>;
  if (has("view.finance") && payouts) {
    const { data: open } = await db().from("payout_requests").select("captain_id").eq("status", "requested").limit(5000);
    const ids = [...new Set((open ?? []).map((row) => row.captain_id as string))];
    const { data: who } = ids.length ? await db().from("captains").select("user_id,service,vehicle").in("user_id", ids) : { data: [] };
    const serviceOf = new Map((who ?? []).map((row) => [row.user_id as string, serviceOfCaptain(row)]));
    for (const row of open ?? []) {
      const key = serviceOf.get(row.captain_id as string);
      if (key) payoutsBy[key] += 1;
    }
  }
  // People waiting for the CEO to approve their team email.
  const requests = has("admins.manage") ? await controls().from("access_requests").select("id", { count: "exact", head: true }).eq("status", "pending").then((result) => result.count ?? 0, () => 0) : 0;
  // SOS presses nobody acknowledged in time, so the on-call people were rung.
  const sosEscalated = has("view.safety") && sos ? await count("safety_incidents", (q) => q.eq("kind", "sos").eq("status", "open").gt("escalation_level", 0)) : 0;
  return { sos, sosEscalated, tickets, captains, docs, payouts, tasks, vado, payoutsBy, requests };
});
