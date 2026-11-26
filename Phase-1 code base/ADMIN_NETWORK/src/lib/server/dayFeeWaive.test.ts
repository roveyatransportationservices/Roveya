import assert from "node:assert/strict";
import test from "node:test";
import { dayFeeWaived } from "./cityRides";

test("day fee waive is staging-only and flag-gated", () => {
  assert.equal(dayFeeWaived({ ROVEYA_SKIP_DAY_FEE: "staging", NEXT_PUBLIC_SUPABASE_URL: "https://pqnfipleuztivnrsyvkd.supabase.co" }), true);
  assert.equal(dayFeeWaived({ ROVEYA_SKIP_DAY_FEE: "staging", NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" }), false);
  assert.equal(dayFeeWaived({ ROVEYA_SKIP_DAY_FEE: "1", NEXT_PUBLIC_SUPABASE_URL: "https://pqnfipleuztivnrsyvkd.supabase.co" }), false);
  assert.equal(dayFeeWaived({}), false);
});
