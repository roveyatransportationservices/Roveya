import assert from "node:assert/strict";
import test from "node:test";
import { locationFixBelievable } from "./locationFix.ts";

const hyd = { latitude: 17.385, longitude: 78.4867 };

test("locationFixBelievable rejects non-finite and out-of-India coordinates", () => {
  assert.equal(locationFixBelievable(null, { latitude: NaN, longitude: 78 }), false);
  assert.equal(locationFixBelievable(null, { latitude: 0, longitude: 0 }), false);
  assert.equal(locationFixBelievable(null, { latitude: 40, longitude: 78 }), false);
  assert.equal(locationFixBelievable(null, hyd), true);
});

test("locationFixBelievable ignores impossible teleports over 140 km/h", () => {
  const previous = { ...hyd, updatedAt: new Date(Date.UTC(2026, 0, 1, 12, 0, 0)).toISOString() };
  const nearby = { latitude: 17.5, longitude: 78.5 };
  const oneMinuteLater = Date.UTC(2026, 0, 1, 12, 1, 0);
  assert.equal(locationFixBelievable(previous, nearby, oneMinuteLater), false);
  const hourLater = Date.UTC(2026, 0, 1, 13, 0, 0);
  assert.equal(locationFixBelievable(previous, nearby, hourLater), true);
});
