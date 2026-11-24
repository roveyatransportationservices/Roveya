import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canTransition } from "./dispatch.ts";
import { bookingKeyReuse, bookingPaymentAllowed, bookingVehicleAllowed, rideStartDecision } from "./rideStartSecurity.ts";
import { rideBill, DEFAULT_RIDE_PLAN, normalizeRidePlan } from "../ridePlan.ts";
import { dayFeeDecision } from "../dayFee.ts";

const base = {
  tripCaptainId: "c1",
  actorCaptainId: "c1",
  status: "arrived",
  tripId: "t1",
  otpTripId: "t1",
  expectedOtp: "4281",
  givenOtp: "4281",
};

test("ride start needs arrival, the assigned captain, and the matching trip OTP", () => {
  assert.deepEqual(rideStartDecision(base), { ok: true });
  assert.equal(rideStartDecision({ ...base, status: "assigned" }).ok, false);
  assert.equal(rideStartDecision({ ...base, status: "searching" }).reason, "not_ready");
  assert.equal(rideStartDecision({ ...base, actorCaptainId: "other" }).reason, "wrong_captain");
  assert.equal(rideStartDecision({ ...base, givenOtp: "0000" }).reason, "bad_otp");
  assert.equal(rideStartDecision({ ...base, otpTripId: "other" }).reason, "wrong_trip");
  assert.deepEqual(rideStartDecision({ ...base, status: "on_trip", givenOtp: "wrong" }), { ok: true, alreadyStarted: true });
});

test("city booking refuses cab and unknown payment, and replays the same booking key", () => {
  assert.equal(bookingVehicleAllowed("bike"), true);
  assert.equal(bookingVehicleAllowed("auto"), true);
  assert.equal(bookingVehicleAllowed("cab"), false);
  assert.equal(bookingPaymentAllowed("cash"), true);
  assert.equal(bookingPaymentAllowed("upi"), true);
  assert.equal(bookingPaymentAllowed("wallet"), false);
  assert.equal(bookingKeyReuse({ priorFingerprint: null, nextFingerprint: "a" }), "new");
  assert.equal(bookingKeyReuse({ priorFingerprint: "a", nextFingerprint: "a" }), "replay");
  assert.equal(bookingKeyReuse({ priorFingerprint: "a", nextFingerprint: "b" }), "conflict");
});

test("subscription mode keeps passenger fee and commission at zero for bike and auto", () => {
  const plan = normalizeRidePlan({ ...DEFAULT_RIDE_PLAN, mode: "subscription", bikePassengerFee: 0, autoPassengerFee: 0 });
  const bike = rideBill("bike", 45, plan);
  const auto = rideBill("auto", 80, plan);
  assert.equal(bike.passengerFee, 0);
  assert.equal(bike.commission, 0);
  assert.equal(auto.passengerFee, 0);
  assert.equal(auto.commission, 0);
  assert.equal(bike.captainReceives, bike.fare);
  assert.equal(dayFeeDecision({ vehicle: "cab", mode: "subscription", bikeDayRupees: 10, autoDayRupees: 12, day: "2026-11-24" }).action, "skip");
  assert.equal(dayFeeDecision({ vehicle: "bike", mode: "subscription", bikeDayRupees: 10, autoDayRupees: 12, day: "2026-11-24" }).action, "charge");
});

test("illegal ride status jumps stay blocked", () => {
  assert.equal(canTransition("searching", "on_trip"), false);
  assert.equal(canTransition("assigned", "completed"), false);
  assert.equal(canTransition("on_trip", "cancelled"), false);
  assert.equal(canTransition("completed", "on_trip"), false);
});

test("cityRides start path still checks trip OTP and ownership", () => {
  const source = readFileSync(new URL("./cityRides.ts", import.meta.url), "utf8");
  const action = source.slice(source.indexOf("export async function captainTripAction"), source.indexOf('action === "complete"'));
  const start = source.slice(source.indexOf('action === "start"'), source.indexOf('action === "complete"'));
  assert.match(action, /eq\("captain_id", captainId\)/);
  assert.match(start, /trip_secrets/);
  assert.match(start, /otp !== body\.otp/);
  assert.match(start, /eq\("status", "arrived"\)/);
  assert.match(source, /vehicle === "cab".*coming soon/s);
  assert.match(source, /request_key/);
});
