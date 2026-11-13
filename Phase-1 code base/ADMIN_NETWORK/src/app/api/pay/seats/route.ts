import { route, search } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { seatPayments } from "@/lib/server/payments";

const PERIODS = [7, 30, 90];

// Carpool seat payments: online, ROVEYA Cash and desk cash, with payment problems first.
export const GET = route(async (req) => {
  await requireAdmin(["view.finance", "view.support"]);
  const { get } = search(req);
  const days = Number(get("days"));
  return seatPayments(PERIODS.includes(days) ? days : 30, get("problems") === "1");
});
