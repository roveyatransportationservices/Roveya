"use client";

import { SERVICE_INFO, type ServiceKey } from "@/lib/services";

export type RoleSlug = "riders" | "vado";
export type Flag = { key: string; label: string; tone: "danger" | "amber" | "sky"; detail: string };

export const PERIODS: [string, string][] = [
  ["7", "7 days"],
  ["30", "30 days"],
  ["90", "90 days"],
];

// "ROVEYA Bike Riders Payments", "Carpool Vado Payments", …
export const payTitle = (role: RoleSlug, service: ServiceKey) => `${service === "carpool" ? "Carpool" : `ROVEYA ${SERVICE_INFO[service].short}`} ${role === "riders" ? "Riders" : "Vado"} Payments`;

export const KIND: Record<string, string> = {
  topup: "Added ROVEYA Cash",
  ride_payment: "Paid for a ride",
  ride_earning: "Ride earning",
  ride_bonus: "Peak-hour bonus",
  commission: "ROVEYA commission",
  payout: "Paid out to bank",
  payout_reversal: "Payout returned",
  refund: "Refund",
  adjustment: "Changed by the team",
  seat_payment: "Paid for seats",
  seat_earning: "Seat earning",
  seat_refund: "Seat refund",
  promo: "Promo",
  ad_spend: "Ad spend",
  advertiser_topup: "Ad credit",
};

export const PURPOSE: Record<string, string> = { trip: "Ride payment", seat_booking: "Seat booking", wallet_topup: "ROVEYA Cash top-up", advertiser_topup: "Ad credit" };

const TONE: Record<Flag["tone"], string> = { danger: "bg-danger/15 text-danger", amber: "bg-amber/15 text-amber", sky: "bg-sky/15 text-sky" };

export function Flags({ flags, full }: { flags: Flag[]; full?: boolean }) {
  if (!flags.length) return <span className="text-[11px] muted">All clear</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <span key={flag.key} title={flag.detail} className={`inline-flex rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${TONE[flag.tone]}`}>
          {flag.label}
          {full ? <span className="ml-1 font-normal opacity-80">· {flag.detail}</span> : null}
        </span>
      ))}
    </span>
  );
}
