import { z } from "zod";
import { handler, limit, readBody } from "@/lib/platform/gateway";
import { refreshSession } from "@/lib/platform/session";

const schema = z.object({ refreshToken: z.string().min(10) });

export const POST = handler(async (request) => {
  limit(request, "auth-refresh", 60, 10 * 60 * 1000);
  const input = await readBody(request, schema);
  return refreshSession(input.refreshToken);
});
