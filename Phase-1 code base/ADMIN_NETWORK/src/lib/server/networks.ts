import { CITIES, cityById } from "@/lib/rules";
import { istDay, shiftIst, type Row } from "./data";
import { controls, db } from "./db";

// The Carpool Travels network is worked out from the trips captains publish:
// a city joins the network with its first trip from or to it, and a route with its first trip between two cities.
// Cities the team adds to the launch planner join it before any trip runs.
// Demand comes from passenger seat searches; a search with no trip on offer is a demand gap.

type Trip = { id: string; code: string; status: string; from_city: string; to_city: string; depart_at: string; captain_id: string; car_id: string; seats_total: number; seats_booked: number; profit_paise: number; created_at: string };
type Booking = { trip_id: string; rider_id: string; seats: number; status: string; from_city: string; to_city: string; depart_at: string };
type Search = { from_city: string; to_city: string; travel_date: string; results: number; searcher: string | null; created_at: string };

export const PLAN_STATUSES = ["planned", "launching", "live", "paused"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export type Plan = { status: PlanStatus; target_captains: number | null; launch_date: string | null; owner_id: string | null; owner: string | null; note: string | null; updated_at: string };

export type CityStats = {
  id: string;
  name: string;
  state: string;
  since: string | null;
  // The planner status when set, otherwise "running" (trips in the period), "quiet" (trips before) or "new".
  status: PlanStatus | "running" | "quiet" | "new";
  plan: Plan | null;
  routes: number;
  vehicles: number;
  captainsBased: number;
  vado: number;
  departures: number;
  arrivals: number;
  tripsPerDay: number;
  seatsFrom: number;
  seatsTo: number;
  fill: number;
  upcoming: number;
  profitPaise: number;
  searches: number;
  unmet: number;
};

export type RouteStats = { from: string; to: string; since: string; trips: number; tripsPerDay: number; vehicles: number; vado: number; seatsBooked: number; seatsTotal: number; fill: number; upcoming: number; nextAt: string | null; lastAt: string | null; searches: number; unmet: number };
export type DemandGap = { from: string; to: string; searches: number; searchers: number; unmet: number; unmetSearchers: number; trips: number; lastAt: string; wantedDates: { date: string; searchers: number }[] };

const LIVE = (trip: Trip) => trip.status !== "cancelled";
const round2 = (value: number) => Math.round(value * 100) / 100;
const distinct = (rows: Search[]) => new Set(rows.map((row) => row.searcher ?? row.created_at)).size;

async function load(days: number) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const [trips, bookings, captains, searches, plans, admins] = await Promise.all([
    controls().from("trip_finance").select("id,code,status,from_city,to_city,depart_at,captain_id,car_id,seats_total,seats_booked,profit_paise,created_at").order("depart_at").limit(20000),
    controls().from("seat_booking_facts").select("trip_id,rider_id,seats,status,from_city,to_city,depart_at").in("status", ["confirmed", "completed"]).limit(50000),
    db().from("captains").select("user_id,city,status").eq("service", "seats").eq("status", "active").limit(5000),
    db().from("seat_searches").select("from_city,to_city,travel_date,results,searcher,created_at").gte("created_at", since).order("created_at").limit(50000),
    controls().from("network_cities").select("city_id,status,target_captains,launch_date,owner_id,note,updated_at"),
    controls().from("admins").select("id,name").eq("active", true).order("name"),
  ]);
  const start = Date.parse(since);
  const now = Date.now();
  const all = (trips.data ?? []) as Trip[];
  const inWindow = (at: string) => {
    const time = Date.parse(at);
    return time >= start && time <= now;
  };
  const team = ((admins.data ?? []) as Row[]).map((row) => ({ id: row.id as string, name: row.name as string }));
  const nameOf = new Map(team.map((row) => [row.id, row.name]));
  return {
    all,
    window: all.filter((trip) => LIVE(trip) && inWindow(trip.depart_at)),
    upcoming: all.filter((trip) => trip.status === "scheduled" && Date.parse(trip.depart_at) > now),
    bookings: ((bookings.data ?? []) as Booking[]).filter((row) => inWindow(row.depart_at)),
    captains: (captains.data ?? []) as Row[],
    searches: (searches.data ?? []) as Search[],
    plans: new Map(((plans.data ?? []) as Row[]).map((row) => [row.city_id as string, { ...row, owner: row.owner_id ? (nameOf.get(row.owner_id) ?? null) : null } as Plan])),
    team,
  };
}
type Data = Awaited<ReturnType<typeof load>>;

