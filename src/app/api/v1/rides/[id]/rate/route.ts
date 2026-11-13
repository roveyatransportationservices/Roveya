import { handler, readBody } from "@/lib/platform/gateway";
import { rateTrip, ratingSchema } from "@/lib/platform/rides";
import { requireRider } from "@/lib/platform/session";

export const POST = handler<{ id: string }>(async (request, { id }) => {
  const rider = await requireRider(request);
  const input = await readBody(request, ratingSchema);
  return rateTrip("rider", rider.user_id, id, input);
});
