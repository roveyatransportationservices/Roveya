// Keep in step with users-app/src/bookingFee.ts. The captain bundle cannot import that folder.
// Passenger booking fee. The driver keeps the seat price. Roveya keeps the fee.
// GST is 18% of the fee and is paid to the government.

export type BookingFeeRules = {
  percent: number;
  floor: number;
  cap: number;
  gstPercent: number;
};

export const DEFAULT_BOOKING_FEE: BookingFeeRules = {
  percent: 10,
  floor: 79,
  cap: 149,
  gstPercent: 18,
};

let activeRules = DEFAULT_BOOKING_FEE;

export function activeBookingFee() {
  return activeRules;
}

// Settings live on the admin desk. A missed connection keeps today's standard fee.
export async function refreshBookingFee() {
  const base = (process.env.EXPO_PUBLIC_ADMIN_URL || process.env.EXPO_PUBLIC_API_URL || "http://localhost:3006").replace(/\/$/, "");
  const response = await fetch(`${base}/api/booking-fee`).catch(() => null);
  if (!response?.ok) return activeRules;
  const next = (await response.json().catch(() => null)) as Partial<BookingFeeRules> | null;
  if (!next) return activeRules;
  const num = (value: unknown, fallback: number) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
  activeRules = {
    percent: num(next.percent, DEFAULT_BOOKING_FEE.percent),
    floor: num(next.floor, DEFAULT_BOOKING_FEE.floor),
    cap: num(next.cap, DEFAULT_BOOKING_FEE.cap),
    gstPercent: num(next.gstPercent, DEFAULT_BOOKING_FEE.gstPercent),
  };
  return activeRules;
}

export type SeatBill = {
  seatPrice: number;
  fee: number;
  gst: number;
  passengerPays: number;
  driverReceives: number;
};

function halfUp(numerator: number, denominator: number) {
  return Math.trunc((numerator + Math.trunc(denominator / 2)) / denominator);
}

function rupees(paise: number) {
  return paise / 100;
}

// One seat. The fee is clamped in paise, then GST is 18 percent of that fee.
export function bookingFeeForSeat(seatPrice: number, rules: BookingFeeRules = activeRules): SeatBill {
  const pricePaise = Math.max(0, Math.round(Number(seatPrice) || 0)) * 100;
  const percent = Math.round(Number(rules.percent) || 0);
  const floor = Math.max(0, Math.round(Number(rules.floor) || 0)) * 100;
  const cap = Math.max(floor, Math.round(Number(rules.cap) || 0) * 100);
  const gstPercent = Math.round(Number(rules.gstPercent) || 0);
  const feePaise = Math.min(cap, Math.max(floor, halfUp(pricePaise * percent, 100)));
  const gstPaise = halfUp(feePaise * gstPercent, 100);
  return {
    seatPrice: rupees(pricePaise),
    fee: rupees(feePaise),
    gst: rupees(gstPaise),
    passengerPays: rupees(pricePaise + feePaise + gstPaise),
    driverReceives: rupees(pricePaise),
  };
}

export function bookingFeeForSeats(prices: number[], rules: BookingFeeRules = activeRules): SeatBill {
  return prices.map((price) => bookingFeeForSeat(price, rules)).reduce(
    (sum, line) => ({
      seatPrice: sum.seatPrice + line.seatPrice,
      fee: sum.fee + line.fee,
      gst: sum.gst + line.gst,
      passengerPays: sum.passengerPays + line.passengerPays,
      driverReceives: sum.driverReceives + line.driverReceives,
    }),
    { seatPrice: 0, fee: 0, gst: 0, passengerPays: 0, driverReceives: 0 },
  );
}
