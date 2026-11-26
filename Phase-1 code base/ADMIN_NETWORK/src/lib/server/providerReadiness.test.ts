import assert from "node:assert/strict";
import test from "node:test";
import { classifyProviderResult, emailAccepted, emailProviderReady, indiaMobile, maskedMobile, otpDecision, OTP_MAX_TRIES, OTP_TTL_MS, resendBlocked, smsAccepted, smsProviderReady } from "../providerPlan";

test("email OTP stays off until both Resend values exist", () => {
  assert.equal(emailProviderReady({}), false);
  assert.equal(emailProviderReady({ key: "test-key", from: "" }), false);
  assert.equal(emailProviderReady({ key: "test-key", from: "ROVEYA <codes@example.com>" }), true);
});

test("email OTP with EMAIL_PROVIDER=brevo needs Brevo key and from", () => {
  assert.equal(emailProviderReady({ EMAIL_PROVIDER: "brevo", BREVO_API_KEY: "k", BREVO_FROM_EMAIL: "a@b.com" }), true);
  assert.equal(emailProviderReady({ EMAIL_PROVIDER: "brevo", RESEND_API_KEY: "re", RESEND_FROM_EMAIL: "a@b.com" }), false);
});

test("a mocked provider status is accepted only on success", () => {
  assert.equal(emailAccepted(200), true);
  assert.equal(emailAccepted(403), false);
  assert.equal(emailAccepted(500), false);
});

test("SMS OTP requires 2Factor, a 10-digit Indian mobile, and a success status", () => {
  assert.equal(smsProviderReady({ provider: "other", key: "k", template: "t", sender: "s" }), "wrong_provider");
  assert.equal(smsProviderReady({ provider: "2factor", key: "k", template: "", sender: "s" }), "missing");
  assert.equal(smsProviderReady({ provider: "2factor", key: "k", template: "t", sender: "s" }), "ready");
  assert.equal(indiaMobile("9876543210"), "9876543210");
  assert.equal(indiaMobile("+91 98765 43210"), "9876543210");
  assert.equal(indiaMobile("12345"), null);
  assert.equal(smsAccepted(200, { Status: "Success" }), true);
  assert.equal(smsAccepted(200, { Status: "Error" }), false);
  assert.equal(smsAccepted(500, { Status: "Success" }), false);
  assert.equal(smsAccepted(200, null), false);
});

test("otp rules expire, lock, and resend without a live provider", () => {
  const now = 1_700_000_000_000;
  const box = { exp: now + OTP_TTL_MS, tries: 0 };
  assert.equal(otpDecision(box, now, true), "accept");
  assert.equal(otpDecision(box, now, false), "reject");
  assert.equal(otpDecision({ ...box, tries: OTP_MAX_TRIES - 1 }, now, false), "lock");
  assert.equal(otpDecision(box, box.exp + 1, true), "expired");
  assert.equal(otpDecision(null, now, true), "missing");
  assert.equal(resendBlocked(now, now + 29_000), true);
  assert.equal(resendBlocked(now, now + 30_000), false);
  assert.equal(maskedMobile("9876543210"), "9198******10");
  assert.equal(maskedMobile("9876543210")?.includes("9876543210"), false);
});

test("provider failures retry only when another attempt can succeed", () => {
  assert.equal(classifyProviderResult({ configured: false }).retry, false);
  assert.equal(classifyProviderResult({ configured: true, status: 200 }).kind, "success");
  assert.equal(classifyProviderResult({ configured: true, status: 400 }).retry, false);
  assert.equal(classifyProviderResult({ configured: true, status: 401 }).retry, false);
  assert.equal(classifyProviderResult({ configured: true, status: 429 }).retry, true);
  assert.equal(classifyProviderResult({ configured: true, status: 500 }).retry, true);
  assert.equal(classifyProviderResult({ configured: true, status: "timeout" }).retry, true);
  assert.equal(classifyProviderResult({ configured: true, status: "network" }).retry, true);
  assert.equal(classifyProviderResult({ configured: true, status: "malformed" }).retry, false);
  assert.equal(classifyProviderResult({ configured: true, status: "duplicate" }).retry, false);
});
