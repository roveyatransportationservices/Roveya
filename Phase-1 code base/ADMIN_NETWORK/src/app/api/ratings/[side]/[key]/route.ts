import { ApiError, route, search } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { ratingsFor, supportRatings, type RatingFilter } from "@/lib/server/ratings";
import { SERVICE_KEYS, type ServiceKey } from "@/lib/services";

const PERIODS = [7, 30, 90];

// /api/ratings/riders/{service} · /api/ratings/vado/{service} · /api/ratings/support/{riders|vado}
export const GET = route<{ side: string; key: string }>(async (req, { side, key }) => {
  await requireAdmin("view.support");
  const { get } = search(req);
  const days = Number(get("days"));
  const stars = Number(get("stars"));
  const filter: RatingFilter = { days: PERIODS.includes(days) ? days : null, stars: stars >= 1 && stars <= 5 ? stars : null, q: (get("q") ?? "").slice(0, 80) };
  if (side === "support") {
    if (key !== "riders" && key !== "vado") throw new ApiError("Pick Riders or Vado.", 404);
    return supportRatings(key, filter);
  }
  if (side !== "riders" && side !== "vado") throw new ApiError("Pick Riders, Vado or Support.", 404);
  if (!(SERVICE_KEYS as readonly string[]).includes(key)) throw new ApiError("Unknown service.", 404);
  return ratingsFor(side, key as ServiceKey, filter);
});
