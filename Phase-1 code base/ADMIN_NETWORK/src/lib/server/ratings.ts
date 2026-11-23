import "server-only";
import { cityById } from "@/lib/rules";
import { SERVICE_INFO, type ServiceKey } from "@/lib/services";
import { check } from "./api";
import type { Row } from "./data";
import { controls, db } from "./db";

// Reviews and Ratings live only on the Support Desk.
//   Riders: what passengers said about their ride and Vado.
//   Vado: what captains said about their riders.
//   Support: what riders and Vado said about the help they got from the desk.

export type Party = { id: string; name: string; phone: string | null; code?: string | null } | null;
export type RatingEntry = {
  id: string;
  at: string;
  stars: number;
  tags: string[];
  note: string | null;
  ref: string | null;
  route: string | null;
  rider: Party;
  vado: Party;
  source?: string;
  published?: boolean;
  executive?: { id: string; name: string } | null;
  ticket?: { id: string; code: string; topic: string; status: string } | null;
};
export type RatingFilter = { days: number | null; stars: number | null; q: string };

const VEHICLE: Record<Exclude<ServiceKey, "carpool">, string> = { bike: "bike", auto: "auto", taxi: "cab" };
const MAX = 1000;

const since = (days: number | null) => (days ? new Date(Date.now() - days * 86400000).toISOString() : null);
const cityName = (id: string) => cityById(id)?.name ?? id.toUpperCase();
const plateKey = (plate: string | null | undefined) => (plate ?? "").replace(/[^A-Z0-9]/gi, "").toUpperCase();

async function riders(ids: (string | null | undefined)[]) {
  const list = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!list.length) return new Map<string, Party>();
  const { data } = await db().from("riders").select("user_id,name,phone").in("user_id", list);
  return new Map(((data ?? []) as Row[]).map((row) => [row.user_id as string, { id: row.user_id, name: row.name || "Rider", phone: row.phone ?? null } as Party]));
}

async function vados(ids: (string | null | undefined)[]) {
  const list = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!list.length) return new Map<string, Party>();
  const { data } = await db().from("captains").select("user_id,name,phone,captain_code").in("user_id", list);
  return new Map(((data ?? []) as Row[]).map((row) => [row.user_id as string, { id: row.user_id, name: row.name || "Vado", phone: row.phone ?? null, code: row.captain_code ?? null } as Party]));
}

function summarise(entries: RatingEntry[]) {
  const distribution = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: entries.filter((entry) => entry.stars === stars).length }));
  const tags = new Map<string, number>();
  for (const entry of entries) for (const tag of entry.tags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
  return {
    count: entries.length,
    average: entries.length ? Math.round((entries.reduce((sum, entry) => sum + entry.stars, 0) / entries.length) * 10) / 10 : null,
    distribution,
    low: entries.filter((entry) => entry.stars <= 2).length,
    withNote: entries.filter((entry) => entry.note).length,
    topTags: [...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tag, count]) => ({ tag, count })),
  };
}

function narrow(entries: RatingEntry[], filter: RatingFilter) {
  const q = filter.q.trim().toLowerCase();
  return entries.filter((entry) => {
    if (filter.stars && entry.stars !== filter.stars) return false;
    if (!q) return true;
    return [entry.note, entry.ref, entry.route, entry.rider?.name, entry.rider?.phone, entry.vado?.name, entry.vado?.phone, entry.vado?.code, entry.executive?.name, entry.ticket?.code, ...entry.tags]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q));
  });
}

// Bike, Auto and Taxi: trip_ratings, by_role "rider" (passenger about the ride) or "captain" (Vado about the rider).
async function cityRatings(byRole: "rider" | "captain", service: Exclude<ServiceKey, "carpool">, from: string | null) {
  let query = db()
    .from("trip_ratings")
    .select("trip_id,stars,tags,note,created_at,trips!inner(code,vehicle,rider_id,captain_id,pickup_name,drop_name)")
    .eq("by_role", byRole)
    .eq("trips.vehicle", VEHICLE[service])
    .order("created_at", { ascending: false })
    .limit(MAX);
  if (from) query = query.gte("created_at", from);
  const rows = check(await query) as Row[];
  const [riderOf, vadoOf] = await Promise.all([riders(rows.map((row) => row.trips?.rider_id)), vados(rows.map((row) => row.trips?.captain_id))]);
  return rows.map(
    (row): RatingEntry => ({
      id: `${row.trip_id}:${byRole}`,
      at: row.created_at,
      stars: row.stars,
      tags: row.tags ?? [],
      note: row.note ?? null,
      ref: row.trips?.code ?? null,
      route: row.trips ? `${row.trips.pickup_name} → ${row.trips.drop_name}` : null,
      rider: riderOf.get(row.trips?.rider_id) ?? null,
      vado: vadoOf.get(row.trips?.captain_id) ?? null,
    }),
  );
}

