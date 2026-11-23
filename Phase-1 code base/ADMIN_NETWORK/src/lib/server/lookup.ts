import "server-only";
import { cityById } from "@/lib/rules";
import { serviceOfCaptain } from "@/lib/services";
import type { Row } from "./data";
import { db } from "./db";

// Desk lookup: one read-only view of a rider or Vado and their recent rides, bookings, tickets and SOS,
// found by mobile number, ride code, carpool trip code, PNR, Vado code or ticket number.

const rupees = (paise: number | null | undefined) => Math.round(Number(paise ?? 0)) / 100;
const route = (from: string, to: string) => `${cityById(from)?.name ?? from.toUpperCase()} → ${cityById(to)?.name ?? to.toUpperCase()}`;
const VEHICLE: Record<string, string> = { bike: "ROVEYA Bike", auto: "ROVEYA Auto", cab: "ROVEYA Taxi" };

async function names(table: "riders" | "captains", ids: (string | null | undefined)[]) {
  const list = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!list.length) return new Map<string, string>();
  const { data } = await db().from(table).select("user_id,name").in("user_id", list);
  return new Map(((data ?? []) as Row[]).map((row) => [row.user_id as string, row.name as string]));
}

const rideView = (row: Row, other: Map<string, string>, side: "rider" | "vado") => ({
  code: row.code as string,
  service: VEHICLE[row.vehicle] ?? row.vehicle,
  status: row.status as string,
  fare: rupees(row.fare_paise),
  payment: row.payment as string,
  paymentStatus: row.payment_status as string,
  from: row.pickup_name as string,
  to: row.drop_name as string,
  at: (row.completed_at ?? row.requested_at) as string,
  cancelReason: (row.cancel_reason as string | null) ?? null,
  with: (side === "rider" ? other.get(row.captain_id) : other.get(row.rider_id)) ?? null,
});

async function common(userId: string, app: "rider" | "captain") {
  const [{ data: wallet }, { data: tickets }, { data: sos }] = await Promise.all([
    db().from("wallets").select("balance_paise").eq("owner_id", userId).maybeSingle(),
    db().from("support_tickets").select("id,code,topic,status,priority,created_at").eq("user_id", userId).eq("app", app).order("created_at", { ascending: false }).limit(10),
    db().from("safety_incidents").select("id,code,kind,status,created_at").eq("raised_by", userId).order("created_at", { ascending: false }).limit(5),
  ]);
  return { wallet: wallet ? rupees(wallet.balance_paise) : null, tickets: tickets ?? [], sos: sos ?? [] };
}

export async function riderProfile(userId: string) {
  const { data: rider } = await db().from("riders").select("user_id,name,phone,email,status,status_note,created_at").eq("user_id", userId).maybeSingle();
  if (!rider) return null;
  const [{ data: rides }, { data: bookings }, { data: intents }, shared] = await Promise.all([
    db().from("trips").select("code,vehicle,status,fare_paise,payment,payment_status,pickup_name,drop_name,requested_at,completed_at,cancel_reason,captain_id,rider_id").eq("rider_id", userId).order("requested_at", { ascending: false }).limit(10),
    db().from("seat_bookings").select("pnr,trip_id,status,total_paise,paid_with,refund_paise,seat_ids,created_at").eq("rider_id", userId).order("created_at", { ascending: false }).limit(10),
    db().from("payment_intents").select("purpose,amount_paise,status,created_at").eq("owner_id", userId).order("created_at", { ascending: false }).limit(6),
    common(userId, "rider"),
  ]);
  const tripIds = [...new Set(((bookings ?? []) as Row[]).map((row) => row.trip_id))];
  const { data: trips } = tripIds.length ? await db().from("seat_trips").select("id,code,from_city,to_city,depart_at").in("id", tripIds) : { data: [] };
  const tripOf = new Map(((trips ?? []) as Row[]).map((row) => [row.id as string, row]));
  const vado = await names("captains", ((rides ?? []) as Row[]).map((row) => row.captain_id));
  const counts = await Promise.all([
    db().from("trips").select("id", { count: "exact", head: true }).eq("rider_id", userId).eq("status", "completed"),
    db().from("seat_bookings").select("id", { count: "exact", head: true }).eq("rider_id", userId).eq("status", "completed"),
  ]);
  return {
    role: "rider" as const,
    id: rider.user_id as string,
    name: (rider.name as string) || "Rider",
    phone: rider.phone as string,
    email: (rider.email as string | null) ?? null,
    status: (rider.status as string) ?? "active",
    statusNote: (rider.status_note as string | null) ?? null,
    joined: rider.created_at as string,
    code: null,
    detail: null,
    totals: { rides: counts[0].count ?? 0, bookings: counts[1].count ?? 0 },
    ...shared,
    rides: ((rides ?? []) as Row[]).map((row) => rideView(row, vado, "rider")),
    bookings: ((bookings ?? []) as Row[]).map((row) => {
      const trip = tripOf.get(row.trip_id);
      return { pnr: row.pnr as string, status: row.status as string, total: rupees(row.total_paise), paidWith: (row.paid_with as string | null) ?? null, refund: rupees(row.refund_paise), seats: (row.seat_ids as string[]).length, trip: trip?.code ?? null, route: trip ? route(trip.from_city, trip.to_city) : null, departs: trip?.depart_at ?? null, at: row.created_at as string };
    }),
    payments: ((intents ?? []) as Row[]).map((row) => ({ purpose: row.purpose as string, amount: rupees(row.amount_paise), status: row.status as string, at: row.created_at as string })),
    carpoolTrips: [],
  };
}

