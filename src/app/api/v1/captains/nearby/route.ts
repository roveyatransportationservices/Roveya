import { AppError } from "@/lib/errors";
import { handler, limit } from "@/lib/platform/gateway";
import { nearbyCaptains } from "@/lib/platform/rides";
import { requireRider } from "@/lib/platform/session";

export const GET = handler(async (request) => {
  const rider = await requireRider(request);
  limit(request, "nearby", 30, 60 * 1000, rider.user_id);
  const url = new URL(request.url);
  const latitude = Number(url.searchParams.get("lat"));
  const longitude = Number(url.searchParams.get("lng"));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new AppError("Send lat and lng.", 400);
  }
  return { captains: await nearbyCaptains(latitude, longitude) };
});
