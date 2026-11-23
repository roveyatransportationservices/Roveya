import assert from "node:assert/strict";
import test from "node:test";
import {
  DISPATCH_DEFAULTS,
  assignmentWinner,
  bookingPhase,
  canTransition,
  captainAvailability,
  clampSettings,
  createDispatchBoard,
  nearPickup,
  offRoute,
  pickupTooFar,
  eligibleCaptains,
  rankCaptains,
  searchExpired,
  searchRadiusKm,
  waveFor,
} from "./dispatch.ts";

test("the search opens at 2 km and steps out to 8 km", () => {
  assert.equal(searchRadiusKm(0), 2);
  assert.equal(searchRadiusKm(19), 2);
  assert.equal(searchRadiusKm(20), 4);
  assert.equal(searchRadiusKm(40), 6);
  assert.equal(searchRadiusKm(90), 8);
  assert.equal(searchExpired(149), false);
  assert.equal(searchExpired(150), true);
});

test("only a free approved captain inside the radius is offered, nearest first", () => {
  const captains = [
    { id: "far", vehicle: "bike", pickupKm: 1.2, approved: true, fresh: true, busy: false, pending: false },
    { id: "near", vehicle: "bike", pickupKm: 0.4, approved: true, fresh: true, busy: false, pending: false },
    { id: "busy", vehicle: "bike", pickupKm: 0.2, approved: true, fresh: true, busy: true, pending: false },
    { id: "stale", vehicle: "bike", pickupKm: 0.3, approved: true, fresh: false, busy: false, pending: false },
    { id: "review", vehicle: "bike", pickupKm: 0.1, approved: false, fresh: true, busy: false, pending: false },
    { id: "auto", vehicle: "auto", pickupKm: 0.1, approved: true, fresh: true, busy: false, pending: false },
    { id: "holding", vehicle: "bike", pickupKm: 0.5, approved: true, fresh: true, busy: false, pending: true },
  ];
  assert.deepEqual(rankCaptains(captains, "bike", 2, 5, 1).map((item) => item.id), ["near"]);
  assert.equal(rankCaptains(captains, "bike", 2, 5, 2).length, 2);
  assert.deepEqual(eligibleCaptains(captains, "bike", 2, 5).map((item) => item.id), ["near", "far"]);
});

test("a short ride does not call a captain from across the city", () => {
  assert.equal(pickupTooFar(4, 1), true);
  assert.equal(pickupTooFar(1.2, 6), false);
});

test("availability follows the ride, not the phone alone", () => {
  assert.equal(captainAvailability({ account: "suspended", online: true, gpsFresh: true, offerPending: false, tripStatus: null }), "SUSPENDED");
  assert.equal(captainAvailability({ account: "active", online: false, gpsFresh: true, offerPending: false, tripStatus: null }), "OFFLINE");
  assert.equal(captainAvailability({ account: "active", online: true, gpsFresh: false, offerPending: false, tripStatus: null }), "TEMPORARILY_UNAVAILABLE");
  assert.equal(captainAvailability({ account: "active", online: true, gpsFresh: true, offerPending: true, tripStatus: null }), "OFFER_PENDING");
  assert.equal(captainAvailability({ account: "active", online: true, gpsFresh: true, offerPending: false, tripStatus: "assigned" }), "GOING_TO_PICKUP");
  assert.equal(captainAvailability({ account: "active", online: true, gpsFresh: true, offerPending: false, tripStatus: "on_trip" }), "RIDE_IN_PROGRESS");
  assert.equal(captainAvailability({ account: "active", online: true, gpsFresh: true, offerPending: false, tripStatus: null }), "AVAILABLE");
});