export async function vadoProfile(userId: string) {
  const { data: captain } = await db().from("captains").select("user_id,captain_code,name,phone,email,city,service,vehicle,vehicle_no,vehicle_model,status,status_note,rating,created_at,approved_at").eq("user_id", userId).maybeSingle();
  if (!captain) return null;
  const [{ data: rides }, { data: trips }, shared] = await Promise.all([
    db().from("trips").select("code,vehicle,status,fare_paise,payment,payment_status,pickup_name,drop_name,requested_at,completed_at,cancel_reason,captain_id,rider_id").eq("captain_id", userId).order("requested_at", { ascending: false }).limit(10),
    db().from("seat_trips").select("id,code,from_city,to_city,depart_at,status").eq("captain_id", userId).order("depart_at", { ascending: false }).limit(10),
    common(userId, "captain"),
  ]);
  const tripIds = ((trips ?? []) as Row[]).map((row) => row.id);
  const { data: booked } = tripIds.length ? await db().from("seat_bookings").select("trip_id,seat_ids,status").in("trip_id", tripIds).in("status", ["confirmed", "completed"]) : { data: [] };
  const riderName = await names("riders", ((rides ?? []) as Row[]).map((row) => row.rider_id));
  const counts = await db().from("trips").select("id", { count: "exact", head: true }).eq("captain_id", userId).eq("status", "completed");
  return {
    role: "vado" as const,
    id: captain.user_id as string,
    name: (captain.name as string) || "Vado",
    phone: captain.phone as string,
    email: (captain.email as string | null) ?? null,
    status: captain.status as string,
    statusNote: (captain.status_note as string | null) ?? null,
    joined: captain.created_at as string,
    code: captain.captain_code as string,
    detail: {
      service: serviceOfCaptain(captain),
      city: (captain.city as string) || null,
      vehicle: [captain.vehicle_model, captain.vehicle_no].filter(Boolean).join(" · ") || null,
      rating: Number(captain.rating ?? 0),
      approved: (captain.approved_at as string | null) ?? null,
    },
    totals: { rides: counts.count ?? 0, bookings: ((booked ?? []) as Row[]).length },
    ...shared,
    rides: ((rides ?? []) as Row[]).map((row) => rideView(row, riderName, "vado")),
    bookings: [],
    payments: [],
    carpoolTrips: ((trips ?? []) as Row[]).map((row) => ({
      code: row.code as string,
      route: route(row.from_city, row.to_city),
      departs: row.depart_at as string,
      status: row.status as string,
      seatsBooked: ((booked ?? []) as Row[]).filter((item) => item.trip_id === row.id).reduce((sum, item) => sum + (item.seat_ids as string[]).length, 0),
    })),
  };
}

export type Profile = NonNullable<Awaited<ReturnType<typeof riderProfile>>> | NonNullable<Awaited<ReturnType<typeof vadoProfile>>>;

