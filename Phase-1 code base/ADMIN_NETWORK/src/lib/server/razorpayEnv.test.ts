import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { assertRazorpayCredentialsForRuntime, razorpayKeyMode, razorpayRuntimeMode } from "./razorpayEnv";

const saved = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in saved)) delete process.env[key];
  }
  Object.assign(process.env, saved);
});

test("razorpayKeyMode detects test and live prefixes", () => {
  assert.equal(razorpayKeyMode("rzp_test_abc"), "test");
  assert.equal(razorpayKeyMode("rzp_live_abc"), "live");
  assert.equal(razorpayKeyMode("other"), "unknown");
});

test("staging rejects live Razorpay credentials", () => {
  process.env.ROVEYA_RUNTIME_ENV = "staging";
  process.env.RAZORPAY_KEY_ID = "rzp_live_should_fail";
  process.env.RAZORPAY_KEY_SECRET = "secret";
  assert.throws(() => assertRazorpayCredentialsForRuntime(), /Staging rejects live/);
});

test("production rejects test Razorpay credentials", () => {
  process.env.ROVEYA_RUNTIME_ENV = "production";
  process.env.RAZORPAY_KEY_ID = "rzp_test_should_fail";
  process.env.RAZORPAY_KEY_SECRET = "secret";
  assert.throws(() => assertRazorpayCredentialsForRuntime(), /must not use Razorpay test/);
});

test("missing credentials are unavailable", () => {
  process.env.ROVEYA_RUNTIME_ENV = "staging";
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  assert.throws(() => assertRazorpayCredentialsForRuntime(), /not switched on/);
});

test("runtime mode prefers explicit env", () => {
  process.env.ROVEYA_RUNTIME_ENV = "staging";
  assert.equal(razorpayRuntimeMode(), "staging");
});
