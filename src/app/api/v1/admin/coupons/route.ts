import { couponCreateSchema, createCoupon, listDeskCoupons } from "@/lib/platform/admin";
import { handler, readBody } from "@/lib/platform/gateway";
import { requireDesk } from "@/lib/platform/staff";

export const GET = handler(async (request) => {
  await requireDesk(request);
  return listDeskCoupons();
});

export const POST = handler(async (request) => {
  const staff = await requireDesk(request, { ceo: true });
  return createCoupon(staff, await readBody(request, couponCreateSchema));
});
