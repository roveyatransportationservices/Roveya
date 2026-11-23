import { ApiError, route, search } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { captainLive, isLiveService } from "@/lib/server/live";

const PERIODS = [7, 30, 90];

// Bike, Auto or Car: captain registrations and activity, and rides happening now.
export const GET = route<{ service: string }>(async (req, { service }) => {
  await requireAdmin(["view.rides", "view.captains"]);
  if (!isLiveService(service)) throw new ApiError("Pick Bike, Auto or Car.", 404);
  const days = Number(search(req).get("days"));
  return captainLive(service, PERIODS.includes(days) ? days : 30);
});
