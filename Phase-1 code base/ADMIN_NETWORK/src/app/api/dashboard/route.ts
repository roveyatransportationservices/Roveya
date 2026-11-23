import { check, route, search } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { count, istDay, istStart, people, PLATFORM_WALLET, shiftIst, type Row } from "@/lib/server/data";
import { controls, db } from "@/lib/server/db";
import { serviceSummaries } from "@/lib/server/services";

const SUM_KEYS = ["bookings", "seats", "cancellations", "collected_paise", "fare_paise", "gst_paise", "secure_paise", "discount_paise", "refund_paise", "commission_paise", "captain_share_paise", "kept_on_cancel_paise", "profit_paise"] as const;

export const GET = route(async (req) => {
  await requireAdmin("view.dashboard");
  const { get } = search(req);
  const days = [7, 30, 90].includes(Number(get("days"))) ? Number(get("days")) : 7;
  const today = istDay();
  const first = shiftIst(today, -(days - 1));
  const since = istStart(first);

  const [services, daily, previous, fills, facts, recent, upcoming, wallets, todayFacts, counts] = await Promise.all([
    serviceSummaries(first, today),
    controls().from("daily_finance").select("*").gte("day", first).order("day"),
    controls().from("daily_finance").select("*").gte("day", shiftIst(first, -days)).lt("day", first),
    controls().from("trip_finance").select("id,seats_total,seats_booked,captain_id,captain_name,captain_code,fare_paise,profit_paise,bookings,status").gte("depart_at", since),
    controls().from("seat_booking_facts").select("paid_with,status,seats").gte("confirmed_at", since),
    controls().from("seat_booking_facts").select("id,pnr,status,trip_code,from_city,to_city,seats,paid_paise,rider_id,created_at").order("created_at", { ascending: false }).limit(6),
    controls().from("trip_finance").select("id,code,from_city,to_city,depart_at,status,captain_name,make_model,seats_total,seats_booked,fare_paise").eq("status", "scheduled").gte("depart_at", new Date().toISOString()).order("depart_at").limit(6),
    db().from("wallets").select("owner_kind,balance_paise").limit(20000),
    controls().from("seat_booking_facts").select("created_at").gte("created_at", istStart(today)).limit(5000),
    Promise.all([
      count("captains", (q) => q.eq("service", "seats").eq("status", "active")),
      count("captains", (q) => q.eq("service", "seats").eq("status", "review")),
      count("seat_cars", (q) => q.eq("status", "review")),
      count("riders"),
      count("seat_trips", (q) => q.eq("status", "scheduled").gte("depart_at", new Date().toISOString())),
      count("seat_trips", (q) => q.eq("status", "on_trip")),
      count("safety_incidents", (q) => q.in("status", ["open", "acknowledged"])),
      count("support_tickets", (q) => q.in("status", ["open", "pending"])),
      db().from("payout_requests").select("amount_paise").eq("status", "requested").limit(5000),
    ]),
  ]);

  if (daily.error) check(daily);
  const rows = (daily.data ?? []) as Row[];
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const series = Array.from({ length: days }, (_, at) => {
    const day = shiftIst(first, at);
    const row = byDay.get(day) ?? {};
    return { day, ...Object.fromEntries(SUM_KEYS.map((key) => [key, Number(row[key] ?? 0)])) } as { day: string } & Record<(typeof SUM_KEYS)[number], number>;
  });
  const total = (list: Row[]) => Object.fromEntries(SUM_KEYS.map((key) => [key, list.reduce((sum, row) => sum + Number(row[key] ?? 0), 0)])) as Record<(typeof SUM_KEYS)[number], number>;

  const tripRows = (fills.data ?? []) as Row[];
  const seatsTotal = tripRows.reduce((sum, row) => sum + Number(row.seats_total), 0);
  const seatsBooked = tripRows.reduce((sum, row) => sum + Number(row.seats_booked), 0);

  const captainMap = new Map<string, { id: string; name: string; code: string; trips: number; fare: number; profit: number }>();
  for (const row of tripRows) {
    const item = captainMap.get(row.captain_id) ?? { id: row.captain_id, name: row.captain_name, code: row.captain_code, trips: 0, fare: 0, profit: 0 };
    item.trips += 1;
    item.fare += Number(row.fare_paise);
    item.profit += Number(row.profit_paise);
    captainMap.set(row.captain_id, item);
  }

  const payMix = new Map<string, number>();
  for (const row of (facts.data ?? []) as Row[]) {
    if (!["confirmed", "completed", "cancelled"].includes(row.status)) continue;
    const key = /cash/i.test(row.paid_with ?? "") ? "ROVEYA Cash" : row.paid_with ? "Online" : "Other";
    payMix.set(key, (payMix.get(key) ?? 0) + 1);
  }

  const hours = Array.from({ length: 24 }, () => 0);
  for (const row of (todayFacts.data ?? []) as Row[]) hours[new Date(new Date(row.created_at).getTime() + 330 * 60000).getUTCHours()] += 1;

  const liabilities = { rider: 0, captain: 0, platform: 0 };
  for (const row of (wallets.data ?? []) as Row[]) {
    if (row.owner_kind === "rider") liabilities.rider += Number(row.balance_paise);
    if (row.owner_kind === "captain") liabilities.captain += Number(row.balance_paise);
    if (row.owner_kind === "platform") liabilities.platform += Number(row.balance_paise);
  }

  const who = await people((recent.data ?? []).map((row: Row) => row.rider_id));
  const [captainsActive, captainsReview, carsReview, travellers, tripsUpcoming, tripsLive, openSos, openTickets, payouts] = counts;

  return {
    days,
    today,
    services,
    totals: total(series),
    previous: total((previous.data ?? []) as Row[]),
    todayTotals: series[series.length - 1],
    series,
    hours,
    fill: { seatsTotal, seatsBooked, rate: seatsTotal ? seatsBooked / seatsTotal : 0, trips: tripRows.length },
    counts: { captainsActive, captainsReview, carsReview, travellers, tripsUpcoming, tripsLive, openSos, openTickets, payoutsPending: payouts.data?.length ?? 0, payoutsPendingPaise: (payouts.data ?? []).reduce((sum: number, row: Row) => sum + Number(row.amount_paise), 0) },
    topCaptains: [...captainMap.values()].sort((a, b) => b.fare - a.fare).slice(0, 8),
    payMix: Object.fromEntries(payMix),
    wallets: { ...liabilities, platformWallet: PLATFORM_WALLET },
    recent: (recent.data ?? []).map((row: Row) => ({ ...row, rider: who.get(row.rider_id) ?? null })),
    upcoming: upcoming.data ?? [],
  };
});
