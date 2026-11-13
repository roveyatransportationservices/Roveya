import { handler } from "@/lib/platform/gateway";
import { intentStatus } from "@/lib/platform/money";
import { requireUser } from "@/lib/platform/session";

export const GET = handler<{ id: string }>(async (request, { id }) => {
  const user = await requireUser(request);
  return intentStatus(user.userId, id);
});
