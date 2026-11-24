import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { canTransition } from "./dispatch.ts";
import { captainAssignedKey, captainReleasedKey, offerNoticeKey, stillRelevant } from "../deliveryClaim.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

test("customer cancel is legal before start and illegal once the trip is moving", () => {
  for (const from of ["searching", "assigned", "arrived"] as const) {
    assert.equal(canTransition(from, "cancelled"), true);
  }
  assert.equal(canTransition("on_trip", "cancelled"), false);
  assert.equal(canTransition("completed", "cancelled"), false);
  assert.equal(canTransition("cancelled", "searching"), false);
  assert.equal(canTransition("expired", "searching"), false);
  assert.equal(canTransition("completed", "searching"), false);
});

test("captain cancel reassigns only from assigned or arrived back to searching", () => {
  assert.equal(canTransition("assigned", "searching"), true);
  assert.equal(canTransition("arrived", "searching"), true);
  assert.equal(canTransition("on_trip", "searching"), false);
  assert.equal(canTransition("searching", "searching"), false);
});

test("assignment notice keys stay distinct across captains and versions", () => {
  const a1 = captainAssignedKey("trip-1", "captain-a", 1);
  const a2 = captainAssignedKey("trip-1", "captain-a", 2);
  const b1 = captainAssignedKey("trip-1", "captain-b", 1);
  const released = captainReleasedKey("trip-1", "captain-a", 1);
  assert.notEqual(a1, a2);
  assert.notEqual(a1, b1);
  assert.notEqual(a1, released);
  assert.equal(captainAssignedKey("trip-1", "captain-a", 1), a1);
});

test("stale assignment notices are not relevant after a later captain takes the ride", () => {
  const now = Date.now();
  const keyA1 = captainAssignedKey("trip-1", "captain-a", 1);
  const keyB2 = captainAssignedKey("trip-1", "captain-b", 2);
  assert.equal(stillRelevant("captain_assigned", "rides", now, { rideStatus: "assigned", captainId: "captain-b", assignmentVersion: 2 }, keyB2), true);
  assert.equal(stillRelevant("captain_assigned", "rides", now, { rideStatus: "assigned", captainId: "captain-b", assignmentVersion: 2 }, keyA1), false);
  assert.equal(stillRelevant("captain_assigned", "rides", now, { rideStatus: "cancelled", captainId: "captain-a", assignmentVersion: 1 }, keyA1), false);
  assert.equal(stillRelevant("offer_created", "offers", now, { offerStatus: "expired", rideStatus: "searching" }), false);
  assert.ok(offerNoticeKey("offer-1", "created"));
});

test("cancel_city_ride and accept_city_offer keep trip-first locking and cancel statuses", () => {
  const sql = readFileSync(join(root, "ADMIN CONTROLS/016_accept_safety.sql"), "utf8");
  assert.match(sql, /cancel_city_ride/);
  assert.match(sql, /status in \('searching', 'assigned', 'arrived'\)/);
  assert.match(sql, /accept_city_offer/);
  assert.match(sql, /expires_at > now\(\)/);
  assert.match(sql, /status = 'searching' and captain_id is null/);
});

test("assignment_version trigger only increments when captain_id changes", () => {
  const sql = readFileSync(join(root, "../../ROVEYA_PHASE3_STAGING/assignment_version_prepare.sql"), "utf8");
  assert.match(sql, /new\.captain_id is distinct from old\.captain_id/);
  assert.match(sql, /assignment_version := old\.assignment_version \+ 1/);
  assert.match(sql, /assignment_version := old\.assignment_version/);
});
