import { z } from "zod";
import { check, readBody, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

// Only settings the platform reads live, with safe ranges.
const EDITABLE = {
  seat_commission_pct: { label: "Seat commission", unit: "%", min: 0, max: 40, help: "ROVEYA's share of each seat fare. Captains get the rest when a trip completes." },
  seat_hold_minutes: { label: "Seat hold while paying", unit: "minutes", min: 3, max: 30, help: "How long seats stay reserved for a traveller who is paying." },
  commission_pct: { label: "Bike and auto commission", unit: "%", min: 0, max: 40, help: "ROVEYA's share of ROVEYA Bike and ROVEYA Auto ride fares." },
  sos_escalation_minutes: { label: "SOS escalation time", unit: "minutes", min: 1, max: 15, help: "If nobody on the Support Desk acknowledges an SOS in this time, the on-call people are called." },
} as const;

type Key = keyof typeof EDITABLE;

const FIXED = [
  { label: "GST on seat fare", value: "5%", help: "Collected on every booking and payable to the government." },
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
      return { key, ...EDITABLE[key], value: row ? Number(row.value) : null, updatedAt: row?.updated_at ?? null };
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
  const { data: before } = await db().from("platform_settings").select("value").eq("key", input.key).maybeSingle();
  check(await db().from("platform_settings").upsert({ key: input.key, value: String(input.value), updated_at: new Date().toISOString() }).select("key").single());
  await audit(admin, "setting.update", "platform_setting", input.key, { from: before?.value ?? null, to: input.value });
  return { ok: true };
});
