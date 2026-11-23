import assert from "node:assert/strict";
import test from "node:test";
import { cancellationSplit, seatSplit } from "./carpoolMoney.ts";

test("a seat of 500 charges the floor, GST in paise, and the full fare to the captain", () => {
  const bill = seatSplit(500);
  assert.equal(bill.captainPaise, 50000);
  assert.equal(bill.feePaise, 7900);
  assert.equal(bill.gstPaise, 1422);
  assert.equal(bill.passengerPaise, 59322);
  assert.equal(bill.rovayaPaise, 7900);
});

test("the fee and GST stay in paise at the floor, the band, and the cap", () => {
  assert.deepEqual([seatSplit(100).feePaise, seatSplit(100).gstPaise, seatSplit(100).passengerPaise], [7900, 1422, 19322]);
  assert.deepEqual([seatSplit(1000).feePaise, seatSplit(1000).gstPaise, seatSplit(1000).passengerPaise], [10000, 1800, 111800]);
  assert.deepEqual([seatSplit(1490).feePaise, seatSplit(1490).gstPaise, seatSplit(1490).passengerPaise], [14900, 2682, 166582]);
  assert.deepEqual([seatSplit(2000).feePaise, seatSplit(2000).gstPaise, seatSplit(2000).captainPaise], [14900, 2682, 200000]);
  assert.deepEqual([seatSplit(5000).feePaise, seatSplit(5000).gstPaise, seatSplit(5000).passengerPaise], [14900, 2682, 517582]);
});

test("the fee stays inside the floor and the cap", () => {
  assert.equal(seatSplit(2000).feePaise, 14900);
  assert.equal(seatSplit(100).feePaise, 7900);
});

test("a partial refund cannot exceed what was captured", () => {
  const split = cancellationSplit(100000, 80000);
  assert.equal(split.refundPaise, 80000);
  assert.equal(split.cancellationPaise, 20000);
  const capped = cancellationSplit(100000, 150000);
  assert.equal(capped.refundPaise, 100000);
  assert.equal(capped.cancellationPaise, 0);
});
