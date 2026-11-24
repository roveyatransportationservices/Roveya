import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CLAIM_NOTE, PROVIDER_NOTE, STALE_MS, abandonMatches, afterRead, assignedCaptainId, assignmentVersionFromKey, beginMatches, captainAssignedKey, captainChangedKey, claimMatches, deskAssignKey, deskCancelledCaptainKey, deskCancelledRiderKey, deskReleasedKey, duplicateMayClaimNow, holdForCancellation, mayCallProvider, nextAction, offerNoticeKey, ownerAction, pushFromStored, reclaimMatches, riderCancelledKey, searchExpiredKey, stableEventId, stillRelevant, type DeliveryRow } from "./deliveryClaim";

type Outcome = "ok" | "error" | "timeout";

function row(partial: Partial<DeliveryRow> & Pick<DeliveryRow, "status">): DeliveryRow {
  return { attempts: 0, lastError: null, updatedAt: 0, ...partial };
}

function run(start: DeliveryRow | null, now: number, ownsInsert: boolean, outcome: Outcome, cancelled: boolean | null, kind = "captain_assigned") {
  let current = start;
  let sends = 0;
  const action = ownerAction(current, now, ownsInsert);
  if (action === "stop" || action === "insert" || action === "abandon") return { sends, status: action === "abandon" ? "failed" : current?.status ?? "absent", action };
  current = { status: "queued", attempts: (current?.attempts ?? 0) + 1, lastError: CLAIM_NOTE, updatedAt: now };
  if (cancelled === null && !ownsInsert) return { sends, status: "queued", action: "hold" };
  if (holdForCancellation(kind, cancelled === true)) return { sends, status: "skipped", action: "skip" };
  if (!beginMatches(current)) return { sends, status: current.status, action: "stop" };
  current = { ...current, status: "unknown", lastError: PROVIDER_NOTE, updatedAt: now };
  sends += 1;
  const status = outcome === "timeout" ? "unknown" : outcome === "error" ? "failed" : "accepted";
  return { sends, status, action: "sent" };
}

test("a crash before the claim leaves a queued row that one later worker can send", () => {
  const inserted = row({ status: "queued", updatedAt: 1_000 });
  assert.equal(nextAction(inserted, 1_000 + STALE_MS - 1), "stop");
  assert.equal(run(inserted, 1_000 + STALE_MS, false, "ok", false).sends, 1);
  assert.equal(run(row({ status: "unknown", lastError: PROVIDER_NOTE, updatedAt: 5_000 }), 9_000, false, "ok", false).sends, 0);
});

test("a crash after the claim, before the provider, is sent once when the claim is stale", () => {
  const claimed = row({ status: "queued", lastError: CLAIM_NOTE, attempts: 1, updatedAt: 1_000 });
  assert.equal(reclaimMatches(claimed, 1_000 + STALE_MS), true);
  const first = run(claimed, 1_000 + STALE_MS, false, "ok", false);
  assert.equal(first.sends, 1);
  assert.equal(run(row({ status: "accepted", updatedAt: 20_000 }), 30_000, false, "ok", false).sends, 0);
});

test("a crash after the provider mark is unknown and is not sent again", () => {
  const started = row({ status: "unknown", lastError: PROVIDER_NOTE, attempts: 1, updatedAt: 1_000 });
  assert.equal(nextAction(started, 1_000 + STALE_MS * 4), "stop");
  assert.equal(run(started, 9_000, false, "ok", false).sends, 0);
});

test("provider success, confirmed failure, and timeout each contact the provider once", () => {
  const fresh = row({ status: "queued", updatedAt: 5_000 });
  assert.equal(run(fresh, 5_000, true, "ok", false).status, "accepted");
  assert.equal(run(fresh, 5_000, true, "error", false).status, "failed");
  const timed = run(fresh, 5_000, true, "timeout", false);
  assert.equal(timed.sends, 1);
  assert.equal(timed.status, "unknown");
});

test("a duplicate while the claim is fresh does not send, and two stale workers cannot both match", () => {
  const fresh = row({ status: "queued", lastError: CLAIM_NOTE, attempts: 1, updatedAt: 5_000 });
  assert.equal(nextAction(fresh, 5_100), "stop");
  const stale = row({ status: "queued", lastError: CLAIM_NOTE, attempts: 1, updatedAt: 1_000 });
  let storedAttempts = 1;
  const claim = (seen: number, now: number) => {
    if (storedAttempts !== seen || !reclaimMatches(stale, now)) return false;
    storedAttempts = seen + 1;
    return true;
  };
  assert.equal(claim(1, 1_000 + STALE_MS), true);
  assert.equal(claim(1, 1_000 + STALE_MS), false);
});

