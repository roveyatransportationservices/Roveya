import { SERVICE_INFO, SERVICE_KEYS, serviceOfCaptain, type ServiceKey } from "@/lib/services";
import { count, istStart, PLATFORM_WALLET, shiftIst, type Row } from "./data";
import { controls, db } from "./db";
import { OPEN } from "./rides";

const FRESH_MS = 2 * 60 * 1000;

// Narrows a captains query to one service.
export function onlyService(query: Row, key: ServiceKey): Row {
  if (key === "carpool") return query.eq("service", "seats");
  return query.eq("service", "taxi").eq("vehicle", SERVICE_INFO[key].vehicle);
}

// Everyone who has booked this service at least once.
export async function customerIds(key: ServiceKey): Promise<string[]> {
  const { data } =
    key === "carpool"
      ? await db().from("seat_bookings").select("rider_id").in("status", ["confirmed", "completed", "cancelled"]).limit(50000)
      : await db().from("trips").select("rider_id").eq("vehicle", SERVICE_INFO[key].vehicle).limit(50000);
  return [...new Set(((data ?? []) as Row[]).map((row) => row.rider_id as string))];
}

// Captains who need the desk: in review, a document waiting, or (carpool) a car waiting.
export async function waitingCaptains() {
  const [review, docs, cars] = await Promise.all([
    db().from("captains").select("user_id,service,vehicle").eq("status", "review").limit(5000),
    db().from("captain_documents").select("captain_id").eq("status", "uploaded").limit(5000),
    db().from("seat_cars").select("captain_id").eq("status", "review").limit(5000),
  ]);
  const ids = new Set<string>([...((review.data ?? []) as Row[]).map((row) => row.user_id), ...((docs.data ?? []) as Row[]).map((row) => row.captain_id), ...((cars.data ?? []) as Row[]).map((row) => row.captain_id)]);
  const known = new Map(((review.data ?? []) as Row[]).map((row) => [row.user_id as string, row]));
  const missing = [...ids].filter((id) => !known.has(id));
  if (missing.length) {
    const { data } = await db().from("captains").select("user_id,service,vehicle").in("user_id", missing);
    for (const row of (data ?? []) as Row[]) known.set(row.user_id, row);
  }
  const byService = Object.fromEntries(SERVICE_KEYS.map((key) => [key, [] as string[]])) as Record<ServiceKey, string[]>;
  for (const id of ids) {
    const row = known.get(id);
    if (row) byService[serviceOfCaptain(row)].push(id);
  }
  return byService;
}

export type ServiceSummary = {
  key: ServiceKey;
  name: string;
  soon: boolean;
  captains: { active: number; waiting: number; onDuty: number; total: number };
  customers: number;
  period: { orders: number; completed: number; cancelled: number; inProgress: number; valuePaise: number; commissionPaise: number; bonusPaise: number; netPaise: number };
};

// City rides (bike, auto, taxi) between two IST days, inclusive.
async function cityRides(key: ServiceKey, from: string, to: string) {
  const vehicle = SERVICE_INFO[key].vehicle!;
  const [{ data: trips }, inProgress] = await Promise.all([
    db().from("trips").select("id,status,payment,fare_paise,discount_paise,bonus_paise").eq("vehicle", vehicle).gte("requested_at", istStart(from)).lt("requested_at", istStart(shiftIst(to, 1))).limit(20000),
    count("trips", (q) => q.eq("vehicle", vehicle).in("status", OPEN)),
  ]);
  const rows = (trips ?? []) as Row[];
  const done = rows.filter((row) => row.status === "completed");
  const ids = done.map((row) => row.id as string);
  const posted: Row[] = [];
  for (let at = 0; at < ids.length; at += 500) {
    const { data } = await db().from("ledger_entries").select("ref_id,kind,amount_paise").eq("ref_type", "trip").in("ref_id", ids.slice(at, at + 500)).in("kind", ["commission", "ride_earning", "ride_bonus", "promo"]).neq("owner_id", PLATFORM_WALLET);
    posted.push(...((data ?? []) as Row[]));
  }
  let commission = 0;
  let bonus = 0;
  let promo = 0;
  for (const trip of done) {
    const mine = posted.filter((row) => String(row.ref_id) === trip.id);
    const sum = (kind: string) => mine.filter((row) => row.kind === kind).reduce((acc, row) => acc + Number(row.amount_paise), 0);
    // Cash rides post commission on its own; online rides credit the fare already less commission.
    if (trip.payment === "cash") commission += -sum("commission");
    else if (mine.some((row) => row.kind === "ride_earning")) commission += Number(trip.fare_paise) - sum("ride_earning");
    bonus += sum("ride_bonus");
    promo += sum("promo");
  }
  return {
    orders: rows.length,
    completed: done.length,
    cancelled: rows.filter((row) => row.status === "cancelled" || row.status === "expired").length,
    inProgress,
    valuePaise: done.reduce((sum, row) => sum + Number(row.fare_paise) - Number(row.discount_paise ?? 0), 0),
    commissionPaise: commission,
    bonusPaise: bonus,
    netPaise: commission - bonus - promo,
  };
}

// Carpool seat bookings between two IST days, inclusive, from the finance views.
async function carpool(from: string, to: string) {
  const [{ data: days }, inProgress] = await Promise.all([
    controls().from("daily_finance").select("bookings,cancellations,collected_paise,commission_paise,profit_paise").gte("day", from).lte("day", to),
    count("seat_trips", (q) => q.eq("status", "on_trip")),
  ]);
  const rows = (days ?? []) as Row[];
  const sum = (key: string) => rows.reduce((acc, row) => acc + Number(row[key] ?? 0), 0);
  return {
    orders: sum("bookings") + sum("cancellations"),
    completed: sum("bookings"),
    cancelled: sum("cancellations"),
    inProgress,
    valuePaise: sum("collected_paise"),
    commissionPaise: sum("commission_paise"),
    bonusPaise: 0,
    netPaise: sum("profit_paise"),
  };
}

async function captainsOf(key: ServiceKey, waiting: string[]) {
  const since = new Date(Date.now() - FRESH_MS).toISOString();
  const [active, total, onDuty] = await Promise.all([
    count("captains", (q) => onlyService(q, key).eq("status", "active")),
    count("captains", (q) => onlyService(q, key)),
    key === "carpool" ? count("seat_trips", (q) => q.eq("status", "on_trip")) : count("captain_presence", (q) => q.eq("online", true).eq("vehicle", SERVICE_INFO[key].vehicle).gte("updated_at", since)),
  ]);
  return { active, waiting: waiting.length, onDuty, total };
}

// One row per service for the dashboard and finance pages.
export async function serviceSummaries(from: string, to: string): Promise<ServiceSummary[]> {
  const waiting = await waitingCaptains();
  return Promise.all(
    SERVICE_KEYS.map(async (key) => {
      const [captains, customers, period] = await Promise.all([captainsOf(key, waiting[key]), customerIds(key), key === "carpool" ? carpool(from, to) : cityRides(key, from, to)]);
      return { key, name: SERVICE_INFO[key].name, soon: Boolean(SERVICE_INFO[key].soon), captains, customers: customers.length, period };
    }),
  );
}
