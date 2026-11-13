import { handler } from "@/lib/platform/gateway";
import { currentOffer } from "@/lib/platform/rides";
import { requireCaptain } from "@/lib/platform/session";

export const GET = handler(async (request) => {
  const captain = await requireCaptain(request, { active: true });
  return currentOffer(captain.user_id);
});