const cityName = (id: string) => cityById(id)?.name ?? id.toUpperCase();
const stateOf = (id: string) => cityById(id)?.state ?? "Other";
// Captains save their home city as the city id; older rows may hold the name.
const basedIn = (captain: Row, id: string) => String(captain.city ?? "").toLowerCase() === id || String(captain.city ?? "").toLowerCase() === cityName(id).toLowerCase();

function cityStats(id: string, data: Data, days: number): CityStats {
  const touches = (row: { from_city: string; to_city: string }) => row.from_city === id || row.to_city === id;
  const ever = data.all.filter(touches);
  const recent = data.window.filter(touches);
  const out = recent.filter((trip) => trip.from_city === id);
  const bookings = data.bookings.filter(touches);
  const searches = data.searches.filter(touches);
  const seatsTotal = out.reduce((sum, trip) => sum + Number(trip.seats_total), 0);
  const seatsOut = out.reduce((sum, trip) => sum + Number(trip.seats_booked), 0);
  const plan = data.plans.get(id) ?? null;
  return {
    id,
    name: cityName(id),
    state: stateOf(id),
    since: ever.length ? ever.reduce((first, trip) => (trip.created_at < first ? trip.created_at : first), ever[0]!.created_at) : null,
    status: plan?.status ?? (recent.length ? "running" : ever.length ? "quiet" : "new"),
    plan,
    routes: new Set(ever.map((trip) => `${trip.from_city}>${trip.to_city}`)).size,
    vehicles: new Set(recent.map((trip) => trip.car_id)).size,
    captainsBased: data.captains.filter((captain) => basedIn(captain, id)).length,
    vado: new Set(bookings.map((row) => row.rider_id)).size,
    departures: out.length,
    arrivals: recent.filter((trip) => trip.to_city === id).length,
    tripsPerDay: round2(out.length / days),
    seatsFrom: bookings.filter((row) => row.from_city === id).reduce((sum, row) => sum + Number(row.seats), 0),
    seatsTo: bookings.filter((row) => row.to_city === id).reduce((sum, row) => sum + Number(row.seats), 0),
    fill: seatsTotal ? seatsOut / seatsTotal : 0,
    upcoming: data.upcoming.filter(touches).length,
    profitPaise: out.reduce((sum, trip) => sum + Number(trip.profit_paise), 0),
    searches: distinct(searches),
    unmet: distinct(searches.filter((row) => row.results === 0)),
  };
}

function routeStats(data: Data, days: number, only?: string): RouteStats[] {
  const keys = new Map<string, Trip[]>();
  for (const trip of data.all) {
    if (only && trip.from_city !== only && trip.to_city !== only) continue;
    const key = `${trip.from_city}>${trip.to_city}`;
    keys.set(key, [...(keys.get(key) ?? []), trip]);
  }
  return [...keys.entries()]
    .map(([key, trips]) => {
      const [from, to] = key.split(">") as [string, string];
      const recent = data.window.filter((trip) => trip.from_city === from && trip.to_city === to);
      const ids = new Set(recent.map((trip) => trip.id));
      const bookings = data.bookings.filter((row) => ids.has(row.trip_id));
      const next = data.upcoming.filter((trip) => trip.from_city === from && trip.to_city === to);
      const seatsTotal = recent.reduce((sum, trip) => sum + Number(trip.seats_total), 0);
      const seatsBooked = recent.reduce((sum, trip) => sum + Number(trip.seats_booked), 0);
      const past = trips.filter((trip) => LIVE(trip) && Date.parse(trip.depart_at) <= Date.now());
      const searches = data.searches.filter((row) => row.from_city === from && row.to_city === to);
      return {
        from,
        to,
        since: trips.reduce((first, trip) => (trip.created_at < first ? trip.created_at : first), trips[0]!.created_at),
        trips: recent.length,
        tripsPerDay: round2(recent.length / days),
        vehicles: new Set(recent.map((trip) => trip.car_id)).size,
        vado: new Set(bookings.map((row) => row.rider_id)).size,
        seatsBooked,
        seatsTotal,
        fill: seatsTotal ? seatsBooked / seatsTotal : 0,
        upcoming: next.length,
        nextAt: next[0]?.depart_at ?? null,
        lastAt: past.at(-1)?.depart_at ?? null,
        searches: distinct(searches),
        unmet: distinct(searches.filter((row) => row.results === 0)),
      };
    })
    .sort((a, b) => b.trips - a.trips || b.upcoming - a.upcoming || a.from.localeCompare(b.from));
}

