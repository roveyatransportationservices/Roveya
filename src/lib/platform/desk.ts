import "server-only";
import { db, rupees } from "@/lib/platform/gateway";

export async function overview(days: number) {
  const client = db();
  const since = new Date(Date.now() + 330 * 60 * 1000 - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const fresh = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const [metrics, open, payouts, review, offsets, latest, platform, tickets, online] = await Promise.all([
    client.from("analytics_daily").select("day,metric,dimension,value").gte("day", since).order("day"),
    client.from("trips").select("id", { count: "exact", head: true }).in("status", ["searching", "assigned", "arrived", "on_trip"]),
    client.from("payout_requests").select("id", { count: "exact", head: true }).eq("status", "requested"),
    client.from("captains").select("user_id", { count: "exact", head: true }).eq("status", "review"),
    client.from("event_offsets").select("consumer,last_id,updated_at"),
    client.from("events").select("id").order("id", { ascending: false }).limit(1).maybeSingle(),
    client.from("wallets").select("balance_paise").eq("owner_id", "00000000-0000-0000-0000-000000000001").maybeSingle(),
    client.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
    client.from("captain_presence").select("captain_id", { count: "exact", head: true }).eq("online", true).gte("updated_at", fresh),
  ]);
  const totals: Record<string, number> = {};
  for (const row of metrics.data ?? []) totals[row.metric] = (totals[row.metric] ?? 0) + Number(row.value);
  const head = latest.data?.id ?? 0;
  return {
    days,
    totals: {
      ...totals,
      gmv: rupees(totals.gmv_paise ?? 0),
      discounts: rupees(totals.discount_paise ?? 0),
      adRevenue: Math.round(totals.ad_revenue_paise ?? 0) / 100,
    },
    live: {
      openTrips: open.count ?? 0,
      pendingPayouts: payouts.count ?? 0,
      captainsInReview: review.count ?? 0,
      openTickets: tickets.count ?? 0,
      captainsOnline: online.count ?? 0,
    },
    platformBalance: rupees(Number(platform.data?.balance_paise ?? 0)),
    consumers: (offsets.data ?? []).map((row) => ({ ...row, lag: head - Number(row.last_id) })),
    series: metrics.data ?? [],
  };
}

export async function tick() {
  const client = db();
  const [sweep, billing, analytics] = await Promise.all([client.rpc("sweep_offers"), client.rpc("consume_billing", { p_limit: 1000 }), client.rpc("consume_analytics", { p_limit: 1000 })]);
  return { offered: sweep.data ?? 0, billed: billing.data ?? 0, analysed: analytics.data ?? 0 };
}
