export type PushStatus = "accepted" | "skipped" | "failed" | "unknown" | "queued";

const secretField = /otp|token|secret|bearer|password|authorization/i;

export function publicEvent(row: Record<string, unknown>) {
  const copy = { ...row };
  for (const key of Object.keys(copy)) {
    if (secretField.test(key)) delete copy[key];
  }
  return copy;
}

// One provider attempt. A timeout is unknown and is not sent again.
export function pushAttempt(outcome: "ok" | "error" | "timeout", devices = 0): { status: PushStatus; retry: false } {
  if (outcome === "timeout") return { status: "unknown", retry: false };
  if (outcome === "error") return { status: "failed", retry: false };
  if (devices <= 0) return { status: "skipped", retry: false };
  return { status: "accepted", retry: false };
}

export type NoticeKind =
  | "captain_assigned"
  | "captain_arrived"
  | "ride_started"
  | "ride_completed"
  | "ride_cancelled"
  | "carpool_confirmed"
  | "carpool_cancelled"
  | "carpool_departed"
  | "refund_initiated"
  | "refund_completed"
  | "receipt_ready";

export function noticeCopy(kind: NoticeKind, ref: string) {
  const text: Record<NoticeKind, { title: string; body: string }> = {
    captain_assigned: { title: "Captain assigned", body: `${ref} has a captain.` },
    captain_arrived: { title: "Captain arrived", body: `${ref} is at the pickup.` },
    ride_started: { title: "Ride started", body: `${ref} is on the way.` },
    ride_completed: { title: "Ride completed", body: `${ref} is complete. The receipt is in the trip.` },
    ride_cancelled: { title: "Ride cancelled", body: `${ref} was cancelled.` },
    carpool_confirmed: { title: "Seats confirmed", body: `${ref} is confirmed.` },
    carpool_cancelled: { title: "Booking cancelled", body: `${ref} was cancelled.` },
    carpool_departed: { title: "Car has left", body: `${ref} has left.` },
    refund_initiated: { title: "Refund started", body: `${ref} has a refund in progress. It is not complete yet.` },
    refund_completed: { title: "Refund completed", body: `${ref} refund is complete.` },
    receipt_ready: { title: "Receipt ready", body: `A receipt draft is stored for ${ref}. It is not a tax invoice.` },
  };
  return text[kind];
}