// Routes passengers searched for, most unmet first: where to recruit captains next.
function demandGaps(data: Data, only?: string): DemandGap[] {
  const keys = new Map<string, Search[]>();
  for (const row of data.searches) {
    if (only && row.from_city !== only && row.to_city !== only) continue;
    const key = `${row.from_city}>${row.to_city}`;
    keys.set(key, [...(keys.get(key) ?? []), row]);
  }
  const today = istDay();
  return [...keys.entries()]
    .map(([key, rows]) => {
      const [from, to] = key.split(">") as [string, string];
      const unmet = rows.filter((row) => row.results === 0);
      const dates = new Map<string, Set<string>>();
      for (const row of unmet) {
        if (row.travel_date < today) continue;
        dates.set(row.travel_date, (dates.get(row.travel_date) ?? new Set()).add(row.searcher ?? row.created_at));
      }
      return {
        from,
        to,
        searches: rows.length,
        searchers: distinct(rows),
        unmet: unmet.length,
        unmetSearchers: distinct(unmet),
        trips: data.window.filter((trip) => trip.from_city === from && trip.to_city === to).length,
        lastAt: rows.at(-1)!.created_at,
        wantedDates: [...dates.entries()].map(([date, people]) => ({ date, searchers: people.size })).sort((a, b) => b.searchers - a.searchers || a.date.localeCompare(b.date)).slice(0, 3),
      };
    })
    .sort((a, b) => b.unmetSearchers - a.unmetSearchers || b.searchers - a.searchers);
}

// The whole network: states, the cities in each, the routes between them, demand gaps, and the cities not reached yet.
export async function network(days: number) {
  const data = await load(days);
  const ids = [...new Set([...data.all.flatMap((trip) => [trip.from_city, trip.to_city]), ...data.plans.keys()])].filter((id) => cityById(id));
  const cities = ids.map((id) => cityStats(id, data, days)).sort((a, b) => b.departures - a.departures || b.upcoming - a.upcoming || a.name.localeCompare(b.name));
  const states = [...new Set(cities.map((city) => city.state))]
    .map((state) => {
      const inState = cities.filter((city) => city.state === state);
      const codes = new Set(inState.map((city) => city.id));
      const recent = data.window.filter((trip) => codes.has(trip.from_city) || codes.has(trip.to_city));
      const bookings = data.bookings.filter((row) => codes.has(row.from_city) || codes.has(row.to_city));
      return {
        state,
        cities: inState,
        vehicles: new Set(recent.map((trip) => trip.car_id)).size,
        vado: new Set(bookings.map((row) => row.rider_id)).size,
        departures: inState.reduce((sum, city) => sum + city.departures, 0),
        seatsFrom: inState.reduce((sum, city) => sum + city.seatsFrom, 0),
      };
    })
    .sort((a, b) => b.departures - a.departures || a.state.localeCompare(b.state));
  const routes = routeStats(data, days);
  const gaps = demandGaps(data);
  return {
    days,
    totals: {
      states: states.length,
      cities: cities.length,
      routes: routes.length,
      vehicles: new Set(data.window.map((trip) => trip.car_id)).size,
      vado: new Set(data.bookings.map((row) => row.rider_id)).size,
      trips: data.window.length,
      tripsPerDay: round2(data.window.length / days),
      seatsBooked: data.bookings.reduce((sum, row) => sum + Number(row.seats), 0),
      upcoming: data.upcoming.length,
      searches: distinct(data.searches),
      unmet: distinct(data.searches.filter((row) => row.results === 0)),
    },
    states,
    routes,
    gaps,
    notYet: CITIES.filter((city) => !ids.includes(city.id)).map((city) => {
      const searches = data.searches.filter((row) => row.from_city === city.id || row.to_city === city.id);
      return { id: city.id, name: city.name, state: city.state, searches: distinct(searches) };
    }),
  };
}

