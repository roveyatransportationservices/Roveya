import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { LOOKUP_MISS, lookupQuery, publicLookupView } from "./publicLookup.ts";
import { dayFeeDecision, dayFeeFromRpc } from "./dayFee.ts";
import { allow, setSlotCheckForTests } from "./server/rateLimit.ts";

const booked = {
  id: "booking-1",
  pnr: "RV12AB",
  status: "Upcoming",
  phone: "9876543210",
  payable: 653.22,
  fare: 560,
  fee: 79,
  gst: 14.22,
  total: 653.22,
  discount: 0,
  cashUsed: 0,
  paidWith: "online",
  secured: false,
  secure: 0,
  refund: 0,
  refundQuote: { percent: 75, amount: 490, refundPaise: 49000, note: "Estimate only.", securePaise: 0 },
  refundNote: "Estimate only.",
  travellers: [{ name: "Ada Lovelace", age: 30, gender: "Female" }],
  boarding: { name: "Majestic", time: "09:00" },
  drop: { name: "Electronic City", time: "10:30" },
  seats: [{ id: "1A", label: "1A", price: 560 }],
  trip: { id: "trip-1", fromId: "blr", toId: "mys", date: "2026-11-22", departAt: "2026-11-22T03:30:00.000Z", operator: "Ravi Kumar", car: "Swift" },
};

test("a wrong PNR and a wrong phone are the same miss", () => {
  assert.equal(lookupQuery("short", "9876543210"), null);
  assert.equal(lookupQuery("RV12AB", "1111111111"), null);
  assert.equal(lookupQuery("rv12ab", "9876543210")?.pnr, "RV12AB");
  assert.equal(LOOKUP_MISS, "No booking matches that PNR and mobile number.");
});

test("a successful lookup keeps the ticket fields and drops the phone and fare split", () => {
  const shown = publicLookupView(booked);
  assert.equal(shown.pnr, "RV12AB");
  assert.equal(shown.travellers[0].name, "Ada");
  assert.equal(shown.trip.operator, "Ravi");
  assert.equal(shown.seats[0].label, "1A");
  assert.equal(shown.refundQuote?.refundPaise, 49000);
  assert.equal("phone" in shown, false);
  assert.equal("id" in shown, false);
  assert.equal("fee" in shown, false);
  assert.equal("gst" in shown, false);
  assert.equal("fare" in shown, false);
  const quote = shown.refundQuote as Record<string, unknown>;
  assert.equal("securePaise" in quote, false);
});

test("repeated booking lookups stop after the shared limit", async () => {
  let used = 0;
  setSlotCheckForTests(async () => ({ error: null, data: used++ < 10 }));
  for (let attempt = 0; attempt < 10; attempt += 1) await allow("pnr", "203.0.113.8", 10, 600, "Too many booking lookups. Wait ten minutes and try again.");
  await assert.rejects(() => allow("pnr", "203.0.113.8", 10, 600, "Too many booking lookups. Wait ten minutes and try again."), /Too many booking lookups/);
  setSlotCheckForTests(null);
});

test("the daily fee is once per India day, and a cab or a covered month is not charged", () => {
  const charge = dayFeeDecision({ vehicle: "bike", mode: "subscription", bikeDayRupees: 10, autoDayRupees: 12, day: "2026-11-21" });
  assert.deepEqual(charge, { action: "charge", amountPaise: 1000 });
  assert.equal(dayFeeDecision({ vehicle: "auto", mode: "subscription", bikeDayRupees: 10, autoDayRupees: 12, day: "2026-11-21" }).action, "charge");
  assert.equal(dayFeeDecision({ vehicle: "cab", mode: "subscription", bikeDayRupees: 10, autoDayRupees: 12, day: "2026-11-21" }).action, "skip");
  assert.equal(dayFeeDecision({ vehicle: "bike", mode: "commission", bikeDayRupees: 10, autoDayRupees: 12, day: "2026-11-21" }).action, "skip");
  assert.equal(dayFeeDecision({ vehicle: "bike", mode: "subscription", bikeDayRupees: 10, autoDayRupees: 12, day: "2026-11-21", monthVehicle: "bike", monthUntil: "2026-11-30" }).action, "skip");
  const again = dayFeeDecision({ vehicle: "bike", mode: "subscription", bikeDayRupees: 10, autoDayRupees: 12, day: "2026-11-21", existingTransactionId: "active_day_1_2026-11-21", existingPaise: 1000 });
  assert.equal(again.action, "already");
  assert.deepEqual(dayFeeFromRpc({ transactionId: "active_day_1_2026-11-21", day: "2026-11-21", amountPaise: 1000 }), { transactionId: "active_day_1_2026-11-21", day: "2026-11-21", amount: 10 });
  assert.equal(dayFeeFromRpc(null), null);
  const rides = readFileSync(new URL("./server/cityRides.ts", import.meta.url), "utf8");
  assert.match(rides, /charge_active_day/);
  assert.doesNotMatch(rides, /active_day_\$\{captainId\}/);
});
