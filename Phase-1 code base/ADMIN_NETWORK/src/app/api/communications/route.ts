import { route } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { publicEvent } from "@/lib/server/deliveryStore";

const columns = "event_key,kind,channel,audience,status,attempts,last_error,created_at";

export const GET = route(async () => {
  await requireAdmin(["notify.send", "view.audit"]);
  const { data, error } = await db().from("communication_events").select(columns).order("created_at", { ascending: false }).limit(50);
  if (error) return { pendingSchema: true, events: [] };
  return { pendingSchema: false, events: ((data ?? []) as Record<string, unknown>[]).map(publicEvent) };
});
