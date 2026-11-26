import { emailTransportReady, normalizeEmailProvider, resolveEmailConfig } from "./emailTransport";

export { normalizeEmailProvider, resolveEmailConfig, emailTransportReady };

/** True when the active EMAIL_PROVIDER has both key and from configured. */
export function emailProviderReady(env?: {
  EMAIL_PROVIDER?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  BREVO_API_KEY?: string;
  BREVO_FROM_EMAIL?: string;
  BREVO_FROM_NAME?: string;
  /** Legacy single-provider shape used by older call sites / tests. */
  key?: string;
  from?: string;
}) {
  if (env && ("key" in env || "from" in env) && !("EMAIL_PROVIDER" in env) && !("RESEND_API_KEY" in env) && !("BREVO_API_KEY" in env)) {
    return Boolean(env.key?.trim() && env.from?.trim());
  }
  return emailTransportReady(env);
}

export function emailAccepted(status: number) {
  return status >= 200 && status < 300;
}

export function smsProviderReady(env: { provider?: string; key?: string; template?: string; sender?: string }) {
  if (env.provider && env.provider !== "2factor") return "wrong_provider" as const;
  if (!env.key?.trim() || !env.template?.trim() || !env.sender?.trim()) return "missing" as const;
  return "ready" as const;
}

export function smsAccepted(status: number, body: { Status?: string } | null) {
  return status >= 200 && status < 300 && body?.Status === "Success";
}

export function indiaMobile(phone: string) {
  const digits = phone.replace(/\D/g, "").slice(-10);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_RESEND_MS = 30 * 1000;
export const OTP_MAX_TRIES = 5;

export function resendBlocked(sentAt: number, now: number) {
  return now - sentAt < OTP_RESEND_MS;
}

export function otpDecision(box: { exp: number; tries: number } | null, now: number, matches: boolean) {
  if (!box) return "missing" as const;
  if (box.exp < now) return "expired" as const;
  if (!matches) return box.tries + 1 >= OTP_MAX_TRIES ? "lock" as const : "reject" as const;
  return "accept" as const;
}

export function maskedMobile(phone: string) {
  const digits = indiaMobile(phone);
  if (!digits) return null;
  return `91${digits.slice(0, 2)}******${digits.slice(-2)}`;
}

export function classifyProviderResult(input: { configured: boolean; status?: number | "timeout" | "network" | "malformed" | "duplicate" }) {
  if (!input.configured) return { kind: "missing_config" as const, retry: false };
  if (input.status === "duplicate") return { kind: "duplicate" as const, retry: false };
  if (input.status === "timeout") return { kind: "timeout" as const, retry: true };
  if (input.status === "network") return { kind: "network" as const, retry: true };
  if (input.status === "malformed") return { kind: "malformed" as const, retry: false };
  if (input.status === 401 || input.status === 403) return { kind: "unauthorized" as const, retry: false };
  if (input.status === 400) return { kind: "bad_request" as const, retry: false };
  if (input.status === 429) return { kind: "rate_limited" as const, retry: true };
  if (typeof input.status === "number" && input.status >= 500) return { kind: "unavailable" as const, retry: true };
  if (typeof input.status === "number" && input.status >= 200 && input.status < 300) return { kind: "success" as const, retry: false };
  return { kind: "bad_request" as const, retry: false };
}
