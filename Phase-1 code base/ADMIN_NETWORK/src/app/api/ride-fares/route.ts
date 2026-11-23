import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";

const CARD = {
  bike: { base: 12, perKm: 6, min: 25 },
  auto: { base: 5, perKm: 10, min: 30 },
};

const KEYS = ["fare_bike_base", "fare_bike_per_km", "fare_bike_min", "fare_auto_base", "fare_auto_per_km", "fare_auto_min"];

// Public. The rider and captain apps price every bike and auto trip from this card.
export async function GET() {
  const card = {
    bike: { ...CARD.bike },
    auto: { ...CARD.auto },
  };
  try {
    const { data } = await db().from("platform_settings").select("key,value").in("key", KEYS);
    for (const row of data ?? []) {
      const value = Number(row.value);
      if (!Number.isFinite(value)) continue;
      if (row.key === "fare_bike_base") card.bike.base = value;
      if (row.key === "fare_bike_per_km") card.bike.perKm = value;
      if (row.key === "fare_bike_min") card.bike.min = value;
      if (row.key === "fare_auto_base") card.auto.base = value;
      if (row.key === "fare_auto_per_km") card.auto.perKm = value;
      if (row.key === "fare_auto_min") card.auto.min = value;
    }
  } catch {
    // The apps keep the locked card when settings cannot be read.
  }
  return NextResponse.json(card, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
}
