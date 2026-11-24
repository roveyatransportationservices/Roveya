import { z } from "zod";
import { check, readBody, route, search, term } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { limitUnlessReplay } from "@/lib/server/rateLimit";
import { createCityRide } from "@/lib/server/bookings";
import { istStart, people, shiftIst, type Row } from "@/lib/server/data";
import { db } from "@/lib/server/db";
import { OPEN, rideLine, STATUSES, VEHICLES } from "@/lib/server/rides";

// ROVEYA Bike and ROVEYA Auto rides, newest first.
export const GET = route(async (req) => {
  await requireAdmin("view.rides");
  const { get, from, to, page, size } = search(req);
  let query = db().from("trips").select("*", { count: "exact" }).order("requested_at", { ascending: false }).range(from, to);
  const vehicle = get("vehicle");
  if (vehicle && (VEHICLES as readonly string[]).includes(vehicle)) query = query.eq("vehicle", vehicle);
  const status = get("status");
  if (status === "open") query = query.in("status", OPEN);
  else if (status && STATUSES.includes(status)) query = query.eq("status", status);
  const day = get("from");
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) query = query.gte("requested_at", istStart(day));
  const until = get("to");
  if (until && /^\d{4}-\d{2}-\d{2}$/.test(until)) query = query.lt("requested_at", istStart(shiftIst(until, 1)));
  const captain = get("captain");
  if (captain) query = query.eq("captain_id", captain);
  const rider = get("rider");
  if (rider) query = query.eq("rider_id", rider);
  const needle = term(get("q"));
  if (/^[6-9]\d{9}$/.test(needle)) {
    const [riders, captains] = await Promise.all([db().from("riders").select("user_id").eq("phone", needle), db().from("captains").select("user_id").eq("phone", needle)]);
    const ids = [...(riders.data ?? []), ...(captains.data ?? [])].map((row) => row.user_id);
    if (!ids.length) return { rides: [], total: 0, page, size };
    query = query.or(ids.map((id) => `rider_id.eq.${id},captain_id.eq.${id}`).join(","));
  } else if (needle) {
    query = query.or(`code.ilike.%${needle}%,pickup_name.ilike.%${needle}%,drop_name.ilike.%${needle}%`);
  }
  const result = await query;
  const rows = check(result) as Row[];
  const who = await people(rows.flatMap((row) => [row.rider_id, row.captain_id]));
  return {
    rides: rows.map((row) => ({ ...rideLine(row), rider: who.get(row.rider_id) ?? null, captain: row.captain_id ? (who.get(row.captain_id) ?? null) : null })),
    total: result.count ?? 0,
    page,
    size,
  };
});

const place = z.object({ name: z.string().trim().min(2, "Pick the place from the search.").max(120), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });
const create = z.object({
  vehicle: z.enum(["bike", "auto", "cab"]),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter the passenger's 10-digit mobile number."),
  pickup: place,
  drop: place,
  payment: z.enum(["cash", "upi"], { errorMap: () => ({ message: "Choose cash or UPI paid to the captain." }) }),
  requestKey: z.string().regex(/^[A-Za-z0-9_.:-]{8,80}$/, "The booking key is not valid.").optional(),
});

// The desk books a bike or auto ride for a passenger who called in.
export const POST = route(async (req) => {
  const admin = await requireAdmin("rides.manage");
  const input = await readBody(req, create);
  const existing = input.requestKey ? await db().from("trips").select("id").eq("request_key", input.requestKey).maybeSingle() : { data: null };
  await limitUnlessReplay("desk-book", admin.id, 30, 60, "Too many desk bookings. Wait a minute and try again.", Boolean(existing.data));
  const trip = await createCityRide(input);
  await audit(admin, "ride.create", "ride", trip.id, { code: trip.code, vehicle: trip.vehicle, phone: input.phone, pickup: input.pickup.name, drop: input.drop.name, payment: input.payment, farePaise: trip.fare_paise });
  return { ride: rideLine(trip) };
});
