import { handler, limit, readBody } from "@/lib/platform/gateway";
import { requireUser } from "@/lib/platform/session";
import { myTicket, replySchema, replyToTicket } from "@/lib/platform/support";

export const GET = handler<{ id: string }>(async (request, { id }) => {
  const user = await requireUser(request);
  return myTicket(user.userId, id);
});

export const POST = handler<{ id: string }>(async (request, { id }) => {
  const user = await requireUser(request);
  limit(request, "support-reply", 30, 60 * 60 * 1000, user.userId);
  const input = await readBody(request, replySchema);
  return replyToTicket(user.userId, id, input.message);
});
