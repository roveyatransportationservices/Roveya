// Decides whether a notification may call the provider.
// A row still queued has not called the provider. Unknown means it might have.

export const CLAIM_NOTE = "claimed";
export const PROVIDER_NOTE = "provider_started";
export const ABANDON_NOTE = "abandoned_before_provider";
export const STALE_MS = 15_000;
export const MAX_PROVIDER_CLAIMS = 3;

const SEND_EVEN_IF_CANCELLED = new Set(["ride_cancelled", "carpool_cancelled", "refund_initiated", "refund_completed"]);

export type DeliveryStatus = "queued" | "accepted" | "failed" | "unknown" | "skipped";

export type DeliveryRow = {
  status: DeliveryStatus;
  attempts: number;
  lastError: string | null;
  updatedAt: number;
};

export function claimMatches(row: DeliveryRow) {
  return row.status === "queued" && row.lastError == null;
}

export function reclaimMatches(row: DeliveryRow, now: number) {
  return row.status === "queued" && row.lastError === CLAIM_NOTE && now - row.updatedAt >= STALE_MS && row.attempts < MAX_PROVIDER_CLAIMS;
}

export function abandonMatches(row: DeliveryRow, now: number) {
  return row.status === "queued" && row.lastError === CLAIM_NOTE && now - row.updatedAt >= STALE_MS && row.attempts >= MAX_PROVIDER_CLAIMS;
}

export function beginMatches(row: DeliveryRow) {
  return row.status === "queued" && row.lastError === CLAIM_NOTE;
}

export function holdForCancellation(kind: string, rideCancelled: boolean) {
  return rideCancelled && !SEND_EVEN_IF_CANCELLED.has(kind);
}

export type DeliveryAction = "insert" | "claim" | "reclaim" | "abandon" | "begin" | "stop";

export function nextAction(row: DeliveryRow | null, now: number): DeliveryAction {
  if (!row) return "insert";
  if (row.status !== "queued") return "stop";
  if (claimMatches(row)) return now - row.updatedAt >= STALE_MS ? "claim" : "stop";
  if (reclaimMatches(row, now)) return "reclaim";
  if (abandonMatches(row, now)) return "abandon";
  return "stop";
}

export function ownerAction(row: DeliveryRow | null, now: number, ownsInsert: boolean): DeliveryAction {
  if (ownsInsert && row && claimMatches(row)) return "claim";
  return nextAction(row, now);
}

export function afterRead(row: DeliveryRow | null, now: number, readFailed: boolean): DeliveryAction {
  if (readFailed) return "stop";
  return nextAction(row, now);
}

export function mayCallProvider(providerStartCommitted: boolean) {
  return providerStartCommitted === true;
}

export type StoredPush = { userId: string; app: "rider" | "captain"; title: string; body: string };

export function pushFromStored(input: { userId?: string | null; audience?: string | null; title?: string | null; body?: string | null }): StoredPush | null {
  const userId = input.userId?.trim() ?? "";
  const title = input.title?.trim() ?? "";
  const body = input.body?.trim() ?? "";
  if (!userId || !title || !body) return null;
  if (input.audience !== "rider" && input.audience !== "captain") return null;
  return { userId, app: input.audience, title, body };
}

export type SubjectSnapshot = {
  rideStatus?: string | null;
  bookingStatus?: string | null;
  offerStatus?: string | null;
  offerExpiresAt?: number | null;
  captainOnline?: boolean | null;
  captainId?: string | null;
  assignmentVersion?: number | null;
};

