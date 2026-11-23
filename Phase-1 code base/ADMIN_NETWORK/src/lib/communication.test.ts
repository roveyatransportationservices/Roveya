import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { seatSplit } from "./carpoolMoney";
import { noticeCopy, publicEvent, pushAttempt } from "./delivery";
import { carpoolReceipt, cityReceipt, deliverReceiptEmail, receiptEmailDecision, receiptNo, refundNotice } from "./receipt";

test("a ₹560 seat uses the stored fee rules, not 5 percent of the fare", () => {
  const split = seatSplit(560);
  assert.equal(split.seatPaise, 56000);
  assert.equal(split.feePaise, 7900);
  assert.equal(split.gstPaise, 1422);
  assert.equal(split.passengerPaise, 65322);
  assert.equal(`₹${(14.22).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "₹14.22");
  assert.equal(`₹${(653.22).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "₹653.22");
  const page = fs.readFileSync(new URL("../../../RoveyaOfficialWebsite/src/components/Booker.tsx", import.meta.url), "utf8");
  assert.equal(page.includes("0.05"), false);
  assert.equal(page.includes("GST (5%)"), false);
  assert.equal(page.includes("This page does not estimate the tax."), true);
  assert.equal(page.includes("inrExact(quote.gst)"), true);
  assert.equal(page.includes("quote.fee"), true);
});

test("city and carpool receipts use stored amounts and stay non-tax drafts", () => {
  const city = cityReceipt({ tripId: "trip-1", code: "RV100", farePaise: 2500, payment: "cash", paymentStatus: "due", completedAt: "2026-11-21T12:00:00.000Z", pickup: "A", drop: "B" });
  assert.equal(city.document, "non_tax_receipt_draft");
  assert.equal(city.lines.some((line) => /gst|fee|commission/i.test(line.label)), false);
  assert.equal(receiptNo("city", "RV100"), city.receiptNo);
  assert.equal(cityReceipt({ tripId: "trip-1", code: "RV100", farePaise: 2500, completedAt: "2026-11-21T12:00:00.000Z" }).receiptNo, city.receiptNo);

  const seat = carpoolReceipt({
    bookingId: "book-1",
    pnr: "PNR1",
    farePaise: 56000,
    feePaise: 7900,
    gstPaise: 1422,
    paidWith: "upi",
    status: "confirmed",
    completedAt: "2026-11-21T12:00:00.000Z",
    passenger: "Asha",
  });
  assert.equal(seat.lines.find((line) => line.label === "GST on the booking fee")?.paise, 1422);
  assert.equal(seat.lines.find((line) => line.label === "Booking fee")?.paise, 7900);
  const withoutTax = carpoolReceipt({ bookingId: "book-2", pnr: "PNR2", farePaise: 56000, feePaise: 7900, completedAt: "2026-11-21T12:00:00.000Z" });
  assert.equal(withoutTax.lines.some((line) => line.label.startsWith("GST")), false);
});

test("receipt email stays held until sending is approved", async () => {
  assert.equal(receiptEmailDecision({ configured: true, approved: false, alreadySent: false }), "hold");
  assert.equal(receiptEmailDecision({ configured: true, approved: true, alreadySent: true }), "skip");
  let called = 0;
  const held = await deliverReceiptEmail({
    to: "rider@example.com",
    receipt: cityReceipt({ tripId: "trip-1", code: "RV100", farePaise: 2500, completedAt: "2026-11-21T12:00:00.000Z" }),
    configured: false,
    approved: false,
    alreadySent: false,
    fetchImpl: async () => {
      called += 1;
      return { ok: true };
    },
  });
  assert.equal(held.sent, false);
  assert.equal(called, 0);
  const sent = await deliverReceiptEmail({
    to: "rider@example.com",
    receipt: cityReceipt({ tripId: "trip-1", code: "RV100", farePaise: 2500, completedAt: "2026-11-21T12:00:00.000Z" }),
    configured: true,
    approved: true,
    alreadySent: false,
    apiKey: "test-key",
    from: "receipts@example.com",
    fetchImpl: async () => {
      called += 1;
      return { ok: true };
    },
  });
  assert.equal(sent.status, "accepted");
  assert.equal(called, 1);
});

test("a timed-out push is unknown and is not retried", () => {
  assert.deepEqual(pushAttempt("timeout", 1), { status: "unknown", retry: false });
  assert.deepEqual(pushAttempt("error", 1), { status: "failed", retry: false });
  assert.deepEqual(pushAttempt("ok", 0), { status: "skipped", retry: false });
  assert.deepEqual(pushAttempt("ok", 2), { status: "accepted", retry: false });
  assert.equal(noticeCopy("refund_completed", "PNR1").title, "Refund completed");
});

test("refund copy waits for a confirmed refund", () => {
  assert.equal(refundNotice("pending", 65322, 65322)?.kind, "refund_initiated");
  assert.equal(refundNotice("processing", 65322, 65322)?.kind, "refund_initiated");
  assert.equal(refundNotice("failed", 65322, 65322), null);
  assert.equal(refundNotice("processed", 65322, 65322)?.kind, "refund_completed");
  assert.equal(refundNotice("none", 65322, 0)?.kind, "refund_completed");
  assert.equal(refundNotice("none", 0, 0), null);
});

test("delivery rows shown to admins drop secret fields", () => {
  const shown = publicEvent({ event_key: "city:1:arrived", kind: "captain_arrived", token: "secret-token", otp: "1234", status: "unknown" });
  assert.equal(shown.event_key, "city:1:arrived");
  assert.equal("token" in shown, false);
  assert.equal("otp" in shown, false);
});

test("communication migration is additive and stays unapplied in this phase", () => {
  const sql = fs.readFileSync(new URL("../../../../supabase/migrations/20261121220000_communication_events.sql", import.meta.url), "utf8");
  assert.match(sql, /communication_events/);
  assert.match(sql, /service_receipts/);
  assert.match(sql, /grant select, insert, update on table public.communication_events to service_role/);
  assert.doesNotMatch(sql, /grant [\s\S]* to anon|grant [\s\S]* to authenticated|create or replace function/);
  assert.match(sql, /Do not apply/);
});
