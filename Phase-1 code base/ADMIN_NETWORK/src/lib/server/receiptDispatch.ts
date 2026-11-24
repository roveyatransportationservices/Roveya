import { deliverReceiptEmail, type ServiceReceipt } from "../receipt";
import { emailProviderReady } from "../providerPlan";
import { db } from "./db";
import { observe } from "./observe";

async function receiptEmailApproved() {
  const { data } = await db().from("platform_settings").select("value").eq("key", "receipt_email_approved").maybeSingle();
  const value = String(data?.value ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

async function markReceiptEmail(refId: string, status: "held" | "accepted" | "failed" | "not_sent") {
  const { error } = await db().from("service_receipts").update({ email_status: status }).eq("source", "city").eq("ref_id", refId);
  if (error && !/relation|schema cache|42P01/i.test(error.message)) observe("receipt_email_status_failed", { category: "store_failed" });
}

/**
 * Stores already happened in rememberReceipt (email_status starts as not_sent).
 * This path attempts Resend only when configured and founder-approved.
 * Failure never throws into the ride completion path.
 */
export async function dispatchCityReceiptEmail(input: {
  riderId: string;
  receipt: ServiceReceipt;
  fetchImpl?: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean }>;
}) {
  try {
    const [{ data: rider }, { data: existing }, approved] = await Promise.all([
      db().from("riders").select("email").eq("user_id", input.riderId).maybeSingle(),
      db().from("service_receipts").select("email_status").eq("source", "city").eq("ref_id", input.receipt.refId).maybeSingle(),
      receiptEmailApproved(),
    ]);
    const alreadySent = existing?.email_status === "accepted";
    const to = String(rider?.email ?? "").trim();
    const key = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    const configured = emailProviderReady({ key, from });
    if (!to) {
      await markReceiptEmail(input.receipt.refId, "held");
      return { status: "hold" as const, sent: false as const, reason: "no_email" as const };
    }
    const result = await deliverReceiptEmail({
      to,
      receipt: input.receipt,
      configured,
      approved,
      alreadySent,
      apiKey: key,
      from,
      fetchImpl:
        input.fetchImpl ??
        (async (url, init) => {
          const response = await fetch(url, { ...init, signal: AbortSignal.timeout(12_000) }).catch(() => null);
          return { ok: Boolean(response && response.ok) };
        }),
    });
    const status = result.status === "skip" ? "accepted" : result.status === "hold" ? "held" : result.status === "accepted" ? "accepted" : "failed";
    await markReceiptEmail(input.receipt.refId, status === "accepted" ? "accepted" : status === "held" ? "held" : "failed");
    return { ...result, reason: result.status === "hold" ? ("held" as const) : undefined };
  } catch {
    observe("receipt_email_dispatch_failed", { category: "send_failed" });
    await markReceiptEmail(input.receipt.refId, "failed").catch(() => undefined);
    return { status: "failed" as const, sent: false as const };
  }
}
