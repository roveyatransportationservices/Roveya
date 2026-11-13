import { createHmac, timingSafeEqual } from "crypto";

function encode(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function mac(secret: string, body: string) {
  return createHmac("sha256", secret).update(body).digest();
}

export function signToken(payload: Record<string, unknown>, secret: string) {
  const body = encode(JSON.stringify(payload));
  return `${body}.${encode(mac(secret, body))}`;
}

export function verifyToken<T extends { exp: number }>(token: string, secret: string, now = Date.now()): T | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = mac(secret, body);
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
    if (typeof payload.exp !== "number" || payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

export function hashOtp(secret: string, app: string, phone: string, code: string) {
  return createHmac("sha256", secret).update(`${app}:${phone}:${code}`).digest("hex");
}

export function sameHash(left: string, right: string) {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function deriveSecret(base: string, label: string) {
  return createHmac("sha256", base).update(`roveya:${label}`).digest("hex");
}
