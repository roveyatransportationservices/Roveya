import { locationSchema, updateLocation } from "@/lib/platform/captains";
import { handler, limit, readBody } from "@/lib/platform/gateway";
import { requireCaptain } from "@/lib/platform/session";

export const POST = handler(async (request) => {
  const captain = await requireCaptain(request, { active: true });
  limit(request, "captain-location", 40, 60 * 1000, captain.user_id);
  const input = await readBody(request, locationSchema);
  return updateLocation(captain.user_id, input);
});
