import { z } from "zod";
import { ApiError, check, readBody, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

// Only settings the platform reads live, with safe ranges.
const EDITABLE = {
  booking_fee_percent: { label: "Booking fee", unit: "% of the seat", min: 0, max: 30, fallback: 10, help: "Charged to the passenger on every carpool seat. The captain keeps the seat fare." },
  booking_fee_floor: { label: "Minimum booking fee", unit: "₹", min: 0, max: 500, fallback: 79, help: "Used when 10% of a short seat would be smaller than this." },
  booking_fee_cap: { label: "Maximum booking fee", unit: "₹", min: 0, max: 1000, fallback: 149, help: "The booking fee never goes above this, even on a long route." },
  booking_fee_gst_percent: { label: "GST on the booking fee", unit: "%", min: 0, max: 28, fallback: 18, help: "Added on the booking fee and paid to the government. It is not Roveya's profit." },
  seat_hold_minutes: { label: "Seat hold while paying", unit: "minutes", min: 3, max: 30, fallback: 10, help: "How long seats stay reserved for a traveller who is paying." },
  sos_escalation_minutes: { label: "SOS escalation time", unit: "minutes", min: 1, max: 15, fallback: 5, help: "If nobody on the Support Desk acknowledges an SOS in this time, the on-call people are called." },
} as const;

type Key = keyof typeof EDITABLE;

const FIXED = [
  { label: "Who pays the booking fee", value: "The passenger", help: "The captain receives the seat price with nothing deducted." },
  { label: "Bike and auto passenger fee", value: "None", help: "The passenger pays the ride fare. Captains pay a day or month plan, changed on the Bike and auto fare card." },
  { label: "Secure your trip", value: "₹19 per seat", help: "Optional add-on chosen by the traveller." },
  { label: "ROVEYA Cash limit", value: "20% of a booking", help: "Most a traveller can pay from ROVEYA Cash." },
];

export const GET = route(async () => {
  await requireAdmin(["settings.manage", "view.finance"]);
  const { data } = await db().from("platform_settings").select("key,value,updated_at");
  const rows = data ?? [];
  return {
    settings: (Object.keys(EDITABLE) as Key[]).map((key) => {
      const row = rows.find((item) => item.key === key);
      return { key, ...EDITABLE[key], value: row ? Number(row.value) : EDITABLE[key].fallback, updatedAt: row?.updated_at ?? null };
    }),
    fixed: FIXED,
  };
});

const schema = z.object({ key: z.enum(Object.keys(EDITABLE) as [Key, ...Key[]]), value: z.number() });

export const PATCH = route(async (req) => {
  const admin = await requireAdmin("settings.manage");
  const input = await readBody(req, schema);
  const rule = EDITABLE[input.key];
  if (input.value < rule.min || input.value > rule.max) return Response.json({ error: `${rule.label} must be between ${rule.min} and ${rule.max} ${rule.unit}.` }, { status: 400 });
  if (input.key === "booking_fee_floor" || input.key === "booking_fee_cap") {
    const { data: pair } = await db().from("platform_settings").select("key,value").in("key", ["booking_fee_floor", "booking_fee_cap"]);
    const stored = Object.fromEntries((pair ?? []).map((row) => [row.key, Number(row.value)]));
    const floor = input.key === "booking_fee_floor" ? input.value : (stored.booking_fee_floor ?? EDITABLE.booking_fee_floor.fallback);
    const cap = input.key === "booking_fee_cap" ? input.value : (stored.booking_fee_cap ?? EDITABLE.booking_fee_cap.fallback);
    if (cap < floor) throw new ApiError("The maximum booking fee has to be at least the minimum.", 400);
  }
  const { data: before } = await db().from("platform_settings").select("value").eq("key", input.key).maybeSingle();
  check(await db().from("platform_settings").upsert({ key: input.key, value: String(input.value), updated_at: new Date().toISOString() }).select("key").single());
  await audit(admin, "setting.update", "platform_setting", input.key, { from: before?.value ?? null, to: input.value });
  return { ok: true };
});