export function stillRelevant(kind: string, channel: string, now: number, subject: SubjectSnapshot | null, eventKey?: string | null) {
  if (!subject) return false;
  // The expiry notice is the record that this offer ended. It stays sendable after the offer leaves "offered".
  // A new-offer notice does not. A rejected, withdrawn, accepted, cancelled, or completed ride is not an expiry.
  if (kind === "offer_expired") {
    if (subject.rideStatus === "cancelled" || subject.rideStatus === "completed") return false;
    return subject.offerStatus === "expired";
  }
  if (kind === "captain_assigned") return assignmentStillCurrent(eventKey, subject);
  if (SEND_EVEN_IF_CANCELLED.has(kind)) return true;
  if (kind === "offer_created" || channel === "offers") {
    if (subject.rideStatus && subject.rideStatus !== "searching") return false;
    return subject.offerStatus === "offered" && (subject.offerExpiresAt ?? 0) > now && subject.captainOnline !== false;
  }
  if (kind === "captain_arrived") return ["arrived", "on_trip"].includes(subject.rideStatus ?? "");
  if (kind === "ride_started") return subject.rideStatus === "on_trip";
  if (kind === "ride_completed" || kind === "receipt_ready") return subject.rideStatus === "completed" || subject.bookingStatus === "completed";
  if (kind === "carpool_confirmed") return subject.bookingStatus === "confirmed" || subject.bookingStatus === "boarded";
  if (kind === "carpool_departed") return subject.rideStatus === "on_trip";
  if (subject.rideStatus === "cancelled" || subject.rideStatus === "completed" || subject.bookingStatus === "cancelled" || subject.bookingStatus === "expired") return false;
  return false;
}

// A notice is stored under the caller's event id. A missing id is not replaced with the title.
export function stableEventId(eventId: unknown) {
  const key = typeof eventId === "string" ? eventId.trim() : "";
  if (!key || key.length > 180) return null;
  return key;
}

export function offerNoticeKey(offerId: string, notice: "created" | "expired") {
  const id = offerId.trim();
  if (!id) return null;
  return `captain:offer:${id}:${notice}`;
}

// One key for one recipient and one change. The database trigger writes the same strings.
export function searchExpiredKey(tripId: string) {
  return `city:${tripId}:no-captain`;
}

function assignmentKey(tripId: string, kind: string, captainId: string, version: number) {
  return `city:${tripId}:${kind}:${captainId}:v${version}`;
}

export function captainAssignedKey(tripId: string, captainId: string, version: number) {
  return assignmentKey(tripId, "assigned", captainId, version);
}

export function captainChangedKey(tripId: string, captainId: string, version: number) {
  return assignmentKey(tripId, "captain-changed", captainId, version);
}

export function deskAssignKey(tripId: string, captainId: string, version: number) {
  return assignmentKey(tripId, "desk-assign", captainId, version);
}

export function deskReleasedKey(tripId: string, captainId: string, version: number) {
  return assignmentKey(tripId, "desk-released", captainId, version);
}

export function captainReleasedKey(tripId: string, captainId: string, version: number) {
  return assignmentKey(tripId, "captain-released", captainId, version);
}

export function riderCancelledKey(tripId: string, captainId: string) {
  return `city:${tripId}:rider-cancelled:${captainId}`;
}

export function deskCancelledRiderKey(tripId: string) {
  return `city:${tripId}:desk-cancelled`;
}

export function deskCancelledCaptainKey(tripId: string, captainId: string) {
  return `city:${tripId}:desk-cancelled:${captainId}`;
}

export function assignedCaptainId(eventKey: string | null | undefined) {
  const match = /^city:[^:]+:(?:assigned|captain-changed|desk-assign):([^:]+):v\d+$/.exec(eventKey?.trim() ?? "");
  return match?.[1] || null;
}

export function assignmentVersionFromKey(eventKey: string | null | undefined) {
  const match = /:v(\d+)$/.exec(eventKey?.trim() ?? "");
  return match ? Number(match[1]) : null;
}

// A notice from an earlier assignment stays invalid when that captain is assigned again.
function assignmentStillCurrent(eventKey: string | null | undefined, subject: SubjectSnapshot) {
  const named = assignedCaptainId(eventKey);
  const version = assignmentVersionFromKey(eventKey);
  if (!named || version == null || !Number.isInteger(version)) return false;
  if (subject.rideStatus === "cancelled" || subject.rideStatus === "completed" || subject.rideStatus === "expired") return false;
  if (!["assigned", "arrived", "on_trip"].includes(subject.rideStatus ?? "")) return false;
  if (!subject.captainId || named !== subject.captainId) return false;
  return subject.assignmentVersion === version;
}

// The trigger inserted this row in the ride transaction. The application may claim it at once.
export function duplicateMayClaimNow(row: DeliveryRow | null, now: number) {
  return Boolean(row && claimMatches(row) && now - row.updatedAt < STALE_MS);
}