test("a restart keeps the stored phase, and three abandoned claims become failed without a send", () => {
  const stored = row({ status: "queued", lastError: CLAIM_NOTE, attempts: 3, updatedAt: 1_000 });
  assert.equal(abandonMatches(stored, 1_000 + STALE_MS), true);
  assert.equal(run(stored, 1_000 + STALE_MS, false, "ok", false).sends, 0);
  assert.equal(run(stored, 1_000 + STALE_MS, false, "ok", false).status, "failed");
});

test("a cancelled ride skips an assignment notice and still sends the cancellation itself", () => {
  const claimed = row({ status: "queued", lastError: CLAIM_NOTE, attempts: 1, updatedAt: 1_000 });
  assert.equal(run(claimed, 1_000 + STALE_MS, false, "ok", true, "captain_assigned").status, "skipped");
  assert.equal(run(claimed, 1_000 + STALE_MS, false, "ok", true, "ride_cancelled").sends, 1);
  assert.equal(holdForCancellation("captain_assigned", false), false);
});

test("the owner of a new row claims it immediately", () => {
  const inserted = row({ status: "queued", updatedAt: 5_000 });
  assert.equal(ownerAction(inserted, 5_000, true), "claim");
  assert.equal(claimMatches(inserted), true);
  assert.equal(beginMatches(row({ status: "queued", lastError: CLAIM_NOTE })), true);
});

test("a new captain offer is sent by its owner immediately and is not sent again", () => {
  const now = 8_000;
  const inserted = row({ status: "queued", updatedAt: now });
  assert.equal(ownerAction(inserted, now, true), "claim");
  assert.equal(nextAction(inserted, now), "stop");
  const sent = run(inserted, now, true, "ok", false, "offer_created");
  assert.equal(sent.sends, 1);
  assert.equal(sent.status, "accepted");
  assert.equal(run(row({ status: "accepted", updatedAt: now }), now + STALE_MS, false, "ok", false, "offer_created").sends, 0);
  assert.equal(run(row({ status: "failed", lastError: "provider_error", updatedAt: now }), now + STALE_MS, false, "ok", false, "offer_created").sends, 0);
  assert.equal(run(row({ status: "unknown", lastError: PROVIDER_NOTE, updatedAt: now }), now + STALE_MS, true, "ok", false, "offer_created").sends, 0);
});

test("a failed read or a failed provider-start update does not allow a send", () => {
  assert.equal(afterRead(null, 5_000, true), "stop");
  assert.equal(mayCallProvider(false), false);
  assert.equal(mayCallProvider(true), true);
});

test("a stored payload rebuilds the push, and a partial payload does not", () => {
  assert.deepEqual(pushFromStored({ userId: "rider-1", audience: "rider", title: "Captain assigned", body: "RV1 has a captain." }), {
    userId: "rider-1",
    app: "rider",
    title: "Captain assigned",
    body: "RV1 has a captain.",
  });
  assert.equal(pushFromStored({ userId: "rider-1", audience: "rider", title: "Captain assigned", body: "" }), null);
});

test("each offer keeps its own key, and a retry uses that same key", () => {
  const createdA = offerNoticeKey("offer-a", "created");
  const createdB = offerNoticeKey("offer-b", "created");
  const expiredB = offerNoticeKey("offer-b", "expired");
  const createdC = offerNoticeKey("offer-c", "created");
  assert.equal(createdA, "captain:offer:offer-a:created");
  assert.notEqual(createdA, createdB);
  assert.notEqual(createdB, expiredB);
  assert.notEqual(createdB, createdC);
  assert.equal(offerNoticeKey("offer-a", "created"), createdA);
  assert.equal(offerNoticeKey("  ", "created"), null);
  assert.equal(stableEventId(createdA), createdA);
  assert.equal(stableEventId("captain:offers:New ride request:captain-1"), "captain:offers:New ride request:captain-1");
  assert.equal(stableEventId(""), null);
  assert.equal(stableEventId(undefined), null);
});

