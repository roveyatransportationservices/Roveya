import { ApiError, mustId, route, search } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { personPayments } from "@/lib/server/payments";
import { isService } from "@/lib/services";

const PERIODS = [7, 30, 90];

export const GET = route<{ role: string; service: string; id: string }>(async (req, { role, service, id }) => {
  await requireAdmin(["view.finance", "view.support"]);
  if ((role !== "riders" && role !== "vado") || !isService(service)) throw new ApiError("Page not found.", 404);
  const days = Number(search(req).get("days"));
  return personPayments(role === "vado" ? "captain" : "rider", service, mustId(id, role === "vado" ? "Captain" : "Passenger"), PERIODS.includes(days) ? days : 30);
});
