import { unstable_cache } from "next/cache";
import type { Offer } from "./types";

export type OfferLoad = { offers: Offer[]; ok: boolean };

function offersFrom(data: unknown): Offer[] {
  if (!data || typeof data !== "object" || !Array.isArray((data as { offers?: unknown }).offers)) {
    throw new Error("offers-shape");
  }
  return (data as { offers: unknown[] }).offers.filter((offer): offer is Offer => {
    if (!offer || typeof offer !== "object") return false;
    const row = offer as { code?: unknown; title?: unknown; line?: unknown; endsAt?: unknown };
    return typeof row.code === "string" && row.code.length > 0 && typeof row.title === "string" && typeof row.line === "string";
  });
}

async function readOffers(base: string): Promise<Offer[]> {
  const response = await fetch(`${base}/api/v1/seats/offers`, {
    cache: "no-store",
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error("offers-upstream");
  return offersFrom(await response.json());
}

// A failed or malformed upstream response is not cached. A successful list, including an empty one, is cached for 600 seconds.
export async function loadOffers(): Promise<OfferLoad> {
  const base = (process.env.ROVEYA_OFFERS_API_URL || process.env.NEXT_PUBLIC_API_URL)?.replace(/\/$/, "");
  if (!base) return { offers: [], ok: false };
  try {
    const offers = await unstable_cache(() => readOffers(base), ["public-offers", base], { revalidate: 600 })();
    return { offers, ok: true };
  } catch {
    return { offers: [], ok: false };
  }
}