// Carpool riders: reviews from rated seat bookings and from the in-car QR scanner (these can go on the website).
async function carpoolRiderReviews(from: string | null) {
  let query = db().from("testimonials").select("id,name,rating,quote,route,seat,car_plate,mobile,source,published,booking_id,rider_id,created_at").in("source", ["seat_booking", "car_scan"]).order("created_at", { ascending: false }).limit(MAX);
  if (from) query = query.gte("created_at", from);
  const rows = check(await query) as Row[];
  const bookingIds = rows.map((row) => row.booking_id).filter(Boolean);
  const { data: bookings } = bookingIds.length ? await db().from("seat_bookings").select("id,pnr,trip_id").in("id", bookingIds) : { data: [] };
  const tripIds = ((bookings ?? []) as Row[]).map((row) => row.trip_id);
  const { data: trips } = tripIds.length ? await db().from("seat_trips").select("id,captain_id").in("id", tripIds) : { data: [] };
  const plates = rows.filter((row) => !row.booking_id && row.car_plate).length ? ((await db().from("seat_cars").select("captain_id,plate")).data ?? []) : [];
  const bookingOf = new Map(((bookings ?? []) as Row[]).map((row) => [row.id as string, row]));
  const captainOfTrip = new Map(((trips ?? []) as Row[]).map((row) => [row.id as string, row.captain_id as string]));
  const captainOfPlate = new Map((plates as Row[]).map((row) => [plateKey(row.plate), row.captain_id as string]));
  const captainOf = (row: Row) => (row.booking_id ? captainOfTrip.get(bookingOf.get(row.booking_id)?.trip_id) : captainOfPlate.get(plateKey(row.car_plate))) ?? null;
  const [riderOf, vadoOf] = await Promise.all([riders(rows.map((row) => row.rider_id)), vados(rows.map(captainOf))]);
  return rows.map(
    (row): RatingEntry => ({
      id: row.id,
      at: row.created_at,
      stars: row.rating,
      tags: [row.source === "car_scan" ? "In-car QR" : "Rated booking"],
      note: row.quote && !/^Rated the trip \d out of 5\.$/.test(row.quote) ? row.quote : null,
      ref: bookingOf.get(row.booking_id)?.pnr ?? row.car_plate ?? null,
      route: [row.route, row.seat].filter(Boolean).join(" · ") || null,
      rider: riderOf.get(row.rider_id) ?? { id: "", name: row.name, phone: row.mobile ?? null },
      vado: vadoOf.get(captainOf(row) ?? "") ?? null,
      source: row.source,
      published: Boolean(row.published),
    }),
  );
}

// Carpool Vado: captains rating the travellers of a completed seat booking.
async function carpoolVadoRatings(from: string | null) {
  let query = db().from("seat_booking_ratings").select("booking_id,trip_id,captain_id,rider_id,stars,tags,note,created_at").order("created_at", { ascending: false }).limit(MAX);
  if (from) query = query.gte("created_at", from);
  const rows = check(await query) as Row[];
  const bookingIds = rows.map((row) => row.booking_id);
  const tripIds = [...new Set(rows.map((row) => row.trip_id))];
  const [{ data: bookings }, { data: trips }] = await Promise.all([
    bookingIds.length ? db().from("seat_bookings").select("id,pnr,travellers").in("id", bookingIds) : Promise.resolve({ data: [] }),
    tripIds.length ? db().from("seat_trips").select("id,code,from_city,to_city").in("id", tripIds) : Promise.resolve({ data: [] }),
  ]);
  const bookingOf = new Map(((bookings ?? []) as Row[]).map((row) => [row.id as string, row]));
  const tripOf = new Map(((trips ?? []) as Row[]).map((row) => [row.id as string, row]));
  const [riderOf, vadoOf] = await Promise.all([riders(rows.map((row) => row.rider_id)), vados(rows.map((row) => row.captain_id))]);
  return rows.map((row): RatingEntry => {
    const trip = tripOf.get(row.trip_id);
    const booking = bookingOf.get(row.booking_id);
    const travellers = ((booking?.travellers ?? []) as { name: string }[]).map((item) => item.name).join(", ");
    return {
      id: row.booking_id,
      at: row.created_at,
      stars: row.stars,
      tags: row.tags ?? [],
      note: row.note ?? null,
      ref: booking?.pnr ?? trip?.code ?? null,
      route: [trip ? `${cityName(trip.from_city)} → ${cityName(trip.to_city)}` : null, travellers || null].filter(Boolean).join(" · ") || null,
      rider: riderOf.get(row.rider_id) ?? null,
      vado: vadoOf.get(row.captain_id) ?? null,
    };
  });
}