test("a later delivery skips an offer that was rejected, expired, cancelled, or moved", () => {
  const now = 10_000;
  const live = { offerStatus: "offered", offerExpiresAt: now + 1_000, captainOnline: true };
  assert.equal(stillRelevant("offer_created", "offers", now, live), true);
  assert.equal(stillRelevant("offer_created", "offers", now, { ...live, offerStatus: "rejected" }), false);
  assert.equal(stillRelevant("offer_created", "offers", now, { ...live, offerStatus: "expired" }), false);
  assert.equal(stillRelevant("offer_created", "offers", now, { ...live, offerExpiresAt: now - 1 }), false);
  assert.equal(stillRelevant("offer_created", "offers", now, { ...live, captainOnline: false }), false);
  assert.equal(stillRelevant("offer_created", "offers", now, { ...live, rideStatus: "cancelled" }), false);
  assert.equal(stillRelevant("offer_created", "offers", now, { ...live, rideStatus: "assigned" }), false);
  assert.equal(stillRelevant("offer_expired", "offers", now, { offerStatus: "expired", offerExpiresAt: now - 1, captainOnline: false, rideStatus: "searching" }), true);
  assert.equal(stillRelevant("offer_expired", "offers", now, { offerStatus: "rejected", rideStatus: "searching" }), false);
  assert.equal(stillRelevant("offer_expired", "offers", now, { offerStatus: "withdrawn", rideStatus: "searching" }), false);
  assert.equal(stillRelevant("offer_expired", "offers", now, { offerStatus: "offered", offerExpiresAt: now + 1_000, rideStatus: "searching" }), false);
  assert.equal(stillRelevant("offer_expired", "offers", now, { offerStatus: "expired", rideStatus: "cancelled" }), false);
  assert.equal(stillRelevant("offer_expired", "offers", now, { offerStatus: "expired", rideStatus: "completed" }), false);
  assert.equal(stillRelevant("captain_assigned", "rides", now, { rideStatus: "cancelled" }), false);
});

test("queued recovery is on the offer timer and the outbox patch does not send", () => {
  const bookings = readFileSync(new URL("./server/bookings.ts", import.meta.url), "utf8");
  const rides = readFileSync(new URL("./server/cityRides.ts", import.meta.url), "utf8");
  const desk = readFileSync(new URL("../app/api/rides/[id]/route.ts", import.meta.url), "utf8");
  const cron = readFileSync(new URL("../../../../supabase/migrations/20261021100100_mobile_cron.sql", import.meta.url), "utf8");
  const proposed = readFileSync(new URL("../../../../ROVEYA_PHASE3_STAGING/unified_notice_outbox.sql", import.meta.url), "utf8");
  const functions = proposed.replace(/--[^\n]*/g, "");
  assert.match(bookings, /export async function recoverQueuedNotices/);
  assert.match(bookings, /duplicateMayClaimNow/);
  assert.match(rides, /recoverQueuedNotices\(\)/);
  assert.match(rides, /searchExpiredKey/);
  assert.match(rides, /riderCancelledKey/);
  assert.match(rides, /captainAssignedKey/);
  assert.match(desk, /deskCancelledRiderKey/);
  assert.match(desk, /deskCancelledCaptainKey/);
  assert.match(desk, /captainAssignedKey/);
  assert.match(desk, /deskAssignKey/);
  assert.match(desk, /captainChangedKey/);
  assert.match(rides, /captainReleasedKey/);
  assert.doesNotMatch(cron, /communication_events/);
  assert.match(functions, /function public\.offers_push/);
  assert.match(functions, /function public\.trips_push/);
  assert.match(functions, /function public\.enqueue_notice/);
  assert.match(functions, /on conflict \(event_key\) do nothing/);
  assert.match(functions, /captain:offer:/);
  assert.match(functions, /:no-captain/);
  assert.match(functions, /:assigned:/);
  assert.match(functions, /:captain-changed:/);
  assert.match(functions, /:desk-assign:/);
  assert.match(functions, /assignment_version/);
  assert.match(functions, /:desk-cancelled/);
  assert.match(functions, /:rider-cancelled:/);
  assert.doesNotMatch(functions, /push_send/);
  assert.doesNotMatch(functions, /net\.http_post/);
  const crashed = row({ status: "queued", updatedAt: 1_000 });
  assert.equal(nextAction(crashed, 1_000 + STALE_MS), "claim");
  assert.equal(run(crashed, 1_000 + STALE_MS, false, "ok", false, "offer_created").sends, 1);
  assert.equal(stillRelevant("offer_created", "offers", 10_000, { offerStatus: "rejected", offerExpiresAt: 11_000, captainOnline: true, rideStatus: "searching" }), false);
  assert.equal(stillRelevant("offer_created", "offers", 10_000, { offerStatus: "offered", offerExpiresAt: 11_000, captainOnline: true, rideStatus: "assigned" }), false);
  assert.equal(nextAction(row({ status: "unknown", lastError: PROVIDER_NOTE, updatedAt: 1_000 }), 1_000 + STALE_MS), "stop");
});

