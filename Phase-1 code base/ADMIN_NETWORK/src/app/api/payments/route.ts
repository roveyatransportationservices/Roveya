import { check, route, search, term } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { istStart, people, shiftIst, type Row } from "@/lib/server/data";
import { db } from "@/lib/server/db";

// Razorpay payment attempts: seat bookings, wallet top-ups and taxi trips.
export const GET = route(async (req) => {
  await requireAdmin("view.finance");
  const { get, from, to, page, size } = search(req);
  let query = db().from("payment_intents").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(from, to);
  const status = get("status");
  if (status && ["created", "paid", "failed"].includes(status)) query = query.eq("status", status);
  const purpose = get("purpose");
  if (purpose && ["seat_booking", "wallet_topup", "trip", "advertiser_topup"].includes(purpose)) query = query.eq("purpose", purpose);
  const needle = term(get("q"));
  if (needle) query = query.or(`razorpay_order_id.ilike.%${needle}%,razorpay_payment_id.ilike.%${needle}%,ref_id.ilike.%${needle}%`);
  const day = get("from");
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) query = query.gte("created_at", istStart(day));
  const until = get("to");
  if (until && /^\d{4}-\d{2}-\d{2}$/.test(until)) query = query.lt("created_at", istStart(shiftIst(until, 1)));
  const result = await query;
  const rows = check(result) as Row[];
  const who = await people(rows.map((row) => row.owner_id));
  const bookingIds = rows.filter((row) => row.purpose === "seat_booking" && row.ref_id).map((row) => row.ref_id);
  const pnrs = bookingIds.length ? ((await db().from("seat_bookings").select("id,pnr").in("id", bookingIds)).data ?? []) : [];
  const pnrOf = new Map(pnrs.map((row) => [row.id, row.pnr]));

  const sinceMonth = istStart(shiftIst(new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10), -29));
  const { data: month } = await db().from("payment_intents").select("status,amount_paise").gte("created_at", sinceMonth).limit(20000);
  const summary = { paidPaise: 0, paid: 0, failed: 0, created: 0 };
  for (const row of month ?? []) {
    if (row.status === "paid") {
      summary.paid += 1;
      summary.paidPaise += Number(row.amount_paise);
    } else if (row.status === "failed") summary.failed += 1;
    else summary.created += 1;
  }

  return {
    payments: rows.map((row) => ({ ...row, owner: who.get(row.owner_id) ?? null, pnr: pnrOf.get(row.ref_id) ?? null })),
    total: result.count ?? 0,
    page,
    size,
    summary,
  };
});
