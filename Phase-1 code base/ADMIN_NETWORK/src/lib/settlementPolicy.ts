/** Classifies city ride payment for settlement and customer messaging. */

export type CityPaymentKind = "cash" | "upi" | "online" | "unknown";

export function cityPaymentKind(payment: string | null | undefined): CityPaymentKind {
  if (payment === "cash" || payment === "upi" || payment === "online") return payment;
  return "unknown";
}

/** Fare paid to the captain outside ROVEYA. Must not create ride_earning wallet credits. */
export function paidDirectlyToCaptain(payment: string | null | undefined) {
  const kind = cityPaymentKind(payment);
  return kind === "cash" || kind === "upi";
}

/** Gateway / ROVEYA-processed payment. Carpool and optional city online use this path. */
export function paidThroughPlatformGateway(payment: string | null | undefined) {
  return cityPaymentKind(payment) === "online";
}

export function paymentMethodLabel(payment: string | null | undefined) {
  const kind = cityPaymentKind(payment);
  if (kind === "cash") return "Cash paid to the captain";
  if (kind === "upi") return "UPI paid directly to the captain";
  if (kind === "online") return "Online payment through ROVEYA";
  return "Payment method on the trip record";
}

/**
 * Current settle_trip SQL (mobile_platform) treats every non-cash payment as wallet ride_earning.
 * That matches gateway `online`, but conflicts with founder-approved direct UPI.
 * Do not change the SQL without founder approval — this helper documents the intended split.
 */
export function settleTripShouldCreditCaptainWallet(payment: string | null | undefined) {
  return paidThroughPlatformGateway(payment);
}
