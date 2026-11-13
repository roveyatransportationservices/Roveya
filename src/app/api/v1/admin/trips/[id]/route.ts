import { tripAction, tripActionSchema, tripDetail } from "@/lib/platform/admin";
import { handler, readBody } from "@/lib/platform/gateway";
import { requireDesk } from "@/lib/platform/staff";

export const GET = handler<{ id: string }>(async (request, { id }) => {
  await requireDesk(request);
  return tripDetail(id);
});

export const POST = handler<{ id: string }>(async (request, { id }) => {
  const input = await readBody(request, tripActionSchema);
  const staff = await requireDesk(request, { ceo: input.action === "refund" });
  return tripAction(staff, id, input);
});
