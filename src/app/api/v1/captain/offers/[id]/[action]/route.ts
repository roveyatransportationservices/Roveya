import { AppError } from "@/lib/errors";
import { handler } from "@/lib/platform/gateway";
import { acceptOffer, rejectOffer } from "@/lib/platform/rides";
import { requireCaptain } from "@/lib/platform/session";

export const POST = handler<{ id: string; action: string }>(async (request, { id, action }) => {
  const captain = await requireCaptain(request, { active: true });
  if (action === "accept") return acceptOffer(captain.user_id, id);
  if (action === "reject") return rejectOffer(captain.user_id, id);
  throw new AppError("Unknown action.", 404);
});
