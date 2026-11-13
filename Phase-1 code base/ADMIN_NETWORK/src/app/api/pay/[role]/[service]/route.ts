import { ApiError, route, search } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { paymentPeople } from "@/lib/server/payments";
import { isService } from "@/lib/services";

const PERIODS = [7, 30, 90];

// /api/pay/riders/<service> (passengers) or /api/pay/vado/<service> (captains).
export const GET = route<{ role: string; service: string }>(async (req, { role, service }) => {
  await requireAdmin(["view.finance", "view.support"]);
  if ((role !== "riders" && role !== "vado") || !isService(service)) throw new ApiError("Page not found.", 404);
  const days = Number(search(req).get("days"));
  return paymentPeople(role === "vado" ? "captain" : "rider", service, PERIODS.includes(days) ? days : 30);
});
