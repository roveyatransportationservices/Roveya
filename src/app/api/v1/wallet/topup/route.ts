import { handler, limit, readBody } from "@/lib/platform/gateway";
import { createIntent, topupSchema } from "@/lib/platform/money";
import { requireRider } from "@/lib/platform/session";

export const POST = handler(async (request) => {
  const rider = await requireRider(request);
  limit(request, "wallet-topup", 10, 10 * 60 * 1000, rider.user_id);
  const input = await readBody(request, topupSchema);
  return { checkout: await createIntent(rider.user_id, "wallet_topup", input.amount * 100, null) };
});
