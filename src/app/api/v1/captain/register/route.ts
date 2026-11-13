import { registerCaptain, registerSchema } from "@/lib/platform/captains";
import { handler, limit, readBody } from "@/lib/platform/gateway";
import { requireUser } from "@/lib/platform/session";

export const POST = handler(async (request) => {
  const user = await requireUser(request);
  limit(request, "captain-register", 5, 10 * 60 * 1000, user.userId);
  const input = await readBody(request, registerSchema);
  return registerCaptain(user.userId, user.phone, input);
});
