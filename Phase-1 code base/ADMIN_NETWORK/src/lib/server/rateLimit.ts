import { createHash } from "node:crypto";
import { ApiError } from "./errors";
import { db } from "./db";
import { observe } from "./observe";

type SlotResult = { error: { message: string } | null; data: boolean | null };

const octet = (part: string) => /^\d{1,3}$/.test(part) && Number(part) <= 255;

function ipAddress(value: string) {
  const text = value.trim();
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(text) && text.split(".").every(octet)) return text;
  if (text.includes(":") && /^[0-9a-fA-F:]+$/.test(text) && text.length >= 2 && text.length <= 45) return text.toLowerCase();
  return "";
}

// Render must set ROVEYA_TRUSTED_PROXY_HOPS=1. The trusted hop is counted from the right,
// so a caller cannot put their own address in front of the address the proxy appended.
// This has not been observed on a live Render request.
export function clientAddress(req: Request) {
  const trusted = Number(process.env.ROVEYA_TRUSTED_PROXY_HOPS ?? "0");
  const hops = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map(ipAddress)
    .filter(Boolean);
  if (Number.isInteger(trusted) && trusted > 0) {
    const chosen = hops[hops.length - trusted];
    if (!chosen) throw new ApiError("We could not confirm this connection. Try again in a moment.", 503);
    return chosen;
  }
  return "direct";
}

async function takeSlot(bucket: string, limit: number, windowSeconds: number): Promise<SlotResult> {
  const result = await db().rpc("take_api_slot", { p_bucket: bucket, p_limit: limit, p_window_seconds: windowSeconds });
  return {
    error: result.error ? { message: result.error.message } : null,
    data: result.data === true ? true : result.data === false ? false : null,
  };
}

let slotCheck = takeSlot;

// Tests replace the database call. Production uses take_api_slot.
export function setSlotCheckForTests(check: typeof takeSlot | null) {
  slotCheck = check ?? takeSlot;
}

// One atomic counter in PostgreSQL, shared by every API process. The stored bucket is a hash.
export async function allow(scope: string, subject: string, limit: number, windowSeconds: number, message: string) {
  const bucket = createHash("sha256").update(`${scope}\n${subject}`).digest("hex").slice(0, 40);
  const result = await slotCheck(bucket, limit, windowSeconds);
  if (result.error || result.data === null) {
    observe("rate_limit_error", { scope });
    throw new ApiError("The service is busy. Try again in a moment.", 503);
  }
  if (result.data !== true) {
    observe("rate_limited", { scope });
    throw new ApiError(message, 429, windowSeconds);
  }
}

// A repeat of a booking that is already stored is not a new attempt.
export async function limitUnlessReplay(scope: string, subject: string, limit: number, windowSeconds: number, message: string, replay: boolean) {
  if (replay) return;
  await allow(scope, subject, limit, windowSeconds, message);
}
