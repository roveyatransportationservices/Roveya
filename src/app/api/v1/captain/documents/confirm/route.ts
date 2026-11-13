import { confirmDocument, documentConfirmSchema } from "@/lib/platform/captains";
import { handler, limit, readBody } from "@/lib/platform/gateway";
import { requireCaptain } from "@/lib/platform/session";

export const POST = handler(async (request) => {
  const captain = await requireCaptain(request);
  limit(request, "captain-docs-confirm", 30, 10 * 60 * 1000, captain.user_id);
  return confirmDocument(captain.user_id, await readBody(request, documentConfirmSchema));
});
