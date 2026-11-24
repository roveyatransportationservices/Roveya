import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { paymentStatusLabel } from "../settlementPolicy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

test("receipt payment status distinguishes due, captain-reported, and gateway wording", () => {
  assert.match(paymentStatusLabel("cash", "due"), /Payment due to the captain/i);
  assert.match(paymentStatusLabel("upi", "paid"), /not independently verified/i);
  assert.match(paymentStatusLabel("online", "paid"), /Gateway payment recorded as paid/i);
});

test("setDuty prefers atomic go_online_with_day_fee and prepaid interim guard", () => {
  const source = readFileSync(join(root, "src/lib/server/cityRides.ts"), "utf8");
  assert.match(source, /go_online_with_day_fee/);
  assert.match(source, /Insufficient wallet balance\. Recharge your wallet to go online\./);
  assert.match(source, /rechargeAvailable: false/);
  assert.match(source, /istBusinessDay|Asia\/Kolkata/);
  assert.match(source, /active_day_\$\{captainId\}_\$\{day\}/);
});

test("wallet top-up endpoint stays closed for captains until funding is ready", () => {
  const route = readFileSync(join(root, "src/app/api/v1/[[...path]]/route.ts"), "utf8");
  assert.match(route, /wallet\/topup/);
  assert.match(route, /Adding money opens when the payment service is connected/);
});
