// Carpool money. The captain keeps the seat fare. Roveya keeps the booking fee.
// GST is calculated on the fee only. It is not Roveya revenue and it is not a Razorpay fee.

export type FeeRules = { percent: number; floor: number; cap: number; gstPercent: number };

export const DEFAULT_FEE: FeeRules = { percent: 10, floor: 79, cap: 149, gstPercent: 18 };

export type SeatSplit = {
  seatPaise: number;
  feePaise: number;
  gstPaise: number;
  passengerPaise: number;
  captainPaise: number;
  rovayaPaise: number;
};

// Half-up on positive integers. 7900 * 18 / 100 is 1422 paise, which is ₹14.22.
function halfUp(numerator: number, denominator: number) {
  return Math.trunc((numerator + Math.trunc(denominator / 2)) / denominator);
}

export function seatSplit(seatRupees: number, rules: FeeRules = DEFAULT_FEE): SeatSplit {
  const seatPaise = Math.max(0, Math.round(Number(seatRupees) || 0)) * 100;
  const percent = Math.round(Number(rules.percent) || 0);
  const floor = Math.max(0, Math.round(Number(rules.floor) || 0)) * 100;
  const cap = Math.max(floor, Math.round(Number(rules.cap) || 0) * 100);
  const gstPercent = Math.round(Number(rules.gstPercent) || 0);
  const raw = halfUp(seatPaise * percent, 100);
  const feePaise = Math.min(cap, Math.max(floor, raw));
  const gstPaise = halfUp(feePaise * gstPercent, 100);
  return {
    seatPaise,
    feePaise,
    gstPaise,
    passengerPaise: seatPaise + feePaise + gstPaise,
    captainPaise: seatPaise,
    rovayaPaise: feePaise,
  };
}

export function bookingFeeForSeat(seatPrice: number, rules: FeeRules = DEFAULT_FEE) {
  const split = seatSplit(seatPrice, rules);
  return {
    seatPrice: split.seatPaise / 100,
    fee: split.feePaise / 100,
    gst: split.gstPaise / 100,
    passengerPays: split.passengerPaise / 100,
    driverReceives: split.captainPaise / 100,
  };
}

// A refund cannot be more than the captured payment. The rest is the cancellation charge.
export function cancellationSplit(paidPaise: number, refundPaise: number) {
  const paid = Math.max(0, Math.round(paidPaise));
  const refund = Math.min(paid, Math.max(0, Math.round(refundPaise)));
  return { paidPaise: paid, refundPaise: refund, cancellationPaise: paid - refund };
}