// Support: feedback after a resolved request. The executive who last replied to or closed it before the rating gets the credit.
async function supportFeedback(app: "rider" | "captain", from: string | null) {
  let query = db().from("support_feedback").select("ticket_id,user_id,stars,note,created_at").eq("app", app).order("created_at", { ascending: false }).limit(MAX);
  if (from) query = query.gte("created_at", from);
  const rows = check(await query) as Row[];
  const ids = rows.map((row) => row.ticket_id);
  const [{ data: tickets }, { data: log }] = await Promise.all([
    ids.length ? db().from("support_tickets").select("id,code,topic,status").in("id", ids) : Promise.resolve({ data: [] }),
    ids.length ? controls().from("audit_log").select("admin_id,entity_id,at").in("action", ["ticket.reply", "ticket.update"]).in("entity_id", ids).order("at") : Promise.resolve({ data: [] }),
  ]);
  const admins = [...new Set(((log ?? []) as Row[]).map((row) => row.admin_id).filter(Boolean))];
  const { data: team } = admins.length ? await controls().from("admins").select("id,name").in("id", admins) : { data: [] };
  const nameOf = new Map(((team ?? []) as Row[]).map((row) => [row.id as string, row.name as string]));
  const ticketOf = new Map(((tickets ?? []) as Row[]).map((row) => [row.id as string, row]));
  const people = app === "rider" ? await riders(rows.map((row) => row.user_id)) : await vados(rows.map((row) => row.user_id));
  return rows.map((row): RatingEntry => {
    const work = ((log ?? []) as Row[]).filter((entry) => entry.entity_id === row.ticket_id);
    const credited = [...work].reverse().find((entry) => entry.at <= row.created_at) ?? work.at(-1);
    const ticket = ticketOf.get(row.ticket_id);
    const person = people.get(row.user_id) ?? null;
    return {
      id: row.ticket_id,
      at: row.created_at,
      stars: row.stars,
      tags: [],
      note: row.note ?? null,
      ref: ticket?.code ?? null,
      route: ticket?.topic ?? null,
      rider: app === "rider" ? person : null,
      vado: app === "captain" ? person : null,
      executive: credited?.admin_id ? { id: credited.admin_id, name: nameOf.get(credited.admin_id) ?? "Former team member" } : null,
      ticket: ticket ? { id: ticket.id, code: ticket.code, topic: ticket.topic, status: ticket.status } : null,
    };
  });
}

export const RATING_TITLES = {
  riders: (service: ServiceKey) => `ROVEYA Rider ${service === "taxi" ? "Car Taxi" : SERVICE_INFO[service].short} Rating and Review`,
  vado: (service: ServiceKey) => `ROVEYA Vado ${service === "taxi" ? "Car Taxi" : SERVICE_INFO[service].short} Rating and Review`,
  support: (who: "riders" | "vado") => (who === "riders" ? "Support feedback from Riders" : "Support feedback from Vado"),
};

export async function ratingsFor(side: "riders" | "vado", service: ServiceKey, filter: RatingFilter) {
  const from = since(filter.days);
  const all = side === "riders" ? (service === "carpool" ? await carpoolRiderReviews(from) : await cityRatings("rider", service, from)) : service === "carpool" ? await carpoolVadoRatings(from) : await cityRatings("captain", service, from);
  return { title: RATING_TITLES[side](service), side, service, summary: summarise(all), entries: narrow(all, filter) };
}

export async function supportRatings(who: "riders" | "vado", filter: RatingFilter) {
  const all = await supportFeedback(who === "riders" ? "rider" : "captain", since(filter.days));
  const byExecutive = new Map<string, { id: string; name: string; stars: number[] }>();
  for (const entry of all) {
    if (!entry.executive) continue;
    const item = byExecutive.get(entry.executive.id) ?? { ...entry.executive, stars: [] };
    item.stars.push(entry.stars);
    byExecutive.set(entry.executive.id, item);
  }
  const executives = [...byExecutive.values()]
    .map((item) => ({ id: item.id, name: item.name, count: item.stars.length, average: Math.round((item.stars.reduce((sum, value) => sum + value, 0) / item.stars.length) * 10) / 10, low: item.stars.filter((value) => value <= 2).length }))
    .sort((a, b) => b.count - a.count);
  return { title: RATING_TITLES.support(who), side: "support" as const, who, summary: summarise(all), entries: narrow(all, filter), executives };
}

// Every executive's average from riders and Vado together, for Support desk performance.
export async function supportScores(from: string) {
  const [riders, vado] = await Promise.all([supportFeedback("rider", from), supportFeedback("captain", from)]);
  const scores = new Map<string, number[]>();
  for (const entry of [...riders, ...vado]) if (entry.executive) scores.set(entry.executive.id, [...(scores.get(entry.executive.id) ?? []), entry.stars]);
  const all = [...riders, ...vado].map((entry) => entry.stars);
  const avg = (list: number[]) => (list.length ? Math.round((list.reduce((sum, value) => sum + value, 0) / list.length) * 10) / 10 : null);
  return { average: avg(all), count: all.length, of: (id: string) => ({ average: avg(scores.get(id) ?? []), count: (scores.get(id) ?? []).length }) };
}
