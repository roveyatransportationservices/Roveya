import { canTransition } from "./dispatch";

export type RideStartDecision =
  | { ok: true; alreadyStarted?: boolean }
  | { ok: false; reason: "wrong_captain" | "not_ready" | "bad_otp" | "wrong_trip" };

// Mirrors captainTripAction start: assigned captain, arrived first, matching trip OTP, idempotent when already on trip.
export function rideStartDecision(input: {
  tripCaptainId: string | null;
  actorCaptainId: string;
  status: string;
  tripId: string;
  otpTripId: string | null;
  expectedOtp: string | null;
  givenOtp: string | undefined;
}): RideStartDecision {
  if (!input.tripCaptainId || input.tripCaptainId !== input.actorCaptainId) return { ok: false, reason: "wrong_captain" };
  if (input.status === "on_trip") return { ok: true, alreadyStarted: true };
  if (!canTransition(input.status, "on_trip")) return { ok: false, reason: "not_ready" };
  if (!input.otpTripId || input.otpTripId !== input.tripId) return { ok: false, reason: "wrong_trip" };
  if (!input.expectedOtp || input.expectedOtp !== input.givenOtp) return { ok: false, reason: "bad_otp" };
  return { ok: true };
}

export function bookingVehicleAllowed(vehicle: string) {
  return vehicle === "bike" || vehicle === "auto";
}

export function bookingPaymentAllowed(payment: string) {
  // Ordinary Bike/Auto: cash or direct UPI only. Carpool keeps separate Razorpay paths.
  return payment === "cash" || payment === "upi";
}

export function bookingKeyReuse(input: { priorFingerprint: string | null; nextFingerprint: string }) {
  if (!input.priorFingerprint) return "new";
  return input.priorFingerprint === input.nextFingerprint ? "replay" : "conflict";
}
