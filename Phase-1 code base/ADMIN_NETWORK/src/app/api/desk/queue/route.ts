import { ApiError, route, search } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { deskQueue } from "@/lib/server/desk";
import { isService } from "@/lib/services";

// New Vado waiting for the Support Desk in one service, most urgent first.
export const GET = route(async (req) => {
  await requireAdmin(["captains.review", "view.captains"]);
  const { get } = search(req);
  const service = get("service") ?? "bike";
  if (!isService(service)) throw new ApiError("Pick a service.", 400);
  return deskQueue(service, get("city"));
});
