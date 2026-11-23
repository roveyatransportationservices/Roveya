import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_DAY_BOOK, dutyGate, noteCaptainCancel, offersBlocked, passengerCancelFee, payDay, payoutOpen, pickupTooFar, routeProblem, settleDayBook, useDayOnCompletedTrip, waitingCharge } from "./dayPlan.ts";

test("a day fee stays on the day it was charged", () => {
  const paid = payDay(EMPTY_DAY_BOOK, "bike", 10, "2026-11-13");
  const next = settleDayBook(paid, "2026-11-14");
  assert.equal(next.passes[0].day, "2026-11-13");
  assert.match(dutyGate(next, "bike", 10, "2026-11-14").line, /charges ₹10 once/);
  assert.match(dutyGate(paid, "bike", 10, "2026-11-13").line, /already charged/);
});

test("more rides the same day do not change the daily fee", () => {
  const paid = payDay(EMPTY_DAY_BOOK, "bike", 10, "2026-11-13");
  const used = useDayOnCompletedTrip(paid, "bike", "2026-11-13");
  assert.match(dutyGate(used, "bike", 10, "2026-11-13").line, /already charged/);
  assert.equal(dutyGate(used, "bike", 10, "2026-11-13").ok, true);
});

test("a bike fee does not count as the auto fee", () => {
  const paid = payDay(EMPTY_DAY_BOOK, "bike", 10, "2026-11-13");
  assert.match(dutyGate(paid, "auto", 12, "2026-11-13").line, /₹12/);
  assert.doesNotMatch(dutyGate(paid, "auto", 12, "2026-11-13").line, /already charged/);
});

test("three captain cancels stop new requests", () => {
  let book = EMPTY_DAY_BOOK;
  book = noteCaptainCancel(book, "2026-11-13");
  book = noteCaptainCancel(book, "2026-11-13");
  assert.equal(offersBlocked(book), false);
  book = noteCaptainCancel(book, "2026-11-13");
  assert.equal(offersBlocked(book), true);
});

test("the same place and a very long drop are refused", () => {
  assert.match(routeProblem(2, true), /same place/);
  assert.match(routeProblem(320, false), /Carpool/);
  assert.equal(routeProblem(5, false), "");
});

test("a far pickup for a short trip is refused", () => {
  assert.equal(pickupTooFar(4, 1), true);
  assert.equal(pickupTooFar(2, 8), false);
});

test("waiting is free for three minutes, then one rupee a minute up to 15", () => {
  assert.equal(waitingCharge(2.9), 0);
  assert.equal(waitingCharge(8), 5);
  assert.equal(waitingCharge(40), 15);
});

test("bank redeem is only Monday and Thursday in India", () => {
  assert.equal(payoutOpen(new Date("2026-11-16T04:00:00Z")), true);
  assert.equal(payoutOpen(new Date("2026-11-12T04:00:00Z")), true);
  assert.equal(payoutOpen(new Date("2026-11-13T04:00:00Z")), false);
});

test("cancel is free until the captain arrives", () => {
  assert.equal(passengerCancelFee("bike", "assigned"), 0);
  assert.equal(passengerCancelFee("bike", "arrived"), 20);
  assert.equal(passengerCancelFee("auto", "arrived"), 30);
  assert.equal(passengerCancelFee("bike", "onTrip"), null);
});
