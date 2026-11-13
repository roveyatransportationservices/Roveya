import { couponUpdateSchema, updateCoupon } from "@/lib/platform/admin";
import { handler, readBody } from "@/lib/platform/gateway";
import { requireDesk } from "@/lib/platform/staff";

export const PATCH = handler<{ id: string }>(async (request, { id }) => {
  const staff = await requireDesk(request, { ceo: true });
  return updateCoupon(staff, id, await readBody(request, couponUpdateSchema));
});
