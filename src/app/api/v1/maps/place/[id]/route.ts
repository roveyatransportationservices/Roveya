import { AppError } from "@/lib/errors";
import { handler, limit } from "@/lib/platform/gateway";
import { placeDetails } from "@/lib/platform/maps";
import { requireUser } from "@/lib/platform/session";

export const GET = handler<{ id: string }>(async (request, { id }) => {
  const user = await requireUser(request);
  limit(request, "maps-place", 120, 60 * 1000, user.userId);
  const place = await placeDetails(decodeURIComponent(id), (new URL(request.url).searchParams.get("session") ?? "").slice(0, 64));
  if (!place) throw new AppError("We could not find that place. Try another search.", 404);
  return { place };
});
