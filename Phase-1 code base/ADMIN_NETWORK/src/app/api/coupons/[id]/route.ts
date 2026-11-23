import { z } from "zod";
import { check, mustId, readBody, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { count } from "@/lib/server/data";
import { db } from "@/lib/server/db";
import { couponSchema, toRow } from "../shared";

const toggle = z.object({ active: z.boolean().optional(), listed: z.boolean().optional() }).strict();

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const admin = await requireAdmin("offers.manage");
  mustId(id, "Coupon");
  const raw = await req.json().catch(() => ({}));
  const quick = toggle.safeParse(raw);
  const fields = quick.success && Object.keys(quick.data).length ? quick.data : toRow(couponSchema.parse(raw));
  const coupon = check(await db().from("coupons").update(fields).eq("id", id).select("*").maybeSingle(), "Coupon not found.");
  await audit(admin, "coupon.update", "coupon", id, { code: coupon.code, fields });
  return { coupon };
});

// A code that was ever used stays for the booking history and is switched off instead.
export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  const admin = await requireAdmin("offers.manage");
  mustId(id, "Coupon");
  const used = (await count("seat_bookings", (q) => q.eq("coupon_id", id))) + (await count("coupon_redemptions", (q) => q.eq("coupon_id", id)));
  if (used > 0) {
    const coupon = check(await db().from("coupons").update({ active: false, listed: false }).eq("id", id).select("*").maybeSingle(), "Coupon not found.");
    await audit(admin, "coupon.retire", "coupon", id, { code: coupon.code });
    return { retired: true, coupon };
  }
  const removed = check(await db().from("coupons").delete().eq("id", id).select("code").maybeSingle(), "Coupon not found.");
  await audit(admin, "coupon.delete", "coupon", id, { code: removed.code });
  return { deleted: true };
});
