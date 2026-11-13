import { check, readBody, route, search } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { type Row } from "@/lib/server/data";
import { db } from "@/lib/server/db";
import { couponSchema, toRow } from "./shared";

export const GET = route(async (req) => {
  await requireAdmin("view.offers");
  const { get } = search(req);
  let query = db().from("coupons").select("*").order("created_at", { ascending: false }).limit(300);
  const state = get("state");
  if (state === "active") query = query.eq("active", true);
  if (state === "inactive") query = query.eq("active", false);
  const coupons = check(await query) as Row[];
  const ids = coupons.map((row) => row.id);
  const { data: uses } = ids.length ? await db().from("seat_bookings").select("coupon_id,discount_paise,status").in("coupon_id", ids).in("status", ["confirmed", "completed"]).limit(20000) : { data: [] };
  const usage = new Map<string, { seatUses: number; discountPaise: number }>();
  for (const row of (uses ?? []) as Row[]) {
    const item = usage.get(row.coupon_id) ?? { seatUses: 0, discountPaise: 0 };
    item.seatUses += 1;
    item.discountPaise += Number(row.discount_paise);
    usage.set(row.coupon_id, item);
  }
  return { coupons: coupons.map((row) => ({ ...row, ...(usage.get(row.id) ?? { seatUses: 0, discountPaise: 0 }) })) };
});

export const POST = route(async (req) => {
  const admin = await requireAdmin("offers.manage");
  const input = await readBody(req, couponSchema);
  const coupon = check(await db().from("coupons").insert(toRow(input)).select("*").single());
  await audit(admin, "coupon.create", "coupon", coupon.id, { code: coupon.code });
  return { coupon };
});
