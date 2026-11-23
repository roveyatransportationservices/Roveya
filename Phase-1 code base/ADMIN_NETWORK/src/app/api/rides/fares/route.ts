import { z } from "zod";
import { ApiError, check, readBody, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

// The fare card the passenger app quotes from. Values are rupees, except the
// bonuses, which the platform stores in paise.
const CARD = {
  fare_bike_base: { service: "bike", label: "Base fare", unit: "₹", min: 0, max: 200, fallback: 12 },
  fare_bike_per_km: { service: "bike", label: "Per km", unit: "₹", min: 2, max: 50, fallback: 6 },
  fare_bike_min: { service: "bike", label: "Minimum fare", unit: "₹", min: 10, max: 300, fallback: 25 },
  fare_auto_base: { service: "auto", label: "Base fare", unit: "₹", min: 0, max: 300, fallback: 5 },
  fare_auto_per_km: { service: "auto", label: "Per km", unit: "₹", min: 2, max: 80, fallback: 10 },
  fare_auto_min: { service: "auto", label: "Minimum fare", unit: "₹", min: 10, max: 500, fallback: 30 },
  peak_bonus_paise: { service: "captain", label: "Peak-hour bonus to captain", unit: "paise", min: 0, max: 10000, fallback: 0 },
  long_pickup_bonus_paise: { service: "captain", label: "Long pickup bonus to captain", unit: "paise", min: 0, max: 10000, fallback: 0 },
  long_pickup_km: { service: "captain", label: "Long pickup starts at", unit: "km", min: 0.5, max: 10, fallback: 2.5 },
} as const;

type Key = keyof typeof CARD;
const KEYS = Object.keys(CARD) as Key[];

export const GET = route(async () => {
  await requireAdmin("view.rides");
  const { data } = await db().from("platform_settings").select("key,value,updated_at").in("key", KEYS);
  const rows = data ?? [];
  return {
    fares: KEYS.map((key) => {
      const row = rows.find((item) => item.key === key);
      const value = row ? Number(row.value) : NaN;
      return { key, ...CARD[key], value: Number.isFinite(value) ? value : CARD[key].fallback, custom: Boolean(row), updatedAt: row?.updated_at ?? null };
    }),
  };
});

const schema = z.object({ key: z.enum(KEYS as [Key, ...Key[]]), value: z.number() });

export const PATCH = route(async (req) => {
  const admin = await requireAdmin(["rides.manage", "settings.manage"]);
  const input = await readBody(req, schema);
  const rule = CARD[input.key];
  if (input.value < rule.min || input.value > rule.max) throw new ApiError(`${rule.label} must be between ${rule.min} and ${rule.max} ${rule.unit}.`, 400);
  const { data: before } = await db().from("platform_settings").select("value").eq("key", input.key).maybeSingle();
  check(await db().from("platform_settings").upsert({ key: input.key, value: String(input.value), updated_at: new Date().toISOString() }).select("key").single());
  await audit(admin, "fare.update", "platform_setting", input.key, { from: before?.value ?? null, to: input.value });
  return { ok: true };
});
