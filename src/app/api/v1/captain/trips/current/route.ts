import { handler } from "@/lib/platform/gateway";
import { captainTrip } from "@/lib/platform/rides";
import { requireCaptain } from "@/lib/platform/session";

export const GET = handler(async (request) => {
  const captain = await requireCaptain(request, { active: true });
  return captainTrip(captain.user_id);
});
