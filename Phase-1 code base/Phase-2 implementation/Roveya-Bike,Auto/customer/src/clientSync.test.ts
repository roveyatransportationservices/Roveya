import assert from "node:assert/strict";
import test from "node:test";
import { locationAfterCaptainChange, nextTripStatus, preferFresherLocation, shouldReturnToSearching } from "./clientSync.ts";

test("nextTripStatus advances only forward and never restores searching over assigned", () => {
  assert.equal(nextTripStatus("searching", "assigned"), "assigned");
  assert.equal(nextTripStatus("assigned", "searching"), null);
  assert.equal(nextTripStatus("onTrip", "arrived"), null);
  assert.equal(nextTripStatus("payment", "completed"), null);
  assert.equal(nextTripStatus("arrived", "on_trip"), "onTrip");
  assert.equal(nextTripStatus("onTrip", "completed"), "payment");
});

test("shouldReturnToSearching allows legitimate reassignment without opening terminal rides", () => {
  assert.equal(shouldReturnToSearching("assigned", "searching"), true);
  assert.equal(shouldReturnToSearching("arrived", "searching"), true);
  assert.equal(shouldReturnToSearching("onTrip", "searching"), false);
  assert.equal(shouldReturnToSearching("payment", "searching"), false);
  assert.equal(shouldReturnToSearching("done", "searching"), false);
  assert.equal(shouldReturnToSearching("searching", "searching"), false);
});

test("preferFresherLocation rejects older GPS samples", () => {
  const older = { latitude: 1, longitude: 1, updatedAt: "2026-01-01T10:00:00.000Z" };
  const newer = { latitude: 2, longitude: 2, updatedAt: "2026-01-01T10:00:05.000Z" };
  assert.deepEqual(preferFresherLocation(newer, older), newer);
  assert.deepEqual(preferFresherLocation(older, newer), newer);
  assert.deepEqual(preferFresherLocation(null, newer), newer);
});

test("locationAfterCaptainChange drops previous captain GPS even when its stamp is newer", () => {
  const previous = { latitude: 1, longitude: 1, updatedAt: "2026-01-01T10:00:10.000Z" };
  const replacement = { latitude: 9, longitude: 9, updatedAt: "2026-01-01T10:00:01.000Z" };
  assert.deepEqual(locationAfterCaptainChange("captain-a", "captain-b", previous, replacement), replacement);
  assert.deepEqual(locationAfterCaptainChange("captain-a", "captain-a", previous, replacement), previous);
  assert.equal(locationAfterCaptainChange("captain-a", null, previous, replacement), null);
});
