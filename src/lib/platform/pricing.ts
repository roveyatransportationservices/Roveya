export type Vehicle = "bike" | "auto" | "cab";
export type Point = { latitude: number; longitude: number };
export type Rate = { base: number; perKm: number; min: number };
export type Rates = Record<Vehicle, Rate>;

export const VEHICLES: Vehicle[] = ["bike", "auto", "cab"];

export const DEFAULT_RATES: Rates = {
  bike: { base: 25, perKm: 7, min: 35 },
  auto: { base: 40, perKm: 13, min: 60 },
  cab: { base: 60, perKm: 16, min: 90 },
};

const MINUTES_PER_KM: Record<Vehicle, number> = { bike: 1, auto: 1.4, cab: 1.8 };
const PACE: Record<Vehicle, number> = { bike: 0.85, auto: 1.2, cab: 1 };

export const PEAK_BONUS_PAISE = 1000;
export const LONG_PICKUP_BONUS_PAISE = 1500;
export const MIN_PAYABLE_PAISE = 1000;

export function straightKm(a: Point, b: Point) {
  const rad = (value: number) => (value * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Used only when no road route is available; the client never sets the fare.
export function roadKm(a: Point, b: Point) {
  return Math.max(1, Math.round(straightKm(a, b) * 1.25 * 100) / 100);
}

export function quote(vehicle: Vehicle, km: number, rates: Rates = DEFAULT_RATES, driveMinutes?: number) {
  const rate = rates[vehicle];
  const rupees = Math.max(rate.min, Math.round(rate.base + rate.perKm * km));
  const etaMin = driveMinutes ? Math.max(3, Math.round(driveMinutes * PACE[vehicle])) : Math.max(4, Math.round(km * MINUTES_PER_KM[vehicle] + 3));
  return { farePaise: rupees * 100, etaMin };
}

export function istHour(at = new Date()) {
  return new Date(at.getTime() + 330 * 60 * 1000).getUTCHours();
}

export function isPeak(at = new Date()) {
  const hour = istHour(at);
  return (hour >= 8 && hour < 11) || (hour >= 17 && hour < 21);
}

export function peakBonusPaise(at = new Date(), amount = PEAK_BONUS_PAISE) {
  return isPeak(at) ? amount : 0;
}

export type CouponRule = {
  kind: "flat" | "percent";
  value: number;
  max_discount_paise: number | null;
  min_fare_paise: number;
  vehicles: string[];
};

// Discount in paise for one fare. A ride always costs at least ₹10 after the coupon.
export function couponDiscount(coupon: CouponRule, farePaise: number, vehicle: Vehicle) {
  if (farePaise < coupon.min_fare_paise) return 0;
  if (coupon.vehicles.length && !coupon.vehicles.includes(vehicle)) return 0;
  let off = coupon.kind === "flat" ? coupon.value : Math.round((farePaise * coupon.value) / 100);
  if (coupon.max_discount_paise) off = Math.min(off, coupon.max_discount_paise);
  off = Math.min(off, farePaise - MIN_PAYABLE_PAISE);
  return Math.max(0, Math.floor(off / 100) * 100);
}

export function ratesFrom(settings: Record<string, string>): Rates {
  const read = (key: string, fallback: number) => {
    const value = Number(settings[key]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return Object.fromEntries(
    VEHICLES.map((vehicle) => [
      vehicle,
      {
        base: read(`fare_${vehicle}_base`, DEFAULT_RATES[vehicle].base),
        perKm: read(`fare_${vehicle}_per_km`, DEFAULT_RATES[vehicle].perKm),
        min: read(`fare_${vehicle}_min`, DEFAULT_RATES[vehicle].min),
      },
    ]),
  ) as Rates;
}