test("the five gap keys stay distinct, and a fresh duplicate can be claimed once", () => {
  const trip = "trip-1";
  const captain = "captain-1";
  const other = "captain-2";
  assert.equal(searchExpiredKey(trip), "city:trip-1:no-captain");
  assert.equal(captainAssignedKey(trip, captain, 1), "city:trip-1:assigned:captain-1:v1");
  assert.notEqual(captainAssignedKey(trip, captain, 1), captainAssignedKey(trip, captain, 2));
  assert.equal(captainChangedKey(trip, captain, 3), "city:trip-1:captain-changed:captain-1:v3");
  assert.equal(deskAssignKey(trip, captain, 3), "city:trip-1:desk-assign:captain-1:v3");
  assert.equal(deskReleasedKey(trip, other, 2), "city:trip-1:desk-released:captain-2:v2");
  assert.equal(riderCancelledKey(trip, captain), "city:trip-1:rider-cancelled:captain-1");
  assert.equal(deskCancelledRiderKey(trip), "city:trip-1:desk-cancelled");
  assert.equal(deskCancelledCaptainKey(trip, captain), "city:trip-1:desk-cancelled:captain-1");
  assert.equal(assignedCaptainId(captainAssignedKey(trip, captain, 4)), captain);
  assert.equal(assignmentVersionFromKey(captainAssignedKey(trip, captain, 4)), 4);
  assert.equal(assignmentVersionFromKey("city:trip-1:assigned:captain-1"), null);
  const now = 20_000;
  const fresh = row({ status: "queued", updatedAt: now - 1_000 });
  assert.equal(duplicateMayClaimNow(fresh, now), true);
  assert.equal(duplicateMayClaimNow(row({ status: "queued", lastError: CLAIM_NOTE, updatedAt: now - 1_000 }), now), false);
  assert.equal(duplicateMayClaimNow(row({ status: "queued", updatedAt: now - STALE_MS }), now), false);
  assert.equal(duplicateMayClaimNow(row({ status: "unknown", lastError: PROVIDER_NOTE, updatedAt: now }), now), false);
  const current = { rideStatus: "assigned", captainId: captain, assignmentVersion: 2 };
  assert.equal(stillRelevant("captain_assigned", "rides", now, { ...current, captainId: other }, captainAssignedKey(trip, captain, 2)), false);
  assert.equal(stillRelevant("captain_assigned", "rides", now, current, captainAssignedKey(trip, captain, 2)), true);
  assert.equal(stillRelevant("captain_assigned", "rides", now, current, captainAssignedKey(trip, captain, 1)), false);
  assert.equal(stillRelevant("captain_assigned", "rides", now, { ...current, assignmentVersion: 3 }, captainAssignedKey(trip, captain, 1)), false);
  assert.equal(stillRelevant("captain_assigned", "rides", now, { ...current, rideStatus: "cancelled" }, captainAssignedKey(trip, captain, 2)), false);
  assert.equal(stillRelevant("captain_assigned", "rides", now, { ...current, rideStatus: "completed" }, captainAssignedKey(trip, captain, 2)), false);
  assert.equal(stillRelevant("captain_assigned", "rides", now, current, "city:trip-1:assigned:captain-1"), false);
});

test("recovery skips expired offers, offline captains, and finished rides", () => {
  const now = 10_000;
  assert.equal(stillRelevant("captain_assigned", "offers", now, { rideStatus: "assigned", captainId: "captain-1", assignmentVersion: 1 }, deskAssignKey("trip-1", "captain-1", 1)), true);
  assert.equal(stillRelevant("captain_assigned", "offers", now, { rideStatus: "assigned", captainId: "captain-1", assignmentVersion: 2 }, deskAssignKey("trip-1", "captain-1", 1)), false);
  assert.equal(stillRelevant("captain_assigned", "offers", now, { rideStatus: "searching", captainId: "captain-1", assignmentVersion: 1 }, deskAssignKey("trip-1", "captain-1", 1)), false);
  assert.equal(stillRelevant("captain_assigned", "rides", now, { rideStatus: "cancelled", captainId: "captain-1", assignmentVersion: 1 }, captainAssignedKey("trip-1", "captain-1", 1)), false);
  assert.equal(stillRelevant("captain_assigned", "rides", now, { rideStatus: "completed", captainId: "captain-1", assignmentVersion: 1 }, captainAssignedKey("trip-1", "captain-1", 1)), false);
  assert.equal(stillRelevant("ride_completed", "rides", now, { rideStatus: "completed" }), true);
  assert.equal(stillRelevant("carpool_confirmed", "rides", now, { bookingStatus: "cancelled" }), false);
  assert.equal(stillRelevant("carpool_departed", "rides", now, { rideStatus: "completed" }), false);
  assert.equal(stillRelevant("carpool_departed", "rides", now, { rideStatus: "on_trip" }), true);
  assert.equal(stillRelevant("refund_completed", "rides", now, { bookingStatus: "cancelled" }), true);
  assert.equal(stillRelevant("captain_assigned", "rides", now, null), false);
});
