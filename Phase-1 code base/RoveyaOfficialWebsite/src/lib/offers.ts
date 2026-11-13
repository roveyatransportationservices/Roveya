import type { Offer } from "./types";

const FALLBACK: Offer[] = [
  { code: "ROVEYAFIRST", title: "₹200 off your first seat", line: "New travellers, any route", endsAt: null },
  { code: "WOMEN15", title: "15% off for women travellers", line: "Women Zone seats, up to ₹150", endsAt: null },
  { code: "WEEKEND75", title: "₹75 off weekend trips", line: "Weekend getaways from your city", endsAt: null },
];

// Server-side: live offers from the platform, with the launch offers when it is unreachable.
export async function loadOffers(): Promise<Offer[]> {
  try {
    const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000").replace(/\/$/, "");
    const response = await fetch(`${base}/api/v1/seats/offers`, { next: { revalidate: 600 } });
    if (!response.ok) throw new Error();
    const data = (await response.json()) as { offers: Offer[] };
    if (data.offers.length) return data.offers;
  } catch {
    // Falls through to the launch offers.
  }
  return FALLBACK;
}
