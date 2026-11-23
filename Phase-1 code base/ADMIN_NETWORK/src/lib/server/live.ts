import { CITIES, cityById } from "@/lib/rules";
import { istDay, PLATFORM_WALLET, shiftIst, type Row } from "./data";
import { db } from "./db";
import { OPEN, rideLine } from "./rides";

// Live pages for the city ride services (Bike, Auto, Car). Carpool Travels has its own network pages.
export const LIVE_SERVICES = { bike: { vehicle: "bike", name: "ROVEYA Bike" }, auto: { vehicle: "auto", name: "ROVEYA Auto" }, car: { vehicle: "cab", name: "ROVEYA Car" } } as const;
export type LiveService = keyof typeof LIVE_SERVICES;
export const isLiveService = (value: string): value is LiveService => value in LIVE_SERVICES;

const DAY = 86400000;
const FRESH_MS = 2 * 60 * 1000;
const QUIET_DAYS = 15;

// green: on duty now or active in the last 24 hours; orange: active in the last 15 days; red: 15+ days or never.
export type Activity = "active" | "recent" | "inactive" | "waiting" | "suspended";

async function chunked<T>(ids: string[], load: (part: string[]) => PromiseLike<{ data: T[] | null }>) {
  const rows: T[] = [];
  for (let at = 0; at < ids.length; at += 400) rows.push(...(((await load(ids.slice(at, at + 400))).data ?? []) as T[]));
  return rows;
}

export async function captainLive(service: LiveService, days: number) {
  const vehicle = LIVE_SERVICES[service].vehicle;
  const now = Date.now();
  const since = new Date(now - Math.max(days, 90) * DAY).toISOString();
  const [{ data: captainRows }, { data: tripRows }, { data: openRows }] = await Promise.all([
    db().from("captains").select("user_id,name,phone,captain_code,status,city,vehicle_no,vehicle_model,rating,created_at,approved_at").eq("service", "taxi").eq("vehicle", vehicle).order("created_at", { ascending: false }).limit(5000),
    db().from("trips").select("captain_id,status,assigned_at,completed_at,requested_at").eq("vehicle", vehicle).not("captain_id", "is", null).gte("requested_at", since).limit(50000),
    db().from("trips").select("*").eq("vehicle", vehicle).in("status", OPEN).order("requested_at").limit(200),
  ]);
  const captains = (captainRows ?? []) as Row[];
  const presence = await chunked<Row>(captains.map((row) => row.user_id), (part) => db().from("captain_presence").select("captain_id,online,updated_at,online_since").in("captain_id", part));
  const where = new Map(presence.map((row) => [row.captain_id as string, row]));
  const trips = (tripRows ?? []) as Row[];
  const open = (openRows ?? []) as Row[];
  const onRide = new Set(open.map((row) => row.captain_id).filter(Boolean));

  const rows = captains.map((captain) => {
    const spot = where.get(captain.user_id);
    const mine = trips.filter((trip) => trip.captain_id === captain.user_id);
    const times = [spot?.updated_at ?? null, ...mine.flatMap((trip) => [trip.assigned_at, trip.completed_at])].filter(Boolean).map((at) => Date.parse(at as string));
    const lastActive = times.length ? Math.max(...times) : null;
    const onDuty = Boolean(spot?.online && Date.parse(spot.updated_at) > now - FRESH_MS);
    const recent = mine.filter((trip) => trip.assigned_at && Date.parse(trip.assigned_at) > now - QUIET_DAYS * DAY);
    const activity: Activity =
      captain.status === "review" ? "waiting" : captain.status !== "active" ? "suspended" : onDuty || onRide.has(captain.user_id) || (lastActive && lastActive > now - DAY) ? "active" : lastActive && lastActive > now - QUIET_DAYS * DAY ? "recent" : "inactive";
    return {
      id: captain.user_id as string,
      name: captain.name as string,
      phone: captain.phone as string,
      code: captain.captain_code as string,
      status: captain.status as string,
      city: captain.city as string,
      vehicleNo: captain.vehicle_no as string,
      vehicleModel: captain.vehicle_model as string,
      rating: Number(captain.rating),
      joinedAt: captain.created_at as string,
      activity,
      onDuty,
      onRide: onRide.has(captain.user_id),
      lastActive: lastActive ? new Date(lastActive).toISOString() : null,
      rides15: recent.filter((trip) => trip.status === "completed").length,
      activeDays15: new Set(recent.map((trip) => istDay(new Date(trip.assigned_at)))).size,
    };
  });

  const today = istDay();
  const labels = Array.from({ length: days }, (_, index) => shiftIst(today, index - days + 1));
  const periodStart = new Date(now - days * DAY).toISOString();
  const approved = rows.filter((row) => row.status === "active");
  const tally = (key: Activity) => rows.filter((row) => row.activity === key).length;
  const periodTrips = trips.filter((trip) => trip.requested_at >= periodStart);
  const who = await (async () => {
    const ids = [...new Set(open.flatMap((row) => [row.rider_id, row.captain_id]).filter(Boolean))];
    const [riders, drivers] = ids.length ? await Promise.all([db().from("riders").select("user_id,name,phone").in("user_id", ids), db().from("captains").select("user_id,name,captain_code").in("user_id", ids)]) : [{ data: [] }, { data: [] }];
    return new Map([...((riders.data ?? []) as Row[]), ...((drivers.data ?? []) as Row[])].map((row) => [row.user_id as string, row]));
  })();

  return {
    service,
    name: LIVE_SERVICES[service].name,
    days,
    totals: {
      registered: rows.length,
      newInPeriod: rows.filter((row) => row.joinedAt >= periodStart).length,
      approved: approved.length,
      waiting: tally("waiting"),
      suspended: tally("suspended"),
      active: tally("active"),
      recent: tally("recent"),
      inactive: tally("inactive"),
      onDuty: rows.filter((row) => row.onDuty).length,
      onRide: onRide.size,
      ridesInPeriod: periodTrips.filter((trip) => trip.status === "completed").length,
      busyCaptains: new Set(periodTrips.map((trip) => trip.captain_id)).size,
    },
    series: {
      labels,
      registered: labels.map((day) => rows.filter((row) => istDay(new Date(row.joinedAt)) === day).length),
      working: labels.map((day) => new Set(trips.filter((trip) => trip.assigned_at && istDay(new Date(trip.assigned_at)) === day).map((trip) => trip.captain_id)).size),
    },
    captains: rows,
    rides: open.map((row) => ({ ...rideLine(row), waitingMin: Math.max(0, Math.round((now - Date.parse(row.requested_at)) / 60000)), rider: who.get(row.rider_id) ?? null, captain: row.captain_id ? (who.get(row.captain_id) ?? null) : null })),
  };
}

