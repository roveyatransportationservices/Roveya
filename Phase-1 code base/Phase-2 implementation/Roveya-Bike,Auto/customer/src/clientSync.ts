export type SyncTripStatus = "searching" | "assigned" | "arrived" | "onTrip" | "payment" | "rating" | "done";

const order: SyncTripStatus[] = ["searching", "assigned", "arrived", "onTrip", "payment", "rating", "done"];

const statusFrom: Record<string, SyncTripStatus> = {
  searching: "searching",
  assigned: "assigned",
  arrived: "arrived",
  on_trip: "onTrip",
  completed: "payment",
};

/** Advance-only status merge. Does not cover legitimate captain reassignment back to searching. */
export function nextTripStatus(current: SyncTripStatus, serverStatus: string): SyncTripStatus | null {
  const mapped = statusFrom[serverStatus];
  if (!mapped) return null;
  if (order.indexOf(mapped) > order.indexOf(current)) return mapped;
  return null;
}

/**
 * Captain cancel / release returns assigned|arrived → searching.
 * Matches server canTransition. Must not open from on_trip, payment, or terminal client states.
 */
export function shouldReturnToSearching(current: SyncTripStatus, serverStatus: string): boolean {
  if (serverStatus !== "searching") return false;
  return current === "assigned" || current === "arrived";
}

/** Prefer the fresher GPS sample by updatedAt; equal stamps keep the current value. */
export function preferFresherLocation<T extends { updatedAt?: string | number | null }>(current: T | null, incoming: T | null): T | null {
  if (!incoming) return current;
  if (!current) return incoming;
  const a = Date.parse(String(current.updatedAt ?? ""));
  const b = Date.parse(String(incoming.updatedAt ?? ""));
  if (!Number.isFinite(b)) return current;
  if (!Number.isFinite(a)) return incoming;
  return b >= a ? incoming : current;
}

/**
 * When the assigned captain identity changes, drop the previous marker even if its
 * timestamp is newer than the replacement captain's first sample.
 */
export function locationAfterCaptainChange<T extends { updatedAt?: string | number | null }>(
  previousCaptainId: string | null | undefined,
  nextCaptainId: string | null | undefined,
  current: T | null,
  incoming: T | null,
): T | null {
  if (!nextCaptainId) return null;
  if (previousCaptainId && previousCaptainId !== nextCaptainId) return incoming;
  return preferFresherLocation(current, incoming);
}
