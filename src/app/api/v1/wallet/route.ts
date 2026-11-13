import { walletView } from "@/lib/platform/captains";
import { handler } from "@/lib/platform/gateway";
import { requireUser } from "@/lib/platform/session";

export const GET = handler(async (request) => {
  const user = await requireUser(request);
  return walletView(user.userId);
});
