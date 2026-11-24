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
  assert.match(sql, /'eligibleForNewRides', false/);
  assert.doesNotMatch(sql, /captain_day_/);
  assert.match(sql, /grant execute on function public\.renew_online_day_fee\(uuid, integer\) to service_role/);
});

test("proposed prepaid fee SQL removes monthly bypass and hardcodes founder amounts", () => {
  const charge = readFileSync(join(root, "../../supabase/proposed/20261121240000_charge_active_day.sql"), "utf8");
  const goOnline = readFileSync(join(root, "../../supabase/proposed/20261124180000_prepaid_go_online.sql"), "utf8");
  assert.doesNotMatch(charge, /captain_day_/);
  assert.doesNotMatch(goOnline, /captain_day_/);
  assert.match(charge, /1000 else 1200/);
  assert.match(goOnline, /1000 else 1200/);
  assert.match(charge, /captains[\s\S]*for update/);
  assert.match(charge, /wallets[\s\S]*for update/);
  assert.match(goOnline, /captain_presence[\s\S]*for update/);
});

test("proposed matching SQL blocks unpaid captains at accept and offer", () => {
  const sql = readFileSync(join(root, "../../supabase/proposed/20261124220000_city_day_fee_matching.sql"), "utf8");
  assert.match(sql, /captain_paid_active_day/);
  assert.match(sql, /active_day_/);
  assert.match(sql, /accept_city_offer/);
  assert.match(sql, /offer_next_captain/);
});

test("wallet top-up endpoint stays closed for captains until funding is ready", () => {
  const route = readFileSync(join(root, "src/app/api/v1/[[...path]]/route.ts"), "utf8");
  assert.match(route, /wallet\/topup/);
  assert.match(route, /Adding money opens when the payment service is connected/);
});
