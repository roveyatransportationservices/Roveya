import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { cityPaymentKind, paidDirectlyToCaptain, paidThroughPlatformGateway, paymentMethodLabel, settleTripShouldCreditCaptainWallet } from "./settlementPolicy.ts";
import { dayFeeDecision } from "./dayFee.ts";
import { cityReceipt, receiptEmailDecision } from "./receipt.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("direct UPI is not the same as gateway online payment", () => {
  assert.equal(cityPaymentKind("upi"), "upi");
  assert.equal(cityPaymentKind("online"), "online");
  assert.equal(paidDirectlyToCaptain("cash"), true);
  assert.equal(paidDirectlyToCaptain("upi"), true);
  assert.equal(paidDirectlyToCaptain("online"), false);
  assert.equal(paidThroughPlatformGateway("online"), true);
  assert.equal(paidThroughPlatformGateway("upi"), false);
  assert.equal(settleTripShouldCreditCaptainWallet("online"), true);
  assert.equal(settleTripShouldCreditCaptainWallet("upi"), false);
  assert.equal(settleTripShouldCreditCaptainWallet("cash"), false);
  assert.match(paymentMethodLabel("upi"), /directly to the captain/i);
  assert.match(paymentMethodLabel("online"), /through ROVEYA/i);
});

test("current settle_trip SQL still credits wallet for every non-cash payment including direct UPI", () => {
  const sql = readFileSync(join(root, "../../supabase/migrations/20261021100000_mobile_platform.sql"), "utf8");
  assert.match(sql, /if v\.payment = 'cash'/);
  assert.match(sql, /ride_earning/);
  assert.doesNotMatch(sql, /payment in \('cash', 'upi'\)/);
});

test("city booking UI and API still accept online for Bike and Auto", () => {
  const options = readFileSync(join(root, "../Phase-2 implementation/Roveya-Bike,Auto/customer/src/screens/OptionsScreen.tsx"), "utf8");
  const security = readFileSync(join(root, "src/lib/server/rideStartSecurity.ts"), "utf8");
  assert.match(options, /setPayment\("online"\)/);
  assert.match(security, /payment === "online"/);
});

test("daily fee decision stays once per India day with bike 10 and auto 12", () => {
  assert.deepEqual(dayFeeDecision({ vehicle: "bike", mode: "subscription", bikeDayRupees: 10, autoDayRupees: 12, day: "2026-11-24" }), { action: "charge", amountPaise: 1000 });
  assert.deepEqual(dayFeeDecision({ vehicle: "auto", mode: "subscription", bikeDayRupees: 10, autoDayRupees: 12, day: "2026-11-24" }), { action: "charge", amountPaise: 1200 });
  assert.equal(dayFeeDecision({ vehicle: "bike", mode: "subscription", bikeDayRupees: 10, autoDayRupees: 12, day: "2026-11-24", existingTransactionId: "x", existingPaise: 1000 }).action, "already");
  assert.equal(dayFeeDecision({ vehicle: "cab", mode: "subscription", bikeDayRupees: 10, autoDayRupees: 12, day: "2026-11-24" }).action, "skip");
});

test("proposed charge_active_day uses Asia/Kolkata and allow_negative ledger debit", () => {
  const sql = readFileSync(join(root, "../../supabase/proposed/20261121240000_charge_active_day.sql"), "utf8");
  assert.match(sql, /Asia\/Kolkata/);
  assert.match(sql, /Active day fee/);
  assert.match(sql, /true\s*\)/);
});

test("receipt email stays skipped when already sent and held without approval", () => {
  assert.equal(receiptEmailDecision({ configured: true, approved: false, alreadySent: false }), "hold");
  assert.equal(receiptEmailDecision({ configured: true, approved: true, alreadySent: true }), "skip");
  const receipt = cityReceipt({ tripId: "t1", code: "RV1", farePaise: 2500, payment: "cash", paymentStatus: "due", completedAt: "2026-11-24T12:00:00.000Z" });
  assert.match(receipt.paymentMethod, /Cash paid to the captain/);
  assert.equal(receipt.document, "non_tax_receipt_draft");
});

test("customer cancel fee messaging is client-side only and not a gateway charge", () => {
  const dayPlan = readFileSync(join(root, "../Phase-2 implementation/Roveya-Bike,Auto/customer/src/dayPlan.ts"), "utf8");
  const store = readFileSync(join(root, "../Phase-2 implementation/Roveya-Bike,Auto/customer/src/store.tsx"), "utf8");
  assert.match(dayPlan, /CANCEL_AFTER_ARRIVAL = \{ bike: 20, auto: 30 \}/);
  assert.match(store, /passengerCancelFee/);
  assert.match(store, /owed to the captain/);
  const cancelSql = readFileSync(join(root, "ADMIN CONTROLS/016_accept_safety.sql"), "utf8");
  assert.doesNotMatch(cancelSql, /cancel[_ ]?fee|CANCEL_AFTER_ARRIVAL|owed to the captain/i);
  const cityRides = readFileSync(join(root, "src/lib/server/cityRides.ts"), "utf8");
  assert.doesNotMatch(cityRides, /passengerCancelFee|CANCEL_AFTER_ARRIVAL/);
});
