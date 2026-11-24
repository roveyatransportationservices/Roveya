export type SyncTripStatus = "searching" | "assigned" | "arrived" | "onTrip" | "payment" | "rating" | "done";

const order: SyncTripStatus[] = ["searching", "assigned", "arrived", "onTrip", "payment", "rating", "done"];

const statusFrom: Record<string, SyncTripStatus> = {
  searching: "searching",
  assigned: "assigned",
  arrived: "arrived",
  on_trip: "onTrip",
  completed: "payment",
};

/** Advance-only status merge used by TripScreen polling. Never regresses to an earlier phase. */
export function nextTripStatus(current: SyncTripStatus, serverStatus: string): SyncTripStatus | null {
  const mapped = statusFrom[serverStatus];
  if (!mapped) return null;
  if (order.indexOf(mapped) > order.indexOf(current)) return mapped;
  return null;
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