// --- Live Cities -------------------------------------------------------------

const RADIUS_KM = 40;
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const rad = (value: number) => (value * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};
// A ride belongs to the nearest ROVEYA city within 40 km of its pickup.
const cityOfPoint = (lat: number, lng: number) => {
  let best: { id: string; distance: number } | null = null;
  for (const city of CITIES) {
    const distance = km({ lat, lng }, { lat: city.lat, lng: city.lng });
    if (distance <= RADIUS_KM && (!best || distance < best.distance)) best = { id: city.id, distance };
  }
  return best?.id ?? "other";
};
// Captains register with a city name or id.
const cityOfText = (text: string | null) => {
  const value = String(text ?? "").trim().toLowerCase();
  if (!value) return "other";
  return CITIES.find((city) => city.id === value || city.name.toLowerCase() === value || value.startsWith(city.name.toLowerCase()))?.id ?? "other";
};

// City rides are paid after the ride, so ROVEYA's spend in a city is captain bonuses and promos (no refunds).
type Money = { valuePaise: number; commissionPaise: number; bonusPaise: number; promoPaise: number };
const emptyMoney = (): Money => ({ valuePaise: 0, commissionPaise: 0, bonusPaise: 0, promoPaise: 0 });

export async function liveCities(days: number) {
  const now = Date.now();
  const start = new Date(now - days * DAY).toISOString();
  const vehicles = Object.values(LIVE_SERVICES).map((item) => item.vehicle);
  const [{ data: tripRows }, { data: captainRows }, { data: workRows }] = await Promise.all([
    db().from("trips").select("id,vehicle,status,rider_id,captain_id,pickup_lat,pickup_lng,payment,fare_paise,discount_paise,requested_at").in("vehicle", vehicles).gte("requested_at", start).limit(50000),
    db().from("captains").select("user_id,status,city,vehicle").eq("service", "taxi").limit(10000),
    db().from("trips").select("captain_id,assigned_at").not("captain_id", "is", null).gte("assigned_at", new Date(now - QUIET_DAYS * DAY).toISOString()).limit(50000),
  ]);
  const trips = (tripRows ?? []) as Row[];
  const captains = (captainRows ?? []) as Row[];
  const presence = await chunked<Row>(captains.map((row) => row.user_id), (part) => db().from("captain_presence").select("captain_id,updated_at,online").in("captain_id", part));
  const seen = new Map(presence.map((row) => [row.captain_id as string, Date.parse(row.updated_at)]));
  const working = new Set(((workRows ?? []) as Row[]).map((row) => row.captain_id as string));
  for (const [id, at] of seen) if (at > now - QUIET_DAYS * DAY) working.add(id);

  // Money on completed rides, from the ledger: commission kept, bonuses and promos paid.
  const ledger = await chunked<Row>(
    trips.map((trip) => trip.id),
    (part) => db().from("ledger_entries").select("ref_id,owner_id,kind,amount_paise").eq("ref_type", "trip").in("ref_id", part).in("kind", ["commission", "ride_earning", "ride_bonus", "promo"]).neq("owner_id", PLATFORM_WALLET),
  );
  const byTrip = new Map<string, Row[]>();
  for (const row of ledger) byTrip.set(String(row.ref_id), [...(byTrip.get(String(row.ref_id)) ?? []), row]);
  const moneyOf = (trip: Row): Money => {
    const rows = byTrip.get(trip.id) ?? [];
    const sum = (kind: string) => rows.filter((row) => row.kind === kind).reduce((acc, row) => acc + Number(row.amount_paise), 0);
    const completed = trip.status === "completed";
    return {
      valuePaise: completed ? Number(trip.fare_paise) - Number(trip.discount_paise ?? 0) : 0,
      commissionPaise: !completed ? 0 : trip.payment === "cash" ? -sum("commission") : rows.some((row) => row.kind === "ride_earning") ? Number(trip.fare_paise) - sum("ride_earning") : 0,
      bonusPaise: sum("ride_bonus"),
      promoPaise: sum("promo"),
    };
  };

  type Bucket = { requests: number; completed: number; noCaptain: number; cancelled: number; passengers: Set<string>; captains: number; approved: number; working: number; money: Money };
  const bucket = (): Bucket => ({ requests: 0, completed: 0, noCaptain: 0, cancelled: 0, passengers: new Set(), captains: 0, approved: 0, working: 0, money: emptyMoney() });
  const table = new Map<string, Record<string, Bucket>>();
  const cell = (city: string, vehicle: string) => {
    const row = table.get(city) ?? {};
    row[vehicle] ??= bucket();
    table.set(city, row);
    return row[vehicle]!;
  };
  for (const trip of trips) {
    const target = cell(cityOfPoint(Number(trip.pickup_lat), Number(trip.pickup_lng)), trip.vehicle);
    target.requests += 1;
    target.passengers.add(trip.rider_id);
    if (trip.status === "completed") target.completed += 1;
    if (trip.status === "expired") target.noCaptain += 1;
    if (trip.status === "cancelled") target.cancelled += 1;
    const money = moneyOf(trip);
    for (const key of Object.keys(money) as (keyof Money)[]) target.money[key] += money[key];
  }
  for (const captain of captains) {
    const target = cell(cityOfText(captain.city), captain.vehicle);
    target.captains += 1;
    if (captain.status === "active") {
      target.approved += 1;
      if (working.has(captain.user_id)) target.working += 1;
    }
  }

  const shape = (item: Bucket) => {
    const spend = item.money.bonusPaise + item.money.promoPaise;
    return {
      requests: item.requests,
      passengers: item.passengers.size,
      completed: item.completed,
      noCaptain: item.noCaptain,
      cancelled: item.cancelled,
      fulfilment: item.requests ? item.completed / item.requests : 0,
      unmet: item.requests ? item.noCaptain / item.requests : 0,
      captains: item.captains,
      approved: item.approved,
      working: item.working,
      utilisation: item.approved ? item.working / item.approved : 0,
      ...item.money,
      spendPaise: spend,
      netPaise: item.money.commissionPaise - spend,
    };
  };
  const merge = (items: Bucket[]) => {
    const total = bucket();
    for (const item of items) {
      total.requests += item.requests;
      total.completed += item.completed;
      total.noCaptain += item.noCaptain;
      total.cancelled += item.cancelled;
      for (const id of item.passengers) total.passengers.add(id);
      total.captains += item.captains;
      total.approved += item.approved;
      total.working += item.working;
      for (const key of Object.keys(total.money) as (keyof Money)[]) total.money[key] += item.money[key];
    }
    return total;
  };

  const cities = [...table.entries()]
    .map(([id, services]) => ({
      id,
      name: id === "other" ? "Outside ROVEYA cities" : (cityById(id)?.name ?? id),
      state: id === "other" ? "" : (cityById(id)?.state ?? ""),
      total: shape(merge(Object.values(services))),
      services: Object.fromEntries((Object.keys(LIVE_SERVICES) as LiveService[]).map((key) => [key, shape(services[LIVE_SERVICES[key].vehicle] ?? bucket())])) as Record<LiveService, ReturnType<typeof shape>>,
    }))
    .sort((a, b) => (a.id === "other" ? 1 : b.id === "other" ? -1 : b.total.requests - a.total.requests || b.total.captains - a.total.captains));
  return { days, cities, totals: shape(merge([...table.values()].flatMap((services) => Object.values(services)))) };
}
