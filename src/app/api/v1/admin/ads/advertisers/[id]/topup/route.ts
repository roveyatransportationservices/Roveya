import { z } from "zod";
import { handler, readBody } from "@/lib/platform/gateway";
import { createIntent } from "@/lib/platform/money";
import { audit, requireDesk } from "@/lib/platform/staff";

const schema = z.object({ amount: z.number().int().min(100).max(50000) });

export const POST = handler<{ id: string }>(async (request, { id }) => {
  const staff = await requireDesk(request);
  const input = await readBody(request, schema);
  const checkout = await createIntent(id, "advertiser_topup", input.amount * 100, id);
  await audit(staff, "advertiser.topup_link", "advertiser", id, null, { amount: input.amount });
  return { checkout };
});
