import { handler } from "@/lib/platform/gateway";
import { riderView } from "@/lib/platform/rides";
import { requireRider } from "@/lib/platform/session";

export const GET = handler<{ id: string }>(async (request, { id }) => {
  const rider = await requireRider(request);
  return riderView(rider.user_id, id);
});
