import { ticketDetail, ticketUpdateSchema, updateTicket } from "@/lib/platform/admin";
import { handler, readBody } from "@/lib/platform/gateway";
import { requireDesk } from "@/lib/platform/staff";

export const GET = handler<{ id: string }>(async (request, { id }) => {
  await requireDesk(request);
  return ticketDetail(id);
});

export const POST = handler<{ id: string }>(async (request, { id }) => {
  const staff = await requireDesk(request);
  return updateTicket(staff, id, await readBody(request, ticketUpdateSchema));
});
