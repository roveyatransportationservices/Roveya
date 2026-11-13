import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { db, dbError } from "@/lib/platform/gateway";
import { ratesFrom } from "@/lib/platform/pricing";

let cache: { at: number; values: Record<string, string> } | null = null;

export async function loadSettings() {
  if (cache && Date.now() - cache.at < 30_000) return cache.values;
  const { data } = await db().from("platform_settings").select("key,value");
  const values = Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
  cache = { at: Date.now(), values };
  return values;
}

export function settingNumber(values: Record<string, string>, key: string, fallback: number) {
  const value = Number(values[key]);
  return Number.isFinite(value) ? value : fallback;
}

export async function fareRates() {
  return ratesFrom(await loadSettings());
}

// The desk can change these; anything else in the table stays server-only.
export const EDITABLE: Record<string, { label: string; min: number; max: number; group: string; unit: string }> = {
  fare_bike_base: { label: "Bike base fare", min: 0, max: 500, group: "Bike fares", unit: "₹" },
  fare_bike_per_km: { label: "Bike per km", min: 1, max: 100, group: "Bike fares", unit: "₹" },
  fare_bike_min: { label: "Bike minimum fare", min: 10, max: 500, group: "Bike fares", unit: "₹" },
  fare_auto_base: { label: "Auto base fare", min: 0, max: 500, group: "Auto fares", unit: "₹" },
  fare_auto_per_km: { label: "Auto per km", min: 1, max: 100, group: "Auto fares", unit: "₹" },
  fare_auto_min: { label: "Auto minimum fare", min: 10, max: 500, group: "Auto fares", unit: "₹" },
  fare_cab_base: { label: "Cab base fare", min: 0, max: 1000, group: "Cab fares", unit: "₹" },
  fare_cab_per_km: { label: "Cab per km", min: 1, max: 150, group: "Cab fares", unit: "₹" },
  fare_cab_min: { label: "Cab minimum fare", min: 10, max: 1000, group: "Cab fares", unit: "₹" },
  commission_pct: { label: "ROVEYA commission", min: 0, max: 40, group: "Earnings", unit: "%" },
  peak_bonus_paise: { label: "Rush-hour bonus to captain", min: 0, max: 20000, group: "Earnings", unit: "paise" },
  long_pickup_bonus_paise: { label: "Long-pickup bonus to captain", min: 0, max: 20000, group: "Earnings", unit: "paise" },
  long_pickup_km: { label: "Long pickup starts at", min: 0.5, max: 10, group: "Earnings", unit: "km" },
  match_radius_km: { label: "Search radius for captains", min: 1, max: 25, group: "Matching", unit: "km" },
  offer_ttl_seconds: { label: "Time a captain has to accept", min: 8, max: 60, group: "Matching", unit: "seconds" },
  quote_ttl_minutes: { label: "Fare quote stays valid for", min: 2, max: 30, group: "Matching", unit: "minutes" },
  ad_reserve_cpm_paise: { label: "Lowest ad price per 1,000 views", min: 100, max: 100000, group: "Ads", unit: "paise" },
};

export async function deskSettings() {
  const values = await loadSettings();
  return {
    settings: Object.entries(EDITABLE).map(([key, meta]) => ({ key, ...meta, value: Number(values[key] ?? 0) })),
  };
}

export const settingsUpdateSchema = z.object({ values: z.record(z.string(), z.number()) });

export async function updateSettings(input: z.infer<typeof settingsUpdateSchema>) {
  const rows = Object.entries(input.values).map(([key, value]) => {
    const meta = EDITABLE[key];
    if (!meta) throw new AppError(`${key} cannot be changed from the desk.`, 400);
    if (value < meta.min || value > meta.max) throw new AppError(`${meta.label} must be between ${meta.min} and ${meta.max}.`, 400);
    return { key, value: String(value), updated_at: new Date().toISOString() };
  });
  if (!rows.length) throw new AppError("Change at least one value.", 400);
  const before = await loadSettings();
  const saved = await db().from("platform_settings").upsert(rows);
  const failure = dbError(saved.error);
  if (failure) throw failure;
  cache = null;
  return { before: Object.fromEntries(rows.map((row) => [row.key, before[row.key] ?? null])), ...(await deskSettings()) };
}
