import { adEventSchema, trackAd } from "@/lib/platform/ads";
import { handler, limit, readBody } from "@/lib/platform/gateway";
import { requireUser } from "@/lib/platform/session";

export const POST = handler(async (request) => {
  const user = await requireUser(request);
  limit(request, "ads-events", 120, 60 * 1000, user.userId);
  const input = await readBody(request, adEventSchema);
  return trackAd(user.userId, input);
});
