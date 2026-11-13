import { documentSchema, documentUpload } from "@/lib/platform/captains";
import { handler, limit, readBody } from "@/lib/platform/gateway";
import { requireCaptain } from "@/lib/platform/session";

export const POST = handler(async (request) => {
  const captain = await requireCaptain(request);
  limit(request, "captain-docs", 20, 10 * 60 * 1000, captain.user_id);
  const input = await readBody(request, documentSchema);
  return documentUpload(captain.user_id, input.kind);
});