// One city in detail: its numbers, a day-by-day series, routes, demand, upcoming trips, stops, captains and passengers.
export async function cityNetwork(id: string, days: number) {
  const data = await load(days);
  const stats = cityStats(id, data, days);
  const touches = (row: { from_city: string; to_city: string }) => row.from_city === id || row.to_city === id;
  const today = istDay();
  const labels = Array.from({ length: days }, (_, index) => shiftIst(today, index - days + 1));
  const perDay = <T,>(rows: T[], dayOf: (row: T) => string, weight: (row: T) => number = () => 1) => labels.map((day) => rows.filter((row) => dayOf(row) === day).reduce((sum, row) => sum + weight(row), 0));
  const recent = data.window.filter(touches);
  const bookings = data.bookings.filter(touches);
  const ids = new Set(recent.map((trip) => trip.id));

  const [boardings, captains, riders] = await Promise.all([
    ids.size ? db().from("seat_bookings").select("trip_id,boarding,drop_point,seat_ids,status").in("trip_id", [...ids].slice(0, 500)).in("status", ["confirmed", "completed"]) : Promise.resolve({ data: [] }),
    db().from("captains").select("user_id,name,captain_code,phone,city,rating").eq("service", "seats").eq("status", "active").limit(5000),
    (() => {
      const counts = new Map<string, number>();
      for (const row of bookings) counts.set(row.rider_id, (counts.get(row.rider_id) ?? 0) + Number(row.seats));
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      return top.length ? db().from("riders").select("user_id,name,phone").in("user_id", top.map(([rider]) => rider)).then((result) => ({ data: top.map(([rider, seats]) => ({ ...((result.data ?? []).find((row) => row.user_id === rider) ?? { user_id: rider, name: "—", phone: "" }), seats })) })) : Promise.resolve({ data: [] });
    })(),
  ]);

  const tripCity = new Map(recent.map((trip) => [trip.id, trip]));
  const points = new Map<string, { name: string; kind: "Boarding" | "Drop"; seats: number }>();
  for (const row of (boardings.data ?? []) as Row[]) {
    const trip = tripCity.get(row.trip_id);
    if (!trip) continue;
    const stop = trip.from_city === id ? row.boarding : row.drop_point;
    const kind = trip.from_city === id ? "Boarding" : "Drop";
    const key = `${kind}:${stop?.name ?? "—"}`;
    const item = points.get(key) ?? { name: stop?.name ?? "—", kind, seats: 0 };
    item.seats += (row.seat_ids as string[]).length;
    points.set(key, item);
  }

  const vehiclesHere = [...new Set(recent.map((trip) => trip.car_id))];
  const { data: cars } = vehiclesHere.length ? await controls().from("trip_finance").select("car_id,make_model,plate,car_class,captain_id,captain_name,captain_code").in("car_id", vehiclesHere).limit(2000) : { data: [] };
  const carRows = new Map<string, Row>();
  for (const car of (cars ?? []) as Row[]) if (!carRows.has(car.car_id)) carRows.set(car.car_id, car);
  const searches = data.searches.filter((row) => row.from_city === id);

  return {
    days,
    city: stats,
    team: data.team,
    series: {
      labels,
      departures: perDay(recent.filter((trip) => trip.from_city === id), (trip) => istDay(new Date(trip.depart_at))),
      arrivals: perDay(recent.filter((trip) => trip.to_city === id), (trip) => istDay(new Date(trip.depart_at))),
      seats: perDay(bookings.filter((row) => row.from_city === id), (row) => istDay(new Date(row.depart_at)), (row) => Number(row.seats)),
      searches: perDay(searches, (row) => istDay(new Date(row.created_at))),
      unmet: perDay(searches.filter((row) => row.results === 0), (row) => istDay(new Date(row.created_at))),
    },
    routes: routeStats(data, days, id),
    gaps: demandGaps(data, id),
    upcoming: data.upcoming.filter(touches).slice(0, 25),
    points: [...points.values()].sort((a, b) => b.seats - a.seats),
    vehicles: vehiclesHere.map((carId) => ({ ...(carRows.get(carId) ?? { car_id: carId }), trips: recent.filter((trip) => trip.car_id === carId).length })).sort((a, b) => Number(b.trips) - Number(a.trips)),
    captainsBased: ((captains.data ?? []) as Row[]).filter((captain) => basedIn(captain, id)),
    topVado: riders.data ?? [],
  };
}
