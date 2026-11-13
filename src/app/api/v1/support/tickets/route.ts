import { handler, limit, readBody } from "@/lib/platform/gateway";
import { requireUser } from "@/lib/platform/session";
import { myTickets, openTicket, ticketSchema } from "@/lib/platform/support";

export const GET = handler(async (request) => {
  const user = await requireUser(request);
  const app = new URL(request.url).searchParams.get("app") === "captain" ? "captain" : "rider";
  return myTickets(user.userId, app);
});

export const POST = handler(async (request) => {
  const user = await requireUser(request);
  limit(request, "support-open", 10, 60 * 60 * 1000, user.userId);
  return openTicket(user.userId, await readBody(request, ticketSchema));
});
