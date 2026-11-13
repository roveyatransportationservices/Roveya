import { handler, limit, readBody } from "@/lib/platform/gateway";
import { ownerFromCheckoutToken, verifyPayment, verifySchema } from "@/lib/platform/money";
import { requireUser } from "@/lib/platform/session";

export const runtime = "nodejs";

export const POST = handler(async (request) => {
  limit(request, "payment-verify", 30, 10 * 60 * 1000);
  const checkoutToken = request.headers.get("x-checkout-token");
  const ownerId = checkoutToken ? ownerFromCheckoutToken(checkoutToken) : (await requireUser(request)).userId;
  const input = await readBody(request, verifySchema);
  return verifyPayment(ownerId, input);
});