test("a ride can only move through a legal next status", () => {
  assert.equal(canTransition("searching", "assigned"), true);
  assert.equal(canTransition("searching", "on_trip"), false);
  assert.equal(canTransition("on_trip", "cancelled"), false);
  assert.equal(canTransition("assigned", "searching"), true);
  assert.equal(canTransition("completed", "completed"), false);
  assert.equal(bookingPhase({ status: "searching", offered: true }), "OFFERED");
  assert.equal(bookingPhase({ status: "cancelled", cancelledBy: "captain" }), "CAPTAIN_CANCELLED");
  assert.equal(bookingPhase({ status: "completed", paymentStatus: "due" }), "PAYMENT_PENDING");
  assert.equal(bookingPhase({ status: "completed", paymentStatus: "paid" }), "PAYMENT_COMPLETED");
});

test("the earlier assignment keeps the captain when two rides overlap", () => {
  assert.equal(assignmentWinner("2026-11-13T10:00:00.000Z", ["2026-11-13T10:00:01.000Z"]), true);
  assert.equal(assignmentWinner("2026-11-13T10:00:02.000Z", ["2026-11-13T10:00:01.000Z"]), false);
});

test("arrival and a large detour are measured from the road, not from a new booking status", () => {
  assert.equal(nearPickup({ lat: 17.4375, lng: 78.4483 }, { lat: 17.4376, lng: 78.4484 }), true);
  assert.equal(nearPickup({ lat: 17.45, lng: 78.46 }, { lat: 17.4375, lng: 78.4483 }), false);
  assert.equal(offRoute({ lat: 17.5, lng: 78.55 }, { lat: 17.4375, lng: 78.4483 }, { lat: 17.3616, lng: 78.4747 }), true);
});

test("settings stay inside the desk limits and the radius never shrinks", () => {
  const settings = clampSettings({ offerSeconds: 5, searchSeconds: 999, radiiKm: [8, 1, 6], batch: 9 });
  assert.equal(settings.offerSeconds, 10);
  assert.equal(settings.searchSeconds, 300);
  assert.equal(settings.batch, 2);
  assert.deepEqual(settings.radiiKm, [8, 8, 8, 8]);
  assert.equal(DISPATCH_DEFAULTS.batch, 1);
});

test("one hundred bookings and one hundred captains never give a captain two rides", async () => {
  const board = createDispatchBoard();
  for (let index = 0; index < 100; index += 1) {
    board.addCaptain({ id: `c${index}`, vehicle: index % 2 ? "auto" : "bike", lat: 17.4 + index / 1000, lng: 78.4, approved: true, fresh: true });
    board.addTrip({ id: `t${index}`, vehicle: index % 2 ? "auto" : "bike", lat: 17.4, lng: 78.4, status: "searching", captainId: null, assignedAt: null });
  }
  const captains = Array.from({ length: 100 }, (_, index) => ({
    id: `c${index}`,
    vehicle: index % 2 ? "auto" : "bike",
    lat: 17.4 + index / 1000,
    lng: 78.4,
    approved: true,
    fresh: true,
  }));
  const trips = Array.from({ length: 100 }, (_, index) => ({
    id: `t${index}`,
    vehicle: index % 2 ? "auto" : "bike",
    lat: 17.4,
    lng: 78.4,
    status: "searching",
    captainId: null,
    assignedAt: null,
  }));
  const wave = waveFor(trips, captains, DISPATCH_DEFAULTS);
  const seen = new Set<string>();
  for (const offer of wave) assert.equal(seen.has(offer.captainId), false, offer.captainId);
  for (const offer of wave) seen.add(offer.captainId);

  const attempts = [];
  for (let index = 0; index < 100; index += 1) {
    attempts.push(board.claim("t0", "c0", `2026-11-13T10:00:${String(index).padStart(2, "0")}.000Z`));
    attempts.push(board.claim(`t${index}`, `c${index % 2}`, `2026-11-13T10:01:${String(index).padStart(2, "0")}.000Z`));
  }
  const results = await Promise.all(attempts);
  board.resolveOverlap();
  const won = results.filter((result) => result === "ok").length;
  const assigned = board.snapshot().filter((trip) => trip.captainId);
  const captainsUsed = new Set(assigned.map((trip) => trip.captainId));
  assert.equal(captainsUsed.size, assigned.length);
  assert.ok(won >= 1);
  assert.equal(assigned.filter((trip) => trip.captainId === "c0").length <= 1, true);
});
