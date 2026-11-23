import { NextResponse } from "next/server";
import { DEFAULT_FEE, type FeeRules } from "@/lib/carpoolMoney";
import { db } from "@/lib/server/db";

const KEYS = {
  booking_fee_percent: "percent",
  booking_fee_floor: "floor",
  booking_fee_cap: "cap",
  booking_fee_gst_percent: "gstPercent",
} as const;

// Public. The rider and captain apps read this so a change in Settings shows up on the next booking.
export async function GET() {
  const rules: FeeRules = { ...DEFAULT_FEE };
  try {
    const { data } = await db().from("platform_settings").select("key,value").in("key", Object.keys(KEYS));
    for (const row of data ?? []) {
      const field = KEYS[row.key as keyof typeof KEYS];
      const value = Number(row.value);
      if (field && Number.isFinite(value)) rules[field] = value;
    }
  } catch {
    // The apps keep the standard 10%, ₹79 and ₹149 when settings cannot be read.
  }
  return NextResponse.json(rules, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
}
