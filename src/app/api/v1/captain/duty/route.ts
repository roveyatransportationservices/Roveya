import { dutySchema, setDuty } from "@/lib/platform/captains";
import { handler, readBody } from "@/lib/platform/gateway";
import { requireCaptain } from "@/lib/platform/session";

export const POST = handler(async (request) => {
  const captain = await requireCaptain(request, { active: true });
  const input = await readBody(request, dutySchema);
  return setDuty(captain, input);
});
