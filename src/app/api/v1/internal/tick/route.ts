import { timingSafeEqual } from "crypto";
import { AppError } from "@/lib/errors";
import { tick } from "@/lib/platform/desk";
import { handler } from "@/lib/platform/gateway";

function authorised(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const received = request.headers.get("x-cron-secret")?.trim() ?? "";
  if (!expected || expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export const POST = handler(async (request) => {
  if (!authorised(request)) throw new AppError("Unauthorized", 401);
  return tick();
});
