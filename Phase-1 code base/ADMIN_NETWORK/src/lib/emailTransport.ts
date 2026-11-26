/**
 * Staging/production email transport selector.
 * EMAIL_PROVIDER=brevo|resend (default resend for backward compatibility).
 * OTP hashing, expiry, and verification stay in otpDelivery — this module only sends mail.
 */

export type EmailProviderName = "resend" | "brevo";

export type EmailSendInput = {
  to: string;
  subject: string;
  html: string;
  fetchImpl?: typeof fetch;
};

export type ResolvedEmailConfig =
  | { provider: "resend"; key: string; from: string; endpoint: string }
  | { provider: "brevo"; key: string; fromEmail: string; fromName: string; endpoint: string }
  | { provider: null; reason: "missing_config" };

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export function normalizeEmailProvider(raw?: string | null): EmailProviderName {
  const value = String(raw ?? "resend").trim().toLowerCase();
  return value === "brevo" ? "brevo" : "resend";
}

function parseFrom(from: string): { email: string; name: string } {
  const trimmed = from.trim();
  const match = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) return { name: match[1].trim().replace(/^["']|["']$/g, "") || "ROVEYA", email: match[2].trim() };
  return { name: "ROVEYA", email: trimmed };
}

export type EmailEnv = {
  EMAIL_PROVIDER?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  BREVO_API_KEY?: string;
  BREVO_FROM_EMAIL?: string;
  BREVO_FROM_NAME?: string;
};

function envBag(env?: EmailEnv): EmailEnv {
  return {
    EMAIL_PROVIDER: env?.EMAIL_PROVIDER ?? process.env.EMAIL_PROVIDER,
    RESEND_API_KEY: env?.RESEND_API_KEY ?? process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: env?.RESEND_FROM_EMAIL ?? process.env.RESEND_FROM_EMAIL,
    BREVO_API_KEY: env?.BREVO_API_KEY ?? process.env.BREVO_API_KEY,
    BREVO_FROM_EMAIL: env?.BREVO_FROM_EMAIL ?? process.env.BREVO_FROM_EMAIL,
    BREVO_FROM_NAME: env?.BREVO_FROM_NAME ?? process.env.BREVO_FROM_NAME,
  };
}

export function resolveEmailConfig(env?: EmailEnv): ResolvedEmailConfig {
  const source = envBag(env);
  const provider = normalizeEmailProvider(source.EMAIL_PROVIDER);
  if (provider === "brevo") {
    const key = source.BREVO_API_KEY?.trim() ?? "";
    const fromEmail = source.BREVO_FROM_EMAIL?.trim() ?? "";
    const fromName = (source.BREVO_FROM_NAME?.trim() || "ROVEYA").trim();
    if (!key || !fromEmail) return { provider: null, reason: "missing_config" };
    return { provider: "brevo", key, fromEmail, fromName, endpoint: BREVO_ENDPOINT };
  }
  const key = source.RESEND_API_KEY?.trim() ?? "";
  const from = source.RESEND_FROM_EMAIL?.trim() ?? "";
  if (!key || !from) return { provider: null, reason: "missing_config" };
  return { provider: "resend", key, from, endpoint: RESEND_ENDPOINT };
}

export function emailTransportReady(env?: EmailEnv) {
  return resolveEmailConfig(env).provider != null;
}

export function emailTransportEndpoint(env?: EmailEnv) {
  const resolved = resolveEmailConfig(env);
  return resolved.provider ? resolved.endpoint : RESEND_ENDPOINT;
}

export async function sendTransactionalEmail(input: EmailSendInput, env?: EmailEnv) {
  const resolved = resolveEmailConfig(env);
  if (!resolved.provider) return { ok: false as const, status: 0, reason: "missing_config" as const };

  const fetchImpl = input.fetchImpl ?? fetch;
  if (resolved.provider === "resend") {
    const response = await fetchImpl(resolved.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${resolved.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: resolved.from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
      }),
      signal: AbortSignal.timeout(12_000),
    }).catch(() => null);
    const status = response?.status ?? 0;
    return { ok: Boolean(response && status >= 200 && status < 300), status, reason: "provider" as const, provider: "resend" as const };
  }

  const response = await fetchImpl(resolved.endpoint, {
    method: "POST",
    headers: { "api-key": resolved.key, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      sender: { name: resolved.fromName, email: resolved.fromEmail },
      to: [{ email: input.to }],
      subject: input.subject,
      htmlContent: input.html,
    }),
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null);
  const status = response?.status ?? 0;
  return { ok: Boolean(response && status >= 200 && status < 300), status, reason: "provider" as const, provider: "brevo" as const };
}

export function parseSenderForTests(from: string) {
  return parseFrom(from);
}
