import { handler, limit, readBody } from "@/lib/platform/gateway";
import { quoteSchema, quoteTrip } from "@/lib/platform/rides";
import { requireRider } from "@/lib/platform/session";

export const POST = handler(async (request) => {
  const rider = await requireRider(request);
  limit(request, "ride-quote", 60, 60 * 1000, rider.user_id);
  const input = await readBody(request, quoteSchema);
  return quoteTrip(rider.user_id, input);
});
