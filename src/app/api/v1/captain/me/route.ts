import { captainProfile, updateCaptain, updateSchema } from "@/lib/platform/captains";
import { handler, readBody } from "@/lib/platform/gateway";
import { requireCaptain } from "@/lib/platform/session";

export const GET = handler(async (request) => captainProfile(await requireCaptain(request)));

export const PATCH = handler(async (request) => {
  const captain = await requireCaptain(request);
  const input = await readBody(request, updateSchema);
  return updateCaptain(captain.user_id, input);
});
