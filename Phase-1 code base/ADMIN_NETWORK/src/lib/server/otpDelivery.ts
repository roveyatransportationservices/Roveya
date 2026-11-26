import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { emailTransportEndpoint, sendTransactionalEmail } from "../emailTransport";
import { loadtestBlocks } from "../loadtestGuard";
import { emailAccepted, emailProviderReady, indiaMobile, otpDecision, OTP_MAX_TRIES, OTP_TTL_MS, resendBlocked, smsAccepted, smsProviderReady } from "../providerPlan";
import { ApiError } from "./api";
import { db } from "./db";

export { emailAccepted, emailProviderReady, indiaMobile, smsAccepted, smsProviderReady };

type Box = { hash: string; exp: number; tries: number; sentAt: number };

function secret() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new ApiError("Sign-in is not configured.", 503);
  return key;
}

function boxKey(target: string) {
  return `otpbox_${createHmac("sha256", secret()).update(target).digest("hex").slice(0, 32)}`;
}

function hashCode(target: string, code: string) {
  return createHmac("sha256", secret()).update(`code.${target}.${code}`).digest("hex");
}

async function readBox(target: string): Promise<Box | null> {
  const { data } = await db().from("platform_settings").select("value").eq("key", boxKey(target)).maybeSingle();
  if (!data?.value) return null;
  try {
    const saved = JSON.parse(String(data.value)) as Box;
    if (!saved.hash || !saved.exp) return null;
    return saved;
  } catch {
    return null;
  }
}

async function writeBox(target: string, box: Box | null) {
  const key = boxKey(target);
  if (!box) {
    await db().from("platform_settings").delete().eq("key", key);
    return;
  }
  await db().from("platform_settings").upsert({ key, value: JSON.stringify(box), updated_at: new Date().toISOString() });
}

function emailHtml(code: string) {
  const digits = code.split("").map((digit) => `<td style="width:44px;height:52px;border:1px solid #d6a000;border-radius:12px;text-align:center;font-size:24px;font-weight:700;color:#f6f1dc;">${digit}</td>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#12060d;font-family:Georgia,serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#12060d;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:480px;background:#1c0c12;border:1px solid rgba(214,160,0,0.35);border-radius:24px;padding:32px 24px;">
        <tr><td style="color:#d6a000;letter-spacing:0.28em;font-size:12px;font-family:Arial,sans-serif;">ROVEYA</td></tr>
        <tr><td style="color:#f6f1dc;font-size:28px;padding-top:12px;">Your sign-in code</td></tr>
        <tr><td style="color:rgba(246,241,220,0.72);font-size:15px;line-height:1.5;padding-top:8px;font-family:Arial,sans-serif;">Enter this code in the ROVEYA app. It expires in 5 minutes. ROVEYA will never ask for it on a call.</td></tr>
        <tr><td style="padding-top:24px;"><table role="presentation" cellpadding="0" cellspacing="8"><tr>${digits}</tr></table></td></tr>
        <tr><td style="color:rgba(246,241,220,0.45);font-size:12px;padding-top:24px;font-family:Arial,sans-serif;">If you did not ask for this code, ignore this email.</td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

async function sendEmail(to: string, code: string) {
  if (!emailProviderReady()) throw new ApiError("Email sign-in is not switched on yet.", 503);
  const endpoint = emailTransportEndpoint();
  if (loadtestBlocks(endpoint)) throw new ApiError("Email sign-in is not switched on yet.", 503);
  const result = await sendTransactionalEmail({
    to,
    subject: "Your ROVEYA sign-in code",
    html: emailHtml(code),
  });
  if (!result.ok || !emailAccepted(result.status)) throw new ApiError("The email could not be sent. Try again in a moment.", 503);
}

// 2Factor OTP route. The template name and sender ID must already be approved on a DLT portal.
async function sendSms(phone: string, code: string) {
  const key = process.env.SMS_API_KEY;
  const template = process.env.SMS_TEMPLATE_ID;
  const sender = process.env.SMS_SENDER_ID;
  const ready = smsProviderReady({ provider: process.env.SMS_PROVIDER, key, template, sender });
  if (ready !== "ready" || !indiaMobile(phone)) throw new ApiError("Text message sign-in is not switched on yet.", 503);
  if (loadtestBlocks("https://2factor.in/API/V1/send")) throw new ApiError("Text message sign-in is not switched on yet.", 503);
  const url = `https://2factor.in/API/V1/${encodeURIComponent(key!)}/SMS/91${phone}/${code}/${encodeURIComponent(template!)}`;
  const response = await fetch(url, { method: "POST", signal: AbortSignal.timeout(12_000) }).catch(() => null);
  const body = (await response?.json().catch(() => null)) as { Status?: string } | null;
  if (!response || !smsAccepted(response.status, body)) throw new ApiError("The text could not be sent. Try again in a moment.", 503);
}

export async function deliverCode(input: { key: string; to: string; channel: "phone" | "email" }) {
  const current = await readBox(input.key);
  const now = Date.now();
  if (current && resendBlocked(current.sentAt, now)) throw new ApiError("Wait 30 seconds before asking for another code.", 429);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  if (input.channel === "email") await sendEmail(input.to, code);
  else await sendSms(input.to, code);
  await writeBox(input.key, { hash: hashCode(input.key, code), exp: now + OTP_TTL_MS, tries: 0, sentAt: now });
}

export async function acceptCode(target: string, code: string) {
  const clean = code.replace(/\D/g, "");
  const box = await readBox(target);
  const given = Buffer.from(hashCode(target, clean));
  const saved = Buffer.from(box?.hash ?? "");
  const matches = box != null && given.length === saved.length && timingSafeEqual(given, saved);
  const decision = otpDecision(box, Date.now(), matches);
  if (decision === "expired" || decision === "missing") {
    if (box) await writeBox(target, null);
    throw new ApiError("That code has expired. Ask for a new one.", 401);
  }
  if (decision === "lock" || decision === "reject") {
    const tries = box!.tries + 1;
    if (decision === "lock" || tries >= OTP_MAX_TRIES) await writeBox(target, null);
    else await writeBox(target, { ...box!, tries });
    throw new ApiError(decision === "lock" ? "That code has expired. Ask for a new one." : "That code does not match. Try again.", 401);
  }
  await writeBox(target, null);
}
