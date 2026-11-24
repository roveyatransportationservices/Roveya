import assert from "node:assert/strict";
import test from "node:test";
import { nextTripStatus, preferFresherLocation } from "./clientSync.ts";

test("nextTripStatus advances only forward and never restores searching over assigned", () => {
  assert.equal(nextTripStatus("searching", "assigned"), "assigned");
  assert.equal(nextTripStatus("assigned", "searching"), null);
  assert.equal(nextTripStatus("onTrip", "arrived"), null);
  assert.equal(nextTripStatus("payment", "completed"), null);
  assert.equal(nextTripStatus("arrived", "on_trip"), "onTrip");
  assert.equal(nextTripStatus("onTrip", "completed"), "payment");
});

test("preferFresherLocation rejects older GPS samples", () => {
  const older = { latitude: 1, longitude: 1, updatedAt: "2026-01-01T10:00:00.000Z" };
  const newer = { latitude: 2, longitude: 2, updatedAt: "2026-01-01T10:00:05.000Z" };
  assert.deepEqual(preferFresherLocation(newer, older), newer);
  assert.deepEqual(preferFresherLocation(older, newer), newer);
  assert.deepEqual(preferFresherLocation(null, newer), newer);
});
