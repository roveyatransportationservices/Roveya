import { issuePhoneOtp } from "@/lib/phone-otp";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { sendDriverSms } from "@/lib/sms";

export async function POST(request: Request) {
  const limited = rateLimit(clientKey(request, "phone-otp"), 5, 10 * 60 * 1000);
  if (!limited.ok) return Response.json({ error: "Too many codes requested. Try again shortly." }, { status: 429 });
  const body = await request.json().catch(() => null);
  const digits = String(body?.phone ?? "").replace(/\D/g, "").slice(-10);
  if (!/^[6-9]\d{9}$/.test(digits)) {
    return Response.json({ error: "Enter a valid 10-digit mobile number." }, { status: 400 });
  }
  const code = issuePhoneOtp(digits);
  const sent = await sendDriverSms(digits, `Your ROVEYA sign-in code is ${code}. It expires in 5 minutes.`);
  if (!sent) return Response.json({ error: "Sign-in by SMS is not available right now." }, { status: 503 });
  return Response.json({ ok: true, phone: digits });
}
