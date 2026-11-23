export type VehicleRate = { base: number; perKm: number; min: number };
export type FareCard = { bike: VehicleRate; auto: VehicleRate };

export const DEFAULT_FARE_CARD: FareCard = {
  bike: { base: 12, perKm: 6, min: 25 },
  auto: { base: 5, perKm: 10, min: 30 },
};

const rate = (value: unknown, fallback: number) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : fallback;
};

export function normalizeFareCard(input: Partial<FareCard> | null | undefined): FareCard {
  return {
    bike: {
      base: rate(input?.bike?.base, DEFAULT_FARE_CARD.bike.base),
      perKm: rate(input?.bike?.perKm, DEFAULT_FARE_CARD.bike.perKm),
      min: rate(input?.bike?.min, DEFAULT_FARE_CARD.bike.min),
    },
    auto: {
      base: rate(input?.auto?.base, DEFAULT_FARE_CARD.auto.base),
      perKm: rate(input?.auto?.perKm, DEFAULT_FARE_CARD.auto.perKm),
      min: rate(input?.auto?.min, DEFAULT_FARE_CARD.auto.min),
    },
  };
}

export function quoteAmount(vehicle: keyof FareCard, kilometers: number, card: FareCard = activeCard) {
  const item = card[vehicle];
  return Math.max(item.min, Math.round(item.base + item.perKm * kilometers));
}

let activeCard = DEFAULT_FARE_CARD;

export function activeFareCard() {
  return activeCard;
}

export async function refreshFareCard() {
  const base = (process.env.EXPO_PUBLIC_ADMIN_URL || process.env.EXPO_PUBLIC_API_URL || "http://localhost:3006").replace(/\/$/, "");
  const response = await fetch(`${base}/api/ride-fares`).catch(() => null);
  if (!response?.ok) return activeCard;
  const next = (await response.json().catch(() => null)) as Partial<FareCard> | null;
  activeCard = normalizeFareCard(next);
  return activeCard;
}
