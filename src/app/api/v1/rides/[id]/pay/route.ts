import { z } from "zod";
import { handler, readBody } from "@/lib/platform/gateway";
import { tripPaymentIntent } from "@/lib/platform/money";
import { payWithWallet } from "@/lib/platform/rides";
import { requireRider } from "@/lib/platform/session";

const schema = z.object({ method: z.enum(["wallet", "online"]) });

export const POST = handler<{ id: string }>(async (request, { id }) => {
  const rider = await requireRider(request);
  const input = await readBody(request, schema);
  if (input.method === "wallet") return payWithWallet(rider.user_id, id);
  return { checkout: await tripPaymentIntent(rider.user_id, id) };
});
