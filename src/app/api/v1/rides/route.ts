import { handler, limit, readBody } from "@/lib/platform/gateway";
import { createTrip, listRiderTrips, tripRequestSchema } from "@/lib/platform/rides";
import { requireRider } from "@/lib/platform/session";

export const GET = handler(async (request) => {
  const rider = await requireRider(request);
  return listRiderTrips(rider.user_id);
});

export const POST = handler(async (request) => {
  const rider = await requireRider(request);
  limit(request, "ride-create", 6, 60 * 1000, rider.user_id);
  const input = await readBody(request, tripRequestSchema);
  return createTrip(rider.user_id, input);
});