export async function deskLookup(raw: string) {
  const q = raw.trim().toUpperCase().replace(/\s+/g, "");
  const digits = q.replace(/\D/g, "");
  const result: { query: string; kind: string; profiles: Profile[]; focus: { label: string; lines: [string, string][] } | null } = { query: raw.trim(), kind: "none", profiles: [], focus: null };
  const add = (profile: Profile | null) => {
    if (profile && !result.profiles.some((item) => item.id === profile.id && item.role === profile.role)) result.profiles.push(profile);
  };

  if (/^RV-\d+$/.test(q)) {
    const { data: ride } = await db().from("trips").select("*").eq("code", q).maybeSingle();
    if (ride) {
      result.kind = "ride";
      result.focus = {
        label: `Ride ${ride.code}`,
        lines: [
          ["Service", VEHICLE[ride.vehicle] ?? ride.vehicle],
          ["Status", ride.status],
          ["From", ride.pickup_name],
          ["To", ride.drop_name],
          ["Fare", `₹${rupees(ride.fare_paise)}`],
          ["Payment", `${ride.payment} · ${ride.payment_status}`],
          ["Requested", ride.requested_at],
          ...(ride.cancel_reason ? ([["Cancelled", `${ride.cancelled_by ?? ""} · ${ride.cancel_reason}`]] as [string, string][]) : []),
        ],
      };
      add(await riderProfile(ride.rider_id));
      if (ride.captain_id) add(await vadoProfile(ride.captain_id));
    }
  } else if (/^RVT-\d+$/.test(q)) {
    const { data: trip } = await db().from("seat_trips").select("*").eq("code", q).maybeSingle();
    if (trip) {
      result.kind = "trip";
      const { data: bookings } = await db().from("seat_bookings").select("pnr,rider_id,status,seat_ids").eq("trip_id", trip.id).in("status", ["confirmed", "completed", "cancelled"]);
      const list = (bookings ?? []) as Row[];
      result.focus = {
        label: `Carpool trip ${trip.code}`,
        lines: [
          ["Route", route(trip.from_city, trip.to_city)],
          ["Departs", trip.depart_at],
          ["Status", trip.status],
          ["Bookings", list.map((row) => `${row.pnr} (${row.status}, ${(row.seat_ids as string[]).length} seat${(row.seat_ids as string[]).length === 1 ? "" : "s"})`).join(", ") || "None"],
        ],
      };
      add(await vadoProfile(trip.captain_id));
      for (const row of list.slice(0, 6)) if (row.rider_id) add(await riderProfile(row.rider_id));
    }
  } else if (/^RVY\d+$/.test(q)) {
    const { data: booking } = await db().from("seat_bookings").select("*").eq("pnr", q).maybeSingle();
    if (booking) {
      result.kind = "booking";
      const { data: trip } = await db().from("seat_trips").select("code,captain_id,from_city,to_city,depart_at,status").eq("id", booking.trip_id).maybeSingle();
      result.focus = {
        label: `Booking ${booking.pnr}`,
        lines: [
          ["Trip", trip ? `${trip.code} · ${route(trip.from_city, trip.to_city)}` : "—"],
          ["Departs", trip?.depart_at ?? "—"],
          ["Status", booking.status],
          ["Seats", String((booking.seat_ids as string[]).length)],
          ["Paid", `₹${rupees(booking.total_paise)}${booking.paid_with ? ` · ${booking.paid_with}` : ""}`],
          ...(Number(booking.refund_paise) ? ([["Refunded", `₹${rupees(booking.refund_paise)}`]] as [string, string][]) : []),
        ],
      };
      if (booking.rider_id) add(await riderProfile(booking.rider_id));
      if (trip?.captain_id) add(await vadoProfile(trip.captain_id));
    }
  } else if (/^RC\d+$/.test(q)) {
    const { data: captain } = await db().from("captains").select("user_id").eq("captain_code", q).maybeSingle();
    if (captain) {
      result.kind = "vado";
      add(await vadoProfile(captain.user_id));
    }
  } else if (/^ST-\d+$/.test(q)) {
    const { data: ticket } = await db().from("support_tickets").select("code,topic,status,app,user_id,trip_code,created_at").eq("code", q).maybeSingle();
    if (ticket) {
      result.kind = "ticket";
      result.focus = { label: `Support ticket ${ticket.code}`, lines: [["Topic", ticket.topic], ["Status", ticket.status], ["From", ticket.app === "captain" ? "Vado app" : "Rider app"], ["Trip", ticket.trip_code ?? "—"], ["Opened", ticket.created_at]] };
      if (ticket.user_id) add(ticket.app === "captain" ? await vadoProfile(ticket.user_id) : await riderProfile(ticket.user_id));
    }
  } else if (digits.length >= 10) {
    const phone = digits.slice(-10);
    const [{ data: rider }, { data: captain }] = await Promise.all([db().from("riders").select("user_id").eq("phone", phone).maybeSingle(), db().from("captains").select("user_id").eq("phone", phone).maybeSingle()]);
    result.kind = "phone";
    if (rider) add(await riderProfile(rider.user_id));
    if (captain) add(await vadoProfile(captain.user_id));
  }
  if (!result.profiles.length && result.kind !== "none" && !result.focus) result.kind = "none";
  return result;
}
