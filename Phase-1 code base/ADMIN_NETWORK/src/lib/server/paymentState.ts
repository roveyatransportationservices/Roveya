import { createHmac, timingSafeEqual } from "node:crypto";

// Maps a stored payment row to the only result the API is allowed to show.
// A seat payment is successful only when the intent is paid and the booking is confirmed.

export type GatewayPurpose = "seat_booking" | "ride_fare" | "trip" | string;

export function confirmationOutcome(input: { purpose: GatewayPurpose; intentStatus: string; bookingStatus?: string | null }) {
  if (input.intentStatus === "paid") {
    if (input.purpose === "seat_booking") {
      const booked = input.bookingStatus === "confirmed" || input.bookingStatus === "completed";
      return booked
        ? { http: 200, status: "paid" as const, booked: true }
        : { http: 409, status: "reconcile" as const, booked: false };
    }
    if (!input.purpose) return { http: 409, status: "reconcile" as const, booked: false };
    return { http: 200, status: "paid" as const, booked: true };
  }
  if (input.intentStatus === "failed") return { http: 400, status: "failed" as const, booked: false };
  if (input.intentStatus === "refunded") return { http: 409, status: "refunded" as const, booked: false };
  if (input.intentStatus === "refund_pending") return { http: 409, status: "refund_pending" as const, booked: false };
  if (input.intentStatus === "not_owner" || input.intentStatus === "missing" || input.intentStatus === "not_found") {
    return { http: 404, status: "missing" as const, booked: false };
  }
  if (input.intentStatus === "mismatch") return { http: 400, status: "mismatch" as const, booked: false };
  return { http: 409, status: "reconcile" as const, booked: false };
}

export function confirmationMessage(status: string) {
  if (status === "paid") return "Payment received.";
  if (status === "failed") return "The payment did not go through.";
  if (status === "mismatch") return "The payment could not be verified.";
  if (status === "missing") return "That payment was not found.";
  if (status === "refund_pending") return "The payment is being returned. The ticket is not confirmed.";
  if (status === "refunded") return "The payment was returned. The ticket is not confirmed.";
  return "The payment was received, but the ticket is not confirmed. It is waiting to be checked. Do not pay again.";
}

// A dropped connection is unknown. It is not a failed payment and it is not a confirmed ticket.
export function transportFailure() {
  return { http: 503 as const, status: "unknown" as const, booked: false };
}

// 5xx and network failures may have created an order. 4xx did not.
export function orderFailureKind(status: number | "network") {
  if (status === "network" || status >= 500) return "uncertain" as const;
  return "rejected" as const;
}

export function webhookSignatureMatches(raw: string, signature: string, secret: string) {
  if (!secret || !signature || !raw) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function webhookAdmission(input: { secret: string; raw: string; signature: string; eventId: string }) {
  if (!input.secret.trim()) return { http: 503 as const, body: { error: "Webhook secret is not set." } };
  if (!webhookSignatureMatches(input.raw, input.signature, input.secret.trim())) {
    return { http: 400 as const, body: { error: "Signature did not match." } };
  }
  if (!input.eventId.trim()) return { http: 400 as const, body: { error: "Event id is missing." } };
  return { http: 200 as const, body: { ok: true } };
}
