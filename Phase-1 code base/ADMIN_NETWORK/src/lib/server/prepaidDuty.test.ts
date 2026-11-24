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

test("setDuty requires atomic go_online_with_day_fee and fails closed without it", () => {
  const source = readFileSync(join(root, "src/lib/server/cityRides.ts"), "utf8");
  assert.match(source, /go_online_with_day_fee/);
  assert.match(source, /duty_rpc_unavailable/);
  assert.match(source, /Duty service is temporarily unavailable/);
  assert.doesNotMatch(source, /Interim prepaid guard until go_online_with_day_fee/);
  assert.match(source, /Insufficient wallet balance\. Recharge your wallet to go online\./);
  assert.match(source, /rechargeAvailable: false/);
  assert.match(source, /renew_online_day_fee/);
  assert.match(source, /captainsPaidForIstDay/);
});

test("proposed renew_online_day_fee uses Asia/Kolkata and preserves active rides", () => {
  const sql = readFileSync(join(root, "../../supabase/proposed/20261124210000_renew_online_day_fee.sql"), "utf8");
  assert.match(sql, /Asia\/Kolkata/);
  assert.match(sql, /stale_presence/);
  assert.match(sql, /insufficient_wallet_balance/);
  assert.match(sql, /activeRidePreserved/);
  assert.match(sql, /auto_renewal/);
  assert.match(sql, /grant execute on function public\.renew_online_day_fee\(uuid, integer\) to service_role/);
});

test("wallet top-up endpoint stays closed for captains until funding is ready", () => {
  const route = readFileSync(join(root, "src/app/api/v1/[[...path]]/route.ts"), "utf8");
  assert.match(route, /wallet\/topup/);
  assert.match(route, /Adding money opens when the payment service is connected/);
});
