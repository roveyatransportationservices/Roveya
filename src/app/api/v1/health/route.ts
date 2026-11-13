import { isSupabaseConfigured } from "@/lib/supabase/service";

export function GET() {
  return Response.json({
    ok: true,
    service: "roveya-gateway",
    version: "v1",
    database: isSupabaseConfigured(),
    payments: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    otp: (process.env.MOBILE_OTP_MODE || "demo").trim(),
  });
}
