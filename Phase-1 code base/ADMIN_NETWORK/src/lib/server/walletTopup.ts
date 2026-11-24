import { randomUUID } from "node:crypto";
import { ApiError } from "./api";
import { db } from "./db";
import { assertRazorpayCredentialsForRuntime } from "./razorpayEnv";
import { beginGatewayAttempt } from "./razorpay";

function readJson(data: unknown) {
  if (typeof data === "string") {
    try {
      return JSON.parse(data) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

/** Provisional server bounds only. Product presets/min/max remain founder decisions. */
export function validateTopupAmountPaise(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n)) throw new ApiError("Enter a whole-rupee top-up amount.", 400);
  if (n < 1000 || n > 100000) throw new ApiError("That top-up amount is not allowed yet.", 400);
  return n;
}

export async function walletTopupEnabled(): Promise<boolean> {
  const { data } = await db().from("platform_settings").select("value").eq("key", "wallet_topup_enabled").maybeSingle();
  const v = String(data?.value ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === '{"enabled":true}';
}

/**
 * Captain prepaid wallet recharge.
 * Remains fail-closed until:
 * 1) platform_settings.wallet_topup_enabled = true (founder)
 * 2) Razorpay credentials valid for runtime mode
 */
export async function beginCaptainWalletTopup(captainId: string, amountRaw: unknown) {
  if (!(await walletTopupEnabled())) {
    throw new ApiError(
      "Wallet recharge is waiting for founder approval of recharge policy and staging Razorpay test mode.",
      402,
    );
  }
  assertRazorpayCredentialsForRuntime();
  const amountPaise = validateTopupAmountPaise(amountRaw);

  const { data: cap } = await db().from("captains").select("user_id,status").eq("user_id", captainId).maybeSingle();
  if (!cap || String(cap.status) !== "active") throw new ApiError("Captain account is not active.", 403);

  const ref = `wt_${captainId.replace(/-/g, "").slice(0, 12)}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const opened = await beginGatewayAttempt({
    ownerId: captainId,
    purpose: "wallet_topup",
    refId: ref,
    receipt: ref.slice(0, 40),
    amountPaise,
  });
  if (opened.status === "paid") return { status: "paid" as const, intentId: opened.intentId };
  return {
    status: "payment_required" as const,
    intentId: opened.intentId,
    amountPaise: opened.amountPaise,
    checkoutPath: `/pay/${opened.intentId}`,
  };
}

export async function readTopupPolicyNote() {
  const enabled = await walletTopupEnabled();
  return {
    enabled,
    provisionalMinPaise: 1000,
    provisionalMaxPaise: 100000,
    founderDecisionsRequired: [
      "minimum recharge",
      "maximum recharge",
      "recharge presets",
      "wallet expiry",
      "wallet withdrawal",
      "top-up refund eligibility",
      "chargeback recovery",
    ],
  };
}
