import assert from "node:assert/strict";
import test from "node:test";
import { otpDestination } from "./otpDestination.ts";

test("email OTP shows the normalized address, not a blank mobile number", () => {
  assert.equal(otpDestination("", " Founder@Mail.com "), "founder@mail.com");
  assert.equal(otpDestination("9876543210", "founder@mail.com"), "founder@mail.com");
});

test("phone OTP keeps the grouped Indian number", () => {
  assert.equal(otpDestination("9876543210"), "+91 98765 43210");
  assert.equal(otpDestination("+91 98765 43210"), "+91 98765 43210");
  assert.equal(otpDestination(""), "");
});
