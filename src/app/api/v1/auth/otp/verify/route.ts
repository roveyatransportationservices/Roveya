import { z } from "zod";
import { handler, limit, readBody } from "@/lib/platform/gateway";
import { verifyOtp } from "@/lib/platform/session";

const schema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number."),
  app: z.enum(["rider", "captain"]),
  code: z.string().regex(/^\d{4}$/, "Enter the 4-digit code."),
});

export const POST = handler(async (request) => {
  limit(request, "otp-verify", 20, 10 * 60 * 1000);
  const input = await readBody(request, schema);
  return verifyOtp(input.phone, input.app, input.code);
});
