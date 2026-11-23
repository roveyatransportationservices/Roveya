import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, check, readBody, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { DEFAULT_RIDE_PLAN, normalizeRidePlan, type RidePlan } from "@/lib/ridePlan";

const KEYS = {
  ride_plan_mode: "mode",
  ride_bike_day: "bikeDay",
  ride_bike_month: "bikeMonth",
  ride_auto_day: "autoDay",
  ride_auto_month: "autoMonth",
  ride_commission_pct: "commissionPct",
  ride_bike_passenger_fee: "bikePassengerFee",
  ride_auto_passenger_fee: "autoPassengerFee",
} as const;

function fromRows(rows: { key: string; value: string }[]): RidePlan {
  const raw: Partial<RidePlan> = {};
  for (const row of rows) {
    const field = KEYS[row.key as keyof typeof KEYS];
    if (!field) continue;
    if (field === "mode") raw.mode = row.value === "commission" ? "commission" : "subscription";
    else raw[field] = Number(row.value);
  }
  return normalizeRidePlan({ ...DEFAULT_RIDE_PLAN, ...raw });
}

export async function GET() {
  let plan = DEFAULT_RIDE_PLAN;
  try {
    const { data } = await db().from("platform_settings").select("key,value").in("key", Object.keys(KEYS));
    plan = fromRows(data ?? []);
  } catch {
    plan = DEFAULT_RIDE_PLAN;
  }
  return NextResponse.json(plan, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
}

const schema = z.object({
  mode: z.enum(["subscription", "commission"]),
  bikeDay: z.number(),
  bikeMonth: z.number(),
  autoDay: z.number(),
  autoMonth: z.number(),
  commissionPct: z.number(),
  bikePassengerFee: z.number(),
  autoPassengerFee: z.number(),
});

const LIMITS: Record<Exclude<keyof RidePlan, "mode">, [number, number]> = {
  bikeDay: [0, 200],
  bikeMonth: [0, 5000],
  autoDay: [0, 200],
  autoMonth: [0, 5000],
  commissionPct: [0, 40],
  bikePassengerFee: [0, 50],
  autoPassengerFee: [0, 50],
};

export const PATCH = route(async (req) => {
  const admin = await requireAdmin(["rides.manage", "settings.manage"]);
  const input = await readBody(req, schema);
  for (const [key, [min, max]] of Object.entries(LIMITS) as [Exclude<keyof RidePlan, "mode">, [number, number]][]) {
    if (input[key] < min || input[key] > max) throw new ApiError(`${key} must be between ${min} and ${max}.`, 400);
  }
  const plan = normalizeRidePlan(input);
  const stored: Record<keyof typeof KEYS, string> = {
    ride_plan_mode: plan.mode,
    ride_bike_day: String(plan.bikeDay),
    ride_bike_month: String(plan.bikeMonth),
    ride_auto_day: String(plan.autoDay),
    ride_auto_month: String(plan.autoMonth),
    ride_commission_pct: String(plan.commissionPct),
    ride_bike_passenger_fee: String(plan.bikePassengerFee),
    ride_auto_passenger_fee: String(plan.autoPassengerFee),
  };
  for (const [key, value] of Object.entries(stored)) {
    check(await db().from("platform_settings").upsert({ key, value, updated_at: new Date().toISOString() }).select("key").single());
  }
  await audit(admin, "ride_plan.update", "platform_setting", "ride_plan", plan);
  return plan;
});
