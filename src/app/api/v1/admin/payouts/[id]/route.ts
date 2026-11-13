import { handler, readBody } from "@/lib/platform/gateway";
import { decidePayout, payoutDecisionSchema } from "@/lib/platform/money";
import { audit, requireDesk } from "@/lib/platform/staff";

export const POST = handler<{ id: string }>(async (request, { id }) => {
  const staff = await requireDesk(request, { ceo: true });
  const input = await readBody(request, payoutDecisionSchema);
  const result = await decidePayout(id, staff.authUserId, input);
  await audit(staff, `payout.${input.action}`, "payout", id, null, { reference: input.reference ?? null });
  return result;
});
