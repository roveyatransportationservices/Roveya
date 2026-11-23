import { route, search } from "@/lib/server/api";
import { can } from "@/lib/roles";
import { requireAdmin } from "@/lib/server/auth";
import { liveCities } from "@/lib/server/live";

const PERIODS = [7, 30, 90];
const MONEY = ["valuePaise", "commissionPaise", "bonusPaise", "promoPaise", "spendPaise", "netPaise"];
const withoutMoney = <T extends Record<string, unknown>>(row: T) => Object.fromEntries(Object.entries(row).filter(([key]) => !MONEY.includes(key))) as T;

// Bike, Auto and Car per city: captains working, passengers trying to ride, and money (finance roles only).
export const GET = route(async (req) => {
  const admin = await requireAdmin("view.rides");
  const days = Number(search(req).get("days"));
  const data = await liveCities(PERIODS.includes(days) ? days : 30);
  if (can(admin.permissions, "view.finance")) return { ...data, finance: true };
  return {
    days: data.days,
    finance: false,
    totals: withoutMoney(data.totals),
    cities: data.cities.map((city) => ({ ...city, total: withoutMoney(city.total), services: Object.fromEntries(Object.entries(city.services).map(([key, value]) => [key, withoutMoney(value)])) })),
  };
});
