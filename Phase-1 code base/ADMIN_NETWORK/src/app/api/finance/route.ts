import { ApiError, check, route, search } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { istDay, istStart, shiftIst, type Row } from "@/lib/server/data";
import { controls, db } from "@/lib/server/db";
import { serviceSummaries } from "@/lib/server/services";

const KEYS = ["bookings", "seats", "cancellations", "collected_paise", "fare_paise", "gst_paise", "secure_paise", "discount_paise", "refund_paise", "commission_paise", "captain_share_paise", "kept_on_cancel_paise", "profit_paise"] as const;
const isDay = (value?: string) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

// Fares, commission and profit for any date range (IST days, inclusive).
export const GET = route(async (req) => {
  await requireAdmin("view.finance");
  const { get } = search(req);
  const to = isDay(get("to")) ? get("to")! : istDay();
  const from = isDay(get("from")) ? get("from")! : shiftIst(to, -29);
  if (from > to) throw new ApiError("The start date must be before the end date.", 400);

  const [services, daily, routes, trips, coupons, settings, captainLedger] = await Promise.all([
    serviceSummaries(from, to),
    controls().from("daily_finance").select("*").gte("day", from).lte("day", to).order("day"),
    controls().from("route_finance").select("*").order("fare_paise", { ascending: false }).limit(50),
    controls()
      .from("trip_finance")
      .select("id,code,status,from_city,to_city,depart_at,captain_name,captain_code,make_model,car_class,seats_total,seats_booked,bookings,fare_paise,collected_paise,commission_paise,captain_share_paise,captain_paid_paise,profit_paise")
      .gte("depart_at", istStart(from))
      .lt("depart_at", istStart(shiftIst(to, 1)))
      .order("profit_paise", { ascending: false })
      .limit(100),
    controls().from("seat_booking_facts").select("coupon_id,discount_paise,status").not("coupon_id", "is", null).gte("confirmed_at", istStart(from)).lt("confirmed_at", istStart(shiftIst(to, 1))),
    db().from("platform_settings").select("key,value").in("key", ["seat_commission_pct", "seat_hold_minutes"]),
    db().from("ledger_entries").select("kind,amount_paise").in("kind", ["seat_earning", "payout", "payout_reversal"]).neq("owner_id", "00000000-0000-0000-0000-000000000001").gte("created_at", istStart(from)).lt("created_at", istStart(shiftIst(to, 1))).limit(20000),
  ]);

  if (daily.error) check(daily);
  const rows = (daily.data ?? []) as Row[];
  const totals = Object.fromEntries(KEYS.map((key) => [key, rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0)])) as Record<(typeof KEYS)[number], number>;

  const couponRows = (coupons.data ?? []) as Row[];
  const usage = new Map<string, { uses: number; discount: number }>();
  for (const row of couponRows) {
    if (!["confirmed", "completed", "cancelled"].includes(row.status)) continue;
    const item = usage.get(row.coupon_id) ?? { uses: 0, discount: 0 };
    item.uses += 1;
    item.discount += Number(row.discount_paise);
    usage.set(row.coupon_id, item);
  }
  const codes = usage.size ? ((await db().from("coupons").select("id,code,title").in("id", [...usage.keys()])).data ?? []) : [];

  const ledger = { earned: 0, paidOut: 0 };
  for (const row of (captainLedger.data ?? []) as Row[]) {
    if (row.kind === "seat_earning") ledger.earned += Number(row.amount_paise);
    if (row.kind === "payout") ledger.paidOut += -Number(row.amount_paise);
    if (row.kind === "payout_reversal") ledger.paidOut -= Number(row.amount_paise);
  }

  const setting = (key: string) => Number((settings.data ?? []).find((row) => row.key === key)?.value ?? 0);
  return {
    from,
    to,
    commissionPct: setting("seat_commission_pct") || 10,
    services,
    totals,
    margin: totals.collected_paise ? totals.profit_paise / totals.collected_paise : 0,
    series: rows.map((row) => ({ day: row.day, ...Object.fromEntries(KEYS.map((key) => [key, Number(row[key] ?? 0)])) })),
    routes: routes.data ?? [],
    trips: trips.data ?? [],
    coupons: codes.map((code) => ({ ...code, ...usage.get(code.id)! })).sort((a, b) => b.discount - a.discount),
    captainLedger: ledger,
  };
});
