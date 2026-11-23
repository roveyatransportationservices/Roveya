// Mirrors public.seat_cancel. Money still moves only inside that function.
// Hours are the absolute gap between departure and now, the same as extract(epoch).

export type CancellationSlab = { label: string; hoursBefore: number; refund: number };

export const CANCELLATION_SLABS: CancellationSlab[] = [
  { label: "48 hours or more before departure", hoursBefore: 48, refund: 100 },
  { label: "24 hours to 48 hours before departure", hoursBefore: 24, refund: 90 },
  { label: "6 hours to 24 hours before departure", hoursBefore: 6, refund: 75 },
  { label: "2 hours to 6 hours before departure", hoursBefore: 2, refund: 50 },
  { label: "Less than 2 hours before departure", hoursBefore: Number.NEGATIVE_INFINITY, refund: 0 },
];

export function hoursUntil(departAt: Date, now = new Date()) {
  return (departAt.getTime() - now.getTime()) / 3600000;
}

export function departInstant(departAt: string, date?: string) {
  if (!departAt) return null;
  if (departAt.includes("T")) {
    const at = new Date(departAt);
    return Number.isNaN(at.getTime()) ? null : at;
  }
  if (date && /^\d{2}:\d{2}$/.test(departAt)) {
    const at = new Date(`${date}T${departAt}:00+05:30`);
    return Number.isNaN(at.getTime()) ? null : at;
  }
  return null;
}

export function passengerPercent(hours: number, secured: boolean) {
  if (secured && hours >= 6) return 100;
  if (hours >= 48) return 100;
  if (hours >= 24) return 90;
  if (hours >= 6) return 75;
  if (hours >= 2) return 50;
  return 0;
}

export function collectedPaise(parts: { walletPaise?: number; gatewayPaise?: number; deskPaise?: number }) {
  const wallet = Math.round(Number(parts.walletPaise) || 0);
  const gateway = Math.round(Number(parts.gatewayPaise) || 0);
  const desk = Math.round(Number(parts.deskPaise) || 0);
  return Math.max(0, wallet) + Math.max(0, gateway) + Math.max(0, desk);
}

// PostgreSQL round(base * percent / 100 / 100) * 100.
export function percentRefundPaise(basePaise: number, percent: number) {
  const base = Math.max(0, Math.round(basePaise));
  return Math.round((base * percent) / 100 / 100) * 100;
}

export function nonRiderRefundPaise(collected: number) {
  return Math.max(0, Math.round(collected));
}

export function formatInrPaise(paise: number) {
  const sign = paise < 0 ? "−" : "";
  const abs = Math.abs(Math.round(paise));
  const rupees = abs / 100;
  const digits = abs % 100 === 0 ? 0 : 2;
  return `${sign}₹${rupees.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

// Quote shown before a traveller confirms. paidPaise is money collected, not a client price.
export function refundFor(paidPaise: number, securePaise: number, secured: boolean, departAt: Date, now = new Date()) {
  const hours = hoursUntil(departAt, now);
  const percent = passengerPercent(hours, secured);
  const base = Math.max(0, Math.round(paidPaise) - Math.round(securePaise));
  return { hours, percent, refundPaise: percentRefundPaise(base, percent) };
}

export type PassengerQuote = {
  available: boolean;
  kind: "passenger" | "unpaid" | "stored" | "unavailable";
  percent: number;
  refundPaise: number;
  amount: number;
  securePaise: number;
  note: string;
};

const unavailable = (note: string): PassengerQuote => ({ available: false, kind: "unavailable", percent: 0, refundPaise: 0, amount: 0, securePaise: 0, note });

export function passengerQuote(input: {
  status: string;
  tripStatus: string;
  departAt: string | Date | null;
  now?: Date;
  walletCollectedPaise?: number;
  gatewayCollectedPaise?: number;
  deskCollectedPaise?: number;
  walletRefundedPaise?: number;
  gatewayRefundPaise?: number;
  securePaise?: number;
  secured?: boolean;
  storedRefundPaise?: number;
}): PassengerQuote {
  const status = input.status;
  if (status === "cancelled") {
    const refundPaise = Math.max(0, Math.round(Number(input.storedRefundPaise) || 0));
    return { available: true, kind: "stored", percent: 0, refundPaise, amount: refundPaise / 100, securePaise: 0, note: `The stored refund is ${formatInrPaise(refundPaise)}. Cancelling again does not create another refund.` };
  }
  if (status === "pending") {
    return { available: true, kind: "unpaid", percent: 0, refundPaise: 0, amount: 0, securePaise: Math.max(0, Math.round(Number(input.securePaise) || 0)), note: "This booking is not paid. Cancelling it refunds ₹0 and releases the seats." };
  }
  if (status !== "confirmed") return unavailable("A refund estimate is not available for this booking.");
  if (input.tripStatus !== "scheduled") return unavailable("This trip has already started. A passenger cancellation is not available, and this screen does not promise a refund.");
  const depart = input.departAt instanceof Date ? input.departAt : input.departAt ? departInstant(input.departAt) ?? new Date(input.departAt) : null;
  if (!depart || Number.isNaN(depart.getTime())) return unavailable("A refund estimate is not available because the departure time is missing.");
  const collected = collectedPaise({ walletPaise: input.walletCollectedPaise, gatewayPaise: input.gatewayCollectedPaise, deskPaise: input.deskCollectedPaise });
  const walletPool = Math.max(0, Math.round(Number(input.walletCollectedPaise) || 0) + Math.round(Number(input.deskCollectedPaise) || 0) - Math.round(Number(input.walletRefundedPaise) || 0));
  const gatewayPool = Math.max(0, Math.round(Number(input.gatewayCollectedPaise) || 0) - Math.round(Number(input.gatewayRefundPaise) || 0));
  const pools = walletPool + gatewayPool;
  const secure = Math.max(0, Math.round(Number(input.securePaise) || 0));
  const quote = refundFor(collected, secure, Boolean(input.secured), depart, input.now);
  let refundPaise = collected <= 0 || pools <= 0 ? 0 : Math.min(pools, quote.refundPaise);
  if (refundPaise < 0) refundPaise = 0;
  const secureNote = secure > 0 ? ` The Secure your trip fee of ${formatInrPaise(secure)} is not refunded.` : "";
  const band = refundPaise === 0 && quote.percent === 0 ? `Less than 2 hours remain, so the passenger refund is ${formatInrPaise(0)}.` : `Estimated refund ${formatInrPaise(refundPaise)} (${quote.percent}% of the refundable amount).`;
  return {
    available: true,
    kind: "passenger",
    percent: quote.percent,
    refundPaise,
    amount: refundPaise / 100,
    securePaise: secure,
    note: `${band}${secureNote} This is the estimate at this moment. The final amount is calculated when the cancellation runs, and it can change if a time band is crossed.`,
  };
}
