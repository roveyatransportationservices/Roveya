import assert from "node:assert/strict";
import { test } from "node:test";
import { validateTopupAmountPaise } from "./walletTopup";

test("validateTopupAmountPaise accepts provisional integer bounds", () => {
  assert.equal(validateTopupAmountPaise(1000), 1000);
  assert.equal(validateTopupAmountPaise(100000), 100000);
});

test("validateTopupAmountPaise rejects fractional and out-of-range amounts", () => {
  assert.throws(() => validateTopupAmountPaise(10.5), /whole-rupee|not allowed/i);
  assert.throws(() => validateTopupAmountPaise(999), /not allowed/i);
  assert.throws(() => validateTopupAmountPaise(100001), /not allowed/i);
});
