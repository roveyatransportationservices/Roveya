import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { collectedPaise, departInstant, formatInrPaise, nonRiderRefundPaise, passengerQuote, refundFor } from "./refundPolicy.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const codeBase = path.resolve(here, "../../..");
const repoRoot = path.resolve(codeBase, "..");

function existing(candidates: string[]) {
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error("required project file is not in the repository layout");
  return found;
}

const copies = [
  existing([path.join(codeBase, "ADMIN_NETWORK/src/lib/refundPolicy.ts"), path.join(codeBase, "admin/src/lib/refundPolicy.ts")]),
  existing([path.join(codeBase, "RoveyaOfficialWebsite/src/lib/refundPolicy.ts"), path.join(codeBase, "website/src/lib/refundPolicy.ts")]),
  existing([path.join(codeBase, "car-captains/src/refundPolicy.ts"), path.join(codeBase, "carpool-captain/src/refundPolicy.ts")]),
  existing([path.join(codeBase, "users-app/src/refundPolicy.ts"), path.join(codeBase, "carpool-customer/src/refundPolicy.ts")]),
];
const collected = 65322;
const depart = new Date("2026-12-20T03:30:00.000Z");

function atHours(hours: number) {
  return new Date(depart.getTime() - hours * 3600000);
}

test("the four policy modules are the same file", () => {
  const [first, ...rest] = copies.map((path) => fs.readFileSync(path, "utf8"));
  for (const copy of rest) assert.equal(copy, first);
});

test("the installed seat_cancel thresholds are unchanged", () => {
  const sql = fs.readFileSync(existing([
    path.join(repoRoot, "supabase/migrations/20261028140000_seat_booking_fee.sql"),
    path.join(codeBase, "supabase/migrations/20261028140000_seat_booking_fee.sql"),
  ]), "utf8");
  const body = sql.slice(sql.indexOf("function public.seat_cancel"), sql.indexOf("revoke all on function public.seat_cancel"));
  assert.match(body, /when v.secured and v_hours >= 6 then 100/);
  assert.match(body, /when v_hours >= 48 then 100/);
  assert.match(body, /when v_hours >= 24 then 90/);
  assert.match(body, /when v_hours >= 6 then 75/);
  assert.match(body, /when v_hours >= 2 then 50/);
  assert.match(body, /v_base := greatest\(0, v_collected - v.secure_paise\)/);
  assert.match(body, /v_target := round\(v_base \* v_pct \/ 100.0 \/ 100.0\) \* 100/);
  assert.match(body, /v_target := v_collected/);
  assert.ok(body.indexOf("v.status = 'cancelled'") < body.indexOf("ledger_post"));
  assert.match(body, /if v.status = 'pending'/);
  assert.match(body, /raise exception 'trip_started'/);
});

test("the verified 653.22 booking matches the database rounding", () => {
  const expectPaise = (hours: number, paise: number) => assert.equal(refundFor(collected, 0, false, depart, atHours(hours)).refundPaise, paise);
  expectPaise(48 + 1 / 60, 65300);
  expectPaise(48, 65300);
  expectPaise(48 - 1 / 3600000, 58800);
  expectPaise(24, 58800);
  expectPaise(24 - 1 / 3600000, 49000);
  expectPaise(12, 49000);
  expectPaise(6, 49000);
  expectPaise(6 - 1 / 3600000, 32700);
  expectPaise(3, 32700);
  expectPaise(2, 32700);
  expectPaise(2 - 1 / 3600000, 0);
  expectPaise(1, 0);
  expectPaise(0, 0);
  expectPaise(-1, 0);
  assert.equal(nonRiderRefundPaise(collected), 65322);
  assert.equal(formatInrPaise(65300), "₹653");
  assert.equal(formatInrPaise(65322), "₹653.22");
});

test("a secured booking refunds the base and keeps the secure fee", () => {
  const secure = 1900;
  const paid = collected + secure;
  assert.equal(refundFor(paid, secure, true, depart, atHours(48)).refundPaise, 65300);
  assert.equal(refundFor(paid, secure, true, depart, atHours(6)).refundPaise, 65300);
  assert.equal(refundFor(paid, secure, true, depart, atHours(6 - 1 / 3600000)).refundPaise, 32700);
  assert.equal(refundFor(paid, secure, false, depart, atHours(6)).refundPaise, 49000);
});

test("quotes follow status, trip start, stored refunds, and a crossed band", () => {
  const base = { walletCollectedPaise: collected, gatewayCollectedPaise: 0, deskCollectedPaise: 0, securePaise: 0, secured: false, departAt: depart.toISOString(), tripStatus: "scheduled", status: "confirmed" };
  assert.equal(passengerQuote({ ...base, now: atHours(48) }).refundPaise, 65300);
  assert.equal(passengerQuote({ ...base, now: atHours(48 - 1 / 3600000) }).refundPaise, 58800);
  const started = passengerQuote({ ...base, tripStatus: "on_trip", now: atHours(-1) });
  assert.equal(started.available, false);
  assert.equal(started.refundPaise, 0);
  assert.equal(passengerQuote({ ...base, status: "pending" }).refundPaise, 0);
  assert.equal(passengerQuote({ ...base, status: "cancelled", storedRefundPaise: 32700 }).refundPaise, 32700);
  assert.equal(passengerQuote({ ...base, status: "cancelled", storedRefundPaise: 32700 }).refundPaise, 32700);
  assert.equal(passengerQuote({ ...base, departAt: "not-a-time" }).available, false);
  assert.equal(collectedPaise({ walletPaise: 100, gatewayPaise: 20, deskPaise: 3 }), 123);
});

test("Asia/Kolkata clock times use the same instant as the database timestamp", () => {
  const fromClock = departInstant("09:00", "2026-12-20");
  assert.equal(fromClock?.toISOString(), depart.toISOString());
  assert.equal(refundFor(collected, 0, false, fromClock!, atHours(2)).refundPaise, 32700);
});

test("customer copy and the cancel routes do not accept a client refund", () => {
  const phone = fs.readFileSync(existing([path.join(codeBase, "ADMIN_NETWORK/src/lib/server/seatsPhone.ts"), path.join(codeBase, "admin/src/lib/server/seatsPhone.ts")]), "utf8");
  const admin = fs.readFileSync(existing([path.join(codeBase, "ADMIN_NETWORK/src/app/api/bookings/[id]/route.ts"), path.join(codeBase, "admin/src/app/api/bookings/[id]/route.ts")]), "utf8");
  const detail = fs.readFileSync(existing([path.join(codeBase, "ADMIN_NETWORK/src/components/bookings/CarpoolDetail.tsx"), path.join(codeBase, "admin/src/components/bookings/CarpoolDetail.tsx")]), "utf8");
  assert.match(phone, /passengerQuote\(/);
  assert.doesNotMatch(phone, /body\.refund/);
  assert.match(admin, /p_by: "system"/);
  const schema = admin.slice(admin.indexOf("const action"), admin.indexOf("});"));
  assert.equal(schema.includes("refund"), false);
  assert.doesNotMatch(detail, /total_paise \+ b\.cash_paise/);
  assert.match(detail, /collectedPaise\(/);
});
