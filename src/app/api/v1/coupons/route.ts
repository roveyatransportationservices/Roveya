import { handler } from "@/lib/platform/gateway";
import { listCoupons } from "@/lib/platform/rides";
import { requireRider } from "@/lib/platform/session";

export const GET = handler(async (request) => listCoupons((await requireRider(request)).user_id));
