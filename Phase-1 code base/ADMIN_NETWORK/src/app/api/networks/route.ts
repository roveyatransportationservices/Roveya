import { route, search } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { network } from "@/lib/server/networks";

const PERIODS = [7, 30, 90];

export const GET = route(async (req) => {
  await requireAdmin("view.trips");
  const days = Number(search(req).get("days"));
  return network(PERIODS.includes(days) ? days : 30);
});
