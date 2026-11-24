import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("email sign-in stores no invented mobile number", () => {
  const sql = readFileSync(new URL("../../../../../ROVEYA_PHASE4_TESTING/email_rider_phone_nullable.sql", import.meta.url), "utf8");
  const account = readFileSync(new URL("./cityRides.ts", import.meta.url), "utf8");
  assert.match(sql, /alter table public\.riders alter column phone drop not null/i);
  assert.match(account, /phone: target\.kind === "phone" \? target\.value : null/);
  assert.doesNotMatch(sql, /delete from/i);
});
