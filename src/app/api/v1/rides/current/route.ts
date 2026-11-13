import { handler } from "@/lib/platform/gateway";
import { currentRiderTrip } from "@/lib/platform/rides";
import { requireRider } from "@/lib/platform/session";

export const GET = handler(async (request) => {
  const rider = await requireRider(request);
  return currentRiderTrip(rider.user_id);
});
