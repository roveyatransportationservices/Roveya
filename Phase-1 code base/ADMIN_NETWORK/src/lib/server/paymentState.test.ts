import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { seatSplit } from "../carpoolMoney.ts";
import { confirmationMessage, confirmationOutcome, orderFailureKind, transportFailure, webhookAdmission, webhookSignatureMatches } from "./paymentState.ts";

test("a paid seat is successful only when the booking is confirmed", () => {
  assert.equal(confirmationOutcome({ purpose: "seat_booking", intentStatus: "paid", bookingStatus: "confirmed" }).booked, true);
  assert.equal(confirmationOutcome({ purpose: "seat_booking", intentStatus: "paid", bookingStatus: "pending" }).status, "reconcile");
  assert.equal(confirmationOutcome({ purpose: "seat_booking", intentStatus: "paid", bookingStatus: "pending" }).http, 409);
  assert.equal(confirmationOutcome({ purpose: "seat_booking", intentStatus: "reconcile", bookingStatus: "pending" }).booked, false);
  assert.equal(confirmationOutcome({ purpose: "seat_booking", intentStatus: "refund_pending" }).booked, false);
  assert.equal(confirmationOutcome({ purpose: "seat_booking", intentStatus: "refunded" }).booked, false);
  assert.match(confirmationMessage("reconcile"), /not confirmed/);
});

test("a lost response is unknown, and a gateway timeout is not a rejection", () => {
  assert.equal(transportFailure().status, "unknown");
  assert.equal(transportFailure().http, 503);
  assert.equal(orderFailureKind("network"), "uncertain");
  assert.equal(orderFailureKind(503), "uncertain");
  assert.equal(orderFailureKind(400), "rejected");
});

test("another customer's payment is not found, and a bad signature is refused", () => {
  assert.equal(confirmationOutcome({ purpose: "seat_booking", intentStatus: "not_owner" }).http, 404);
  const secret = "webhook-test-secret";
  const raw = JSON.stringify({ id: "evt_1", event: "payment.captured" });
  const signature = createHmac("sha256", secret).update(raw).digest("hex");
  assert.equal(webhookSignatureMatches(raw, signature, secret), true);
  assert.equal(webhookSignatureMatches(raw, "deadbeef", secret), false);
  assert.equal(webhookAdmission({ secret: "", raw, signature, eventId: "evt_1" }).http, 503);
  assert.equal(webhookAdmission({ secret, raw, signature: "nope", eventId: "evt_1" }).http, 400);
  assert.equal(webhookAdmission({ secret, raw, signature, eventId: "" }).http, 400);
  assert.equal(webhookAdmission({ secret, raw, signature, eventId: "evt_1" }).http, 200);
});

test("ordinary ride success does not require a seat booking, and the seat fee table is unchanged", () => {
  assert.equal(confirmationOutcome({ purpose: "ride_fare", intentStatus: "paid" }).booked, true);
  assert.deepEqual(
    [seatSplit(500).feePaise, seatSplit(500).gstPaise, seatSplit(500).passengerPaise, seatSplit(500).captainPaise],
    [7900, 1422, 59322, 50000],
  );
  assert.deepEqual([seatSplit(1000).feePaise, seatSplit(1000).gstPaise, seatSplit(1000).passengerPaise], [10000, 1800, 111800]);
  assert.deepEqual([seatSplit(2000).feePaise, seatSplit(2000).gstPaise, seatSplit(2000).passengerPaise], [14900, 2682, 217582]);
});
