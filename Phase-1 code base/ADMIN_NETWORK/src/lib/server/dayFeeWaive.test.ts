import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { dayFeeWaived } from "./cityRides";

test("day fee waive is staging-only and flag-gated", () => {
  assert.equal(dayFeeWaived({ ROVEYA_SKIP_DAY_FEE: "staging", NEXT_PUBLIC_SUPABASE_URL: "https://pqnfipleuztivnrsyvkd.supabase.co" }), true);
  assert.equal(dayFeeWaived({ ROVEYA_SKIP_DAY_FEE: "staging", NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" }), false);
  assert.equal(dayFeeWaived({ ROVEYA_SKIP_DAY_FEE: "1", NEXT_PUBLIC_SUPABASE_URL: "https://pqnfipleuztivnrsyvkd.supabase.co" }), false);
  assert.equal(dayFeeWaived({}), false);
});

test("day fee waive skips heartbeat renewal and assignTrip fee gate", () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "cityRides.ts"), "utf8");
  assert.match(source, /if \(data\?\.online && !dayFeeWaived\(\)\)/);
  assert.match(source, /do not renew\/charge day fee or block assignment when waived/);
  const assignIdx = source.indexOf("async function assignTrip");
  const assignBlock = source.slice(assignIdx, assignIdx + 900);
  assert.match(assignBlock, /if \(!dayFeeWaived\(\)\)/);
  assert.match(assignBlock, /renewOnlineDayFee/);
  assert.match(assignBlock, /captainsPaidForIstDay/);
});
