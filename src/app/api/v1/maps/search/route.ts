import { AppError } from "@/lib/errors";
import { handler, limit } from "@/lib/platform/gateway";
import { searchPlaces } from "@/lib/platform/maps";
import { requireUser } from "@/lib/platform/session";

export const GET = handler(async (request) => {
  const user = await requireUser(request);
  limit(request, "maps-search", 120, 60 * 1000, user.userId);
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim().slice(0, 80);
  const latitude = Number(params.get("lat"));
  const longitude = Number(params.get("lng"));
  if (query.length < 2) return { places: [], source: "none" };
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new AppError("Send lat and lng to search near.", 400);
  return searchPlaces(query, { latitude, longitude }, (params.get("session") ?? "").slice(0, 64));
});
