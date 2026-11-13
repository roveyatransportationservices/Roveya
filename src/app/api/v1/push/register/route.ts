import { z } from "zod";
import { handler, limit, readBody } from "@/lib/platform/gateway";
import { requireUser } from "@/lib/platform/session";
import { pushTokenSchema, registerPushToken, removePushToken } from "@/lib/platform/support";

export const POST = handler(async (request) => {
  const user = await requireUser(request);
  limit(request, "push-register", 20, 60 * 60 * 1000, user.userId);
  return registerPushToken(user.userId, await readBody(request, pushTokenSchema));
});

export const DELETE = handler(async (request) => {
  const user = await requireUser(request);
  const input = await readBody(request, z.object({ token: z.string().min(10).max(200) }));
  return removePushToken(user.userId, input.token);
});
