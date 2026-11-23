import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_RIDE_PLAN, captainAccess, normalizeRidePlan, rideBill } from "./ridePlan.ts";

test("a bike passenger pays the fare and the captain keeps it", () => {
  const bill = rideBill("bike", 49, DEFAULT_RIDE_PLAN);
  assert.deepEqual(bill, { fare: 49, passengerFee: 0, passengerPays: 49, commission: 0, captainReceives: 49 });
  assert.deepEqual(captainAccess("bike", DEFAULT_RIDE_PLAN), { mode: "subscription", day: 10, month: 270, commissionPct: 0 });
});

test("an auto passenger pays the fare and the captain keeps it", () => {
  const bill = rideBill("auto", 89, DEFAULT_RIDE_PLAN);
  assert.deepEqual(bill, { fare: 89, passengerFee: 0, passengerPays: 89, commission: 0, captainReceives: 89 });
  assert.deepEqual(captainAccess("auto", DEFAULT_RIDE_PLAN), { mode: "subscription", day: 12, month: 280, commissionPct: 0 });
});

test("admin can add a passenger fee later without taking it from the captain", () => {
  const plan = { ...DEFAULT_RIDE_PLAN, bikePassengerFee: 2, autoPassengerFee: 3 };
  assert.equal(rideBill("bike", 49, plan).passengerPays, 51);
  assert.equal(rideBill("bike", 49, plan).captainReceives, 49);
  assert.equal(rideBill("auto", 89, plan).passengerPays, 92);
  assert.equal(rideBill("auto", 89, plan).captainReceives, 89);
});

test("admin can switch the model to a percent taken from the captain", () => {
  const plan = { ...DEFAULT_RIDE_PLAN, mode: "commission" as const, commissionPct: 10 };
  const bill = rideBill("bike", 49, plan);
  assert.equal(bill.passengerPays, 49);
  assert.equal(bill.commission, 5);
  assert.equal(bill.captainReceives, 44);
  assert.equal(captainAccess("auto", plan).day, 0);
  assert.equal(captainAccess("auto", plan).commissionPct, 10);
});

test("a saved plan falls back to the standard prices when a value is missing", () => {
  const plan = normalizeRidePlan({ mode: "nope" as "subscription", bikeDay: 15 });
  assert.equal(plan.mode, "subscription");
  assert.equal(plan.bikeDay, 15);
  assert.equal(plan.bikeMonth, 270);
  assert.equal(plan.autoDay, 12);
  assert.equal(plan.bikePassengerFee, 0);
});
