import { z } from "zod";
import { handler, limit, readBody } from "@/lib/platform/gateway";
import { sendOtp } from "@/lib/platform/session";

const schema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number."),
  app: z.enum(["rider", "captain"]),
});

export const POST = handler(async (request) => {
  limit(request, "otp-send", 10, 10 * 60 * 1000);
  const input = await readBody(request, schema);
  return sendOtp(input.phone, input.app);
});
