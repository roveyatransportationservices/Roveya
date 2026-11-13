import { AppError } from "@/lib/errors";
import { serveAds, SLOTS, type Slot } from "@/lib/platform/ads";
import { handler, limit } from "@/lib/platform/gateway";
import { requireUser } from "@/lib/platform/session";

export const GET = handler(async (request) => {
  const user = await requireUser(request);
  limit(request, "ads-serve", 60, 60 * 1000, user.userId);
  const url = new URL(request.url);
  const slot = url.searchParams.get("slot") as Slot;
  if (!SLOTS.includes(slot)) throw new AppError("Unknown ad slot.", 400);
  const count = Number(url.searchParams.get("count") ?? 3);
  return serveAds(user.userId, slot, Number.isFinite(count) ? count : 3);
});
