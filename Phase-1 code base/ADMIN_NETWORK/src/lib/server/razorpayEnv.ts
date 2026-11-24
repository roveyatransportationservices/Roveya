import { ApiError } from "./api";

export type RazorpayRuntimeMode = "local" | "staging" | "production" | "unknown";

export function razorpayRuntimeMode(): RazorpayRuntimeMode {
  const explicit = (process.env.ROVEYA_RUNTIME_ENV || process.env.ROVEYA_ENV || "").trim().toLowerCase();
  if (explicit === "local" || explicit === "development" || explicit === "dev") return "local";
  if (explicit === "staging" || explicit === "stage") return "staging";
  if (explicit === "production" || explicit === "prod") return "production";
  const render = (process.env.RENDER_SERVICE_NAME || "").toLowerCase();
  if (render.includes("staging")) return "staging";
  if (render.includes("prod") || render.includes("production")) return "production";
  if (process.env.NODE_ENV === "production") return "unknown";
  return "local";
}

export function razorpayKeyMode(keyId: string): "test" | "live" | "unknown" {
  const id = keyId.trim();
  if (id.startsWith("rzp_test_")) return "test";
  if (id.startsWith("rzp_live_")) return "live";
  return "unknown";
}

/** Fail closed: staging rejects live keys; production rejects test keys; missing config unavailable. */
export function assertRazorpayCredentialsForRuntime() {
  const id = process.env.RAZORPAY_KEY_ID?.trim() || "";
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim() || "";
  if (!id || !secret) throw new ApiError("Online payment is not switched on yet.", 503);

  const runtime = razorpayRuntimeMode();
  const keyMode = razorpayKeyMode(id);

  if (runtime === "staging" && keyMode === "live") {
    throw new ApiError("Staging rejects live Razorpay credentials.", 503);
  }
  if (runtime === "production" && keyMode === "test") {
    throw new ApiError("Production must not use Razorpay test credentials.", 503);
  }
  if (keyMode === "unknown") {
    throw new ApiError("Online payment is not switched on yet.", 503);
  }
  return { id, secret, runtime, keyMode };
}

export function assertWebhookSecretPresent() {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || "";
  if (!secret) throw new ApiError("Webhook secret is not set.", 503);
  return secret;
}
