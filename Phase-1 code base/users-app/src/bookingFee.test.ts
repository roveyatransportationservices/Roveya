import assert from "node:assert/strict";
import test from "node:test";
import { bookingFeeForSeat, bookingFeeForSeats, DEFAULT_BOOKING_FEE } from "./bookingFee.ts";

test("a Hyderabad seat of 649 uses the 79 floor", () => {
  const bill = bookingFeeForSeat(649);
  assert.deepEqual(bill, { seatPrice: 649, fee: 79, gst: 14.22, passengerPays: 742.22, driverReceives: 649 });
});

test("10 percent applies once the seat is large enough", () => {
  const bill = bookingFeeForSeat(1200);
  assert.equal(bill.fee, 120);
  assert.equal(bill.gst, 21.6);
  assert.equal(bill.passengerPays, 1341.6);
  assert.equal(bill.driverReceives, 1200);
});

test("the fee stops at 149 on a long route", () => {
  const bill = bookingFeeForSeat(1600);
  assert.equal(bill.fee, 149);
  assert.equal(bill.gst, 26.82);
  assert.equal(bill.passengerPays, 1775.82);
});

test("a short seat still pays the floor", () => {
  assert.equal(bookingFeeForSeat(400).fee, 79);
  assert.equal(bookingFeeForSeat(0).fee, 79);
});

test("two seats are charged one fee each, not 10 percent of the total", () => {
  const bill = bookingFeeForSeats([649, 649]);
  assert.equal(bill.fee, 158);
  assert.equal(bill.gst, 28.44);
  assert.equal(bill.driverReceives, 1298);
  assert.equal(bill.passengerPays, 1484.44);
});

test("admin can raise the floor, the percent, and the cap", () => {
  const raised = { ...DEFAULT_BOOKING_FEE, floor: 99, percent: 12, cap: 199 };
  assert.equal(bookingFeeForSeat(649, raised).fee, 99);
  assert.equal(bookingFeeForSeat(1200, raised).fee, 144);
  assert.equal(bookingFeeForSeat(2000, raised).fee, 199);
});

test("a cap below the floor cannot undercut the minimum", () => {
  assert.equal(bookingFeeForSeat(2000, { ...DEFAULT_BOOKING_FEE, cap: 50 }).fee, 79);
});
