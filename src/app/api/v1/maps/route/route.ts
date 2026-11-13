import { AppError } from "@/lib/errors";
import { handler, limit } from "@/lib/platform/gateway";
import { roadRoute } from "@/lib/platform/maps";
import { requireUser } from "@/lib/platform/session";

function point(value: string | null) {
  const [latitude, longitude] = (value ?? "").split(",").map(Number);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new AppError("Send points as latitude,longitude.", 400);
  }
  return { latitude, longitude };
}

export const GET = handler(async (request) => {
  const user = await requireUser(request);
  limit(request, "maps-route", 60, 60 * 1000, user.userId);
  const params = new URL(request.url).searchParams;
  return roadRoute(point(params.get("from")), point(params.get("to")));
});
