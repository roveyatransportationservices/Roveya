import { SERVICE_INFO, type ServiceKey } from "@/lib/services";
import { ApiError } from "./api";
import { balances, type Row } from "./data";
import { controls, db } from "./db";
import { onlyService } from "./services";

// The Payments menu: every passenger (Rider) and captain (Vado) of a service with their money,
// warnings that need a look (possible fraud or a payment problem), and the team's cases.

export type PayRole = "captain" | "rider";
export type Flag = { key: string; label: string; tone: "danger" | "amber" | "sky"; detail: string };

const DAY = 86400000;
const STUCK_MS = 30 * 60 * 1000;

async function chunked<T>(ids: string[], load: (part: string[]) => PromiseLike<{ data: unknown }>) {
  const rows: T[] = [];
  for (let at = 0; at < ids.length; at += 300) rows.push(...((((await load(ids.slice(at, at + 300))).data as T[] | null) ?? []) as T[]));
  return rows;
}
const group = <T extends Row>(rows: T[], key: string) => {
  const map = new Map<string, T[]>();
  for (const row of rows) map.set(String(row[key]), [...(map.get(String(row[key])) ?? []), row]);
  return map;
};
const sumOf = (rows: Row[], kind?: string) => rows.filter((row) => !kind || row.kind === kind).reduce((acc, row) => acc + Number(row.amount_paise), 0);

// Who belongs to this page: captains of the service, or passengers who used it.
async function members(role: PayRole, service: ServiceKey) {
  if (role === "captain") {
    const { data } = await onlyService(db().from("captains").select("user_id,name,phone,captain_code,status,created_at"), service).order("created_at", { ascending: false }).limit(5000);
    return ((data ?? []) as Row[]).map((row) => ({ id: row.user_id as string, name: row.name as string, phone: row.phone as string, code: row.captain_code as string, status: row.status as string }));
  }
  const ids = new Set<string>();
  if (service === "carpool") for (const row of ((await db().from("seat_bookings").select("rider_id").limit(50000)).data ?? []) as Row[]) ids.add(row.rider_id);
  else for (const row of ((await db().from("trips").select("rider_id").eq("vehicle", SERVICE_INFO[service].vehicle).limit(50000)).data ?? []) as Row[]) ids.add(row.rider_id);
  const people = await chunked<Row>([...ids], (part) => db().from("riders").select("user_id,name,phone,status").in("user_id", part));
  return people.map((row) => ({ id: row.user_id as string, name: (row.name as string) || "Passenger", phone: row.phone as string, code: "", status: (row.status as string) || "active" }));
}

// Everything money-related for these people in the period.
async function activity(role: PayRole, service: ServiceKey, ids: string[], since: string) {
  const vehicle = SERVICE_INFO[service].vehicle;
  const [ledger, intents, cases, rides, bookings, payouts, seatTrips] = await Promise.all([
    chunked<Row>(ids, (part) => db().from("ledger_entries").select("owner_id,kind,amount_paise,ref_type,ref_id,created_at").in("owner_id", part).gte("created_at", since).limit(20000)),
    role === "rider" ? chunked<Row>(ids, (part) => db().from("payment_intents").select("owner_id,purpose,status,amount_paise,ref_id,created_at").in("owner_id", part).gte("created_at", since).limit(20000)) : Promise.resolve([] as Row[]),
    controls().from("money_cases").select("owner_id,status").eq("role", role).eq("service", service).neq("status", "resolved").limit(5000),
    vehicle ? chunked<Row>(ids, (part) => db().from("trips").select("id,rider_id,captain_id,status,payment,payment_status,cancelled_by,fare_paise,discount_paise,assigned_at,started_at,completed_at,requested_at").eq("vehicle", vehicle).in(role === "captain" ? "captain_id" : "rider_id", part).gte("requested_at", since).limit(20000)) : Promise.resolve([] as Row[]),
    service === "carpool" && role === "rider" ? chunked<Row>(ids, (part) => db().from("seat_bookings").select("id,rider_id,status,cancelled_by,total_paise,cash_paise,refund_paise,created_at").in("rider_id", part).gte("created_at", since).limit(20000)) : Promise.resolve([] as Row[]),
    role === "captain" ? chunked<Row>(ids, (part) => db().from("payout_requests").select("captain_id,status,amount_paise,created_at").in("captain_id", part).gte("created_at", since).limit(20000)) : Promise.resolve([] as Row[]),
    service === "carpool" && role === "captain" ? chunked<Row>(ids, (part) => db().from("seat_trips").select("id,captain_id,status,cancel_reason,depart_at").in("captain_id", part).gte("depart_at", since).limit(20000)) : Promise.resolve([] as Row[]),
  ]);
  const offline = seatTrips.length ? await chunked<Row>(seatTrips.map((row) => row.id), (part) => db().from("seat_offline_passengers").select("trip_id").in("trip_id", part)) : [];
  return { ledger, intents, cases: (cases.data ?? []) as Row[], rides, bookings, payouts, seatTrips, offline };
}

// A passenger's ROVEYA Cash wallet is shared by every service, so online payments are narrowed
// to this service's rides or bookings (top-ups belong to every service).
function scoped(service: ServiceKey, ledger: Row[], intents: Row[], rides: Row[]) {
  const rideIds = new Set(rides.map((row) => String(row.id)));
  return {
    ledger,
    intents: intents.filter((row) => row.purpose === "wallet_topup" || (service === "carpool" ? row.purpose === "seat_booking" : row.purpose === "trip" && rideIds.has(String(row.ref_id)))),
  };
}

// A payment counts as "not finished" only when what it was for is still unpaid.
function stuckPayments(intents: Row[], rides: Row[], bookings: Row[]) {
  const now = Date.now();
  const paidRefs = new Set(intents.filter((row) => row.status === "paid").map((row) => String(row.ref_id)));
  const settled = (ref: string) => paidRefs.has(ref) || rides.some((row) => String(row.id) === ref && row.payment_status === "paid") || bookings.some((row) => String(row.id) === ref && !["pending", "expired"].includes(row.status));
  return intents.filter((row) => row.status === "created" && Date.parse(row.created_at) < now - STUCK_MS && !(row.ref_id && settled(String(row.ref_id))));
}

function flagsFor(role: PayRole, service: ServiceKey, a: { ledger: Row[]; intents: Row[]; rides: Row[]; bookings: Row[]; payouts: Row[]; seatTrips: Row[]; offline: Row[]; balance: number }): Flag[] {
  const flags: Flag[] = [];
  const adjusted = Math.abs(sumOf(a.ledger, "adjustment"));
  if (adjusted >= 50000) flags.push({ key: "adjusted", label: "Large manual changes", tone: "amber", detail: `₹${Math.round(adjusted / 100)} changed by hand in this period` });
  if (role === "rider") {
    const failed = a.intents.filter((row) => row.status === "failed").length;
    const stuck = stuckPayments(a.intents, a.rides, a.bookings).length;
    if (failed >= 3) flags.push({ key: "failed", label: "Many failed payments", tone: "danger", detail: `${failed} online payments failed` });
    if (stuck) flags.push({ key: "stuck", label: "Payment not finished", tone: "sky", detail: `${stuck} online payment(s) started and never finished. Check with the passenger.` });
    if (a.balance < 0) flags.push({ key: "negative", label: "ROVEYA Cash below zero", tone: "danger", detail: `Balance ₹${Math.round(a.balance / 100)}` });
    if (service === "carpool") {
      const cancels = a.bookings.filter((row) => row.status === "cancelled" && row.cancelled_by === "rider").length;
      const refunds = a.bookings.filter((row) => Number(row.refund_paise ?? 0) > 0).length;
      if (cancels >= 3) flags.push({ key: "cancels", label: "Cancels often", tone: "amber", detail: `${cancels} bookings cancelled by the passenger` });
      if (refunds >= 2) flags.push({ key: "refunds", label: "Many refunds", tone: "amber", detail: `${refunds} refunded bookings` });
    } else {
      // City rides are paid after the ride: there are no refunds, only fares still to be paid.
      const unpaid = a.rides.filter((row) => row.status === "completed" && row.payment_status === "due");
      const cancels = a.rides.filter((row) => row.status === "cancelled" && row.cancelled_by === "rider" && row.assigned_at).length;
      if (unpaid.length) flags.push({ key: "unpaid", label: "Fare not paid", tone: "danger", detail: `${unpaid.length} completed ride(s) still due: ${unpaid.filter((row) => row.payment === "cash").length} cash, ${unpaid.filter((row) => row.payment !== "cash").length} online or ROVEYA Cash` });
      if (cancels >= 3) flags.push({ key: "cancels", label: "Cancels after a captain is sent", tone: "amber", detail: `${cancels} rides cancelled after a captain was assigned` });
    }
  } else {
    const rejected = a.payouts.filter((row) => row.status === "rejected").length;
    const waiting = a.payouts.filter((row) => row.status === "requested");
    if (waiting.length) flags.push({ key: "payout", label: "Payout waiting", tone: "sky", detail: `₹${Math.round(sumOf(waiting) / 100)} waiting to be paid` });
    if (rejected) flags.push({ key: "rejected", label: "Payout rejected", tone: "amber", detail: `${rejected} payout(s) rejected in this period` });
    if (a.balance < 0) flags.push({ key: "owes", label: "Owes commission", tone: "danger", detail: `Wallet at ₹${Math.round(a.balance / 100)}: cash rides commission not yet recovered` });
    if (service === "carpool") {
      const cancelled = a.seatTrips.filter((row) => row.status === "cancelled").length;
      if (cancelled >= 2) flags.push({ key: "cancels", label: "Cancels trips", tone: "amber", detail: `${cancelled} trips cancelled` });
      if (a.offline.length >= 3) flags.push({ key: "offline", label: "Sells seats outside the app", tone: "danger", detail: `${a.offline.length} seats marked as sold outside the app (no commission)` });
    } else {
      const done = a.rides.filter((row) => row.status === "completed");
      const quick = done.filter((row) => row.started_at && row.completed_at && Date.parse(row.completed_at) - Date.parse(row.started_at) < 2 * 60000).length;
      const unpaid = done.filter((row) => row.payment === "cash" && row.payment_status === "due").length;
      const cancels = a.rides.filter((row) => row.status === "cancelled" && row.cancelled_by === "captain").length;
      const same = Math.max(0, ...[...group(done, "rider_id").values()].map((rows) => rows.length));
      if (quick >= 2) flags.push({ key: "quick", label: "Very short rides", tone: "danger", detail: `${quick} rides finished under 2 minutes after the OTP` });
      if (same >= 5) flags.push({ key: "same", label: "Same passenger again and again", tone: "danger", detail: `${same} rides with one passenger` });
      if (unpaid) flags.push({ key: "unpaid", label: "Cash not marked collected", tone: "amber", detail: `${unpaid} completed cash ride(s) still due` });
      if (cancels >= 3) flags.push({ key: "cancels", label: "Cancels rides", tone: "amber", detail: `${cancels} rides cancelled by the captain` });
    }
  }
  return flags;
}

export async function paymentPeople(role: PayRole, service: ServiceKey, days: number) {
  const since = new Date(Date.now() - days * DAY).toISOString();
  const list = await members(role, service);
  const ids = list.map((row) => row.id);
  const [money, wallets] = await Promise.all([activity(role, service, ids, since), balances(ids)]);
  const by = {
    ledger: group(money.ledger, "owner_id"),
    intents: group(money.intents, "owner_id"),
    rides: group(money.rides, role === "captain" ? "captain_id" : "rider_id"),
    bookings: group(money.bookings, "rider_id"),
    payouts: group(money.payouts, "captain_id"),
    seatTrips: group(money.seatTrips, "captain_id"),
  };
  const offlineByTrip = group(money.offline, "trip_id");
  const openCases = group(money.cases, "owner_id");
  const rows = list.map((person) => {
    const rides = by.rides.get(person.id) ?? [];
    const bookings = by.bookings.get(person.id) ?? [];
    const payouts = by.payouts.get(person.id) ?? [];
    const seatTrips = by.seatTrips.get(person.id) ?? [];
    const { ledger, intents } = role === "rider" ? scoped(service, by.ledger.get(person.id) ?? [], by.intents.get(person.id) ?? [], rides) : { ledger: by.ledger.get(person.id) ?? [], intents: [] as Row[] };
    const offline = seatTrips.flatMap((trip) => offlineByTrip.get(trip.id) ?? []);
    const balance = wallets.get(person.id) ?? 0;
    const done = rides.filter((row) => row.status === "completed");
    const numbers =
      role === "captain"
        ? {
            trips: service === "carpool" ? seatTrips.filter((row) => row.status === "completed").length : done.length,
            earnedPaise: sumOf(ledger, service === "carpool" ? "seat_earning" : "ride_earning") + sumOf(ledger, "ride_bonus"),
            cashPaise: done.filter((row) => row.payment === "cash").reduce((acc, row) => acc + Number(row.fare_paise) - Number(row.discount_paise ?? 0), 0),
            commissionPaise: -sumOf(ledger, "commission"),
            payoutWaitingPaise: sumOf(payouts.filter((row) => row.status === "requested")),
            paidOutPaise: sumOf(payouts.filter((row) => row.status === "paid")),
          }
        : {
            trips: service === "carpool" ? bookings.filter((row) => ["confirmed", "completed"].includes(row.status)).length : done.length,
            spentPaise: service === "carpool" ? bookings.filter((row) => ["confirmed", "completed", "cancelled"].includes(row.status)).reduce((acc, row) => acc + Number(row.total_paise) + Number(row.cash_paise), 0) : done.reduce((acc, row) => acc + Number(row.fare_paise) - Number(row.discount_paise ?? 0), 0),
            onlinePaise: sumOf(intents.filter((row) => row.status === "paid")),
            // Carpool seats are paid first and refunded on cancellation; city rides are paid after, so what matters is what is still due.
            refundPaise: service === "carpool" ? bookings.reduce((acc, row) => acc + Number(row.refund_paise ?? 0), 0) : 0,
            duePaise: service === "carpool" ? 0 : done.filter((row) => row.payment_status === "due").reduce((acc, row) => acc + Number(row.fare_paise) - Number(row.discount_paise ?? 0), 0),
            topupPaise: sumOf(ledger, "topup"),
            failedPayments: intents.filter((row) => row.status === "failed").length,
          };
    const lastAt = [...ledger.map((row) => row.created_at), ...intents.map((row) => row.created_at)].sort().at(-1) ?? null;
    return { ...person, balancePaise: balance, numbers, flags: flagsFor(role, service, { ledger, intents, rides, bookings, payouts, seatTrips, offline, balance }), openCases: (openCases.get(person.id) ?? []).length, lastAt };
  });
  rows.sort((a, b) => b.openCases - a.openCases || b.flags.filter((flag) => flag.tone === "danger").length - a.flags.filter((flag) => flag.tone === "danger").length || b.flags.length - a.flags.length || String(b.lastAt ?? "").localeCompare(String(a.lastAt ?? "")));
  const total = (key: string) => rows.reduce((acc, row) => acc + Number((row.numbers as unknown as Record<string, number>)[key] ?? 0), 0);
  const waiting = role === "captain" ? money.payouts.filter((row) => row.status === "requested") : [];
  return {
    role,
    service,
    days,
    totals: {
      people: rows.length,
      flagged: rows.filter((row) => row.flags.some((flag) => flag.tone !== "sky")).length,
      openCases: money.cases.length,
      ...(role === "captain"
        ? { earnedPaise: total("earnedPaise"), cashPaise: total("cashPaise"), commissionPaise: total("commissionPaise"), payoutWaitingPaise: sumOf(waiting), payoutWaiting: waiting.length, paidOutPaise: total("paidOutPaise") }
        : { spentPaise: total("spentPaise"), onlinePaise: total("onlinePaise"), refundPaise: total("refundPaise"), duePaise: total("duePaise"), topupPaise: total("topupPaise"), failedPayments: total("failedPayments") }),
    },
    people: rows,
  };
}

// One person's full money history: wallet ledger, online payments, rides or bookings, payouts and cases.
export async function personPayments(role: PayRole, service: ServiceKey, id: string, days: number) {
  const since = new Date(Date.now() - days * DAY).toISOString();
  const table = role === "captain" ? "captains" : "riders";
  const { data: person } = await db().from(table).select(role === "captain" ? "user_id,name,phone,captain_code,status,service,vehicle,bank_holder,bank_last4,ifsc,upi" : "user_id,name,phone,email,status").eq("user_id", id).maybeSingle();
  if (!person) throw new ApiError(role === "captain" ? "Captain not found." : "Passenger not found.", 404);
  const vehicle = SERVICE_INFO[service].vehicle;
  const [wallet, ledger, intents, rides, bookings, payouts, seatTrips, cases] = await Promise.all([
    balances([id]),
    db().from("ledger_entries").select("id,kind,amount_paise,ref_type,ref_id,note,created_at").eq("owner_id", id).order("id", { ascending: false }).limit(300),
    db().from("payment_intents").select("id,purpose,status,amount_paise,ref_id,razorpay_order_id,razorpay_payment_id,created_at,updated_at").eq("owner_id", id).order("created_at", { ascending: false }).limit(100),
    vehicle ? db().from("trips").select("id,code,vehicle,status,payment,payment_status,cancelled_by,fare_paise,discount_paise,pickup_name,drop_name,requested_at,started_at,completed_at,rider_id,captain_id").eq("vehicle", vehicle).eq(role === "captain" ? "captain_id" : "rider_id", id).order("requested_at", { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
    service === "carpool" && role === "rider" ? db().from("seat_bookings").select("id,pnr,trip_id,status,cancelled_by,total_paise,cash_paise,refund_paise,paid_with,created_at").eq("rider_id", id).order("created_at", { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
    role === "captain" ? db().from("payout_requests").select("id,amount_paise,status,reference,bank_last4,cycle,auto,created_at,decided_at").eq("captain_id", id).order("created_at", { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
    service === "carpool" && role === "captain" ? db().from("seat_trips").select("id,code,status,from_city,to_city,depart_at,cancel_reason").eq("captain_id", id).order("depart_at", { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
    controls().from("money_cases").select("*").eq("owner_id", id).order("created_at", { ascending: false }).limit(50),
  ]);
  const ledgerRows = (ledger.data ?? []) as Row[];
  // Which service each wallet line belongs to, so the team sees where the money came from.
  const tripIds = [...new Set(ledgerRows.filter((row) => row.ref_type === "trip").map((row) => String(row.ref_id)))];
  const { data: tripVehicles } = tripIds.length ? await db().from("trips").select("id,code,vehicle").in("id", tripIds.slice(0, 500)) : { data: [] };
  const tripOf = new Map(((tripVehicles ?? []) as Row[]).map((row) => [row.id as string, row]));
  const seatIds = [...new Set(ledgerRows.filter((row) => row.ref_type === "seat_booking" || row.ref_type === "seat_cash").map((row) => String(row.ref_id)))];
  const { data: seatRows } = seatIds.length ? await db().from("seat_bookings").select("id,pnr").in("id", seatIds.slice(0, 500)) : { data: [] };
  const pnrOf = new Map(((seatRows ?? []) as Row[]).map((row) => [row.id as string, row.pnr as string]));
  const serviceOfVehicle = (value: string) => (value === "cab" ? "taxi" : value);
  const recent = (rows: Row[], field: string) => rows.filter((row) => row[field] >= since);
  const lines = ledgerRows.map((row) => {
    const trip = row.ref_type === "trip" ? tripOf.get(String(row.ref_id)) : null;
    return {
      ...row,
      service: trip ? serviceOfVehicle(trip.vehicle) : row.ref_type?.startsWith("seat") ? "carpool" : null,
      refLabel: trip ? trip.code : pnrOf.get(String(row.ref_id)) ?? null,
      refLink: trip ? `/bookings/${serviceOfVehicle(trip.vehicle)}/${trip.id}` : pnrOf.has(String(row.ref_id)) ? `/bookings/carpool/${row.ref_id}` : null,
    };
  });
  const balance = wallet.get(id) ?? 0;
  const offline = ((seatTrips.data ?? []) as Row[]).length ? (((await db().from("seat_offline_passengers").select("trip_id").in("trip_id", ((seatTrips.data ?? []) as Row[]).map((row) => row.id))).data ?? []) as Row[]) : [];
  const allRides = (rides.data ?? []) as Row[];
  const allBookings = (bookings.data ?? []) as Row[];
  const mine = role === "rider" ? scoped(service, ledgerRows, (intents.data ?? []) as Row[], allRides) : { ledger: ledgerRows, intents: [] as Row[] };
  const stuck = new Set(stuckPayments(mine.intents, allRides, allBookings).map((row) => row.id));
  const flags = flagsFor(role, service, {
    ledger: recent(mine.ledger, "created_at"),
    intents: recent(mine.intents, "created_at"),
    rides: recent(allRides, "requested_at"),
    bookings: recent(allBookings, "created_at"),
    payouts: recent((payouts.data ?? []) as Row[], "created_at"),
    seatTrips: recent((seatTrips.data ?? []) as Row[], "depart_at"),
    offline,
    balance,
  });
  return {
    role,
    service,
    days,
    person,
    balancePaise: balance,
    flags,
    ledger: lines,
    payments: mine.intents.map((row) => ({ ...row, stuck: stuck.has(row.id) })),
    rides: rides.data ?? [],
    bookings: bookings.data ?? [],
    payouts: payouts.data ?? [],
    seatTrips: seatTrips.data ?? [],
    cases: cases.data ?? [],
  };
}

// Carpool seat payments, with the ones that need the team first.
export async function seatPayments(days: number, problemsOnly: boolean) {
  const since = new Date(Date.now() - days * DAY).toISOString();
  const [{ data: bookings }, { data: intents }] = await Promise.all([
    controls().from("seat_booking_facts").select("id,pnr,status,trip_id,trip_code,from_city,to_city,depart_at,rider_id,phone,seats,paid_with,paid_paise,refund_paise,total_paise,created_at,confirmed_at").gte("created_at", since).order("created_at", { ascending: false }).limit(2000),
    db().from("payment_intents").select("id,status,amount_paise,ref_id,razorpay_order_id,razorpay_payment_id,created_at").eq("purpose", "seat_booking").gte("created_at", since).limit(5000),
  ]);
  const byBooking = group((intents ?? []) as Row[], "ref_id");
  const now = Date.now();
  const rows: Row[] = ((bookings ?? []) as Row[]).map((booking) => {
    const tries = byBooking.get(booking.id) ?? [];
    const paidOnline = tries.find((row) => row.status === "paid");
    const issues: Flag[] = [];
    if (paidOnline && !["confirmed", "completed"].includes(booking.status) && !(booking.status === "cancelled" && Number(booking.refund_paise ?? 0) > 0)) issues.push({ key: "paid_not_booked", label: "Paid but not confirmed", tone: "danger", detail: "Razorpay took the money but the seats were not confirmed. Refund or confirm by hand." });
    if (tries.some((row) => row.status === "created" && Date.parse(row.created_at) < now - STUCK_MS) && !paidOnline && ["pending", "expired"].includes(booking.status)) issues.push({ key: "stuck", label: "Payment not finished", tone: "sky", detail: "The passenger started paying online and did not finish." });
    if (tries.filter((row) => row.status === "failed").length >= 2) issues.push({ key: "failed", label: "Failed payments", tone: "amber", detail: `${tries.filter((row) => row.status === "failed").length} failed tries` });
    if (booking.status === "cancelled" && booking.confirmed_at && Number(booking.refund_paise ?? 0) === 0 && Number(booking.paid_paise) > 0) issues.push({ key: "no_refund", label: "Cancelled without refund", tone: "amber", detail: "Check the cancellation slab was right." });
    return { ...booking, attempts: tries.map((row) => ({ id: row.id, status: row.status, amountPaise: row.amount_paise, orderId: row.razorpay_order_id, paymentId: row.razorpay_payment_id, at: row.created_at })), issues };
  });
  const who = new Map((((await chunked<Row>([...new Set(rows.map((row) => row.rider_id))], (part) => db().from("riders").select("user_id,name").in("user_id", part))) ?? []) as Row[]).map((row) => [row.user_id as string, row.name as string]));
  const list: Row[] = rows.map((row) => ({ ...row, riderName: who.get(row.rider_id) ?? null }));
  const shown = problemsOnly ? list.filter((row) => row.issues.length) : list;
  return {
    days,
    totals: {
      bookings: list.length,
      problems: list.filter((row) => row.issues.length).length,
      paidPaise: list.reduce((acc, row) => acc + (["confirmed", "completed", "cancelled"].includes(row.status) && row.confirmed_at ? Number(row.paid_paise) : 0), 0),
      refundPaise: list.reduce((acc, row) => acc + Number(row.refund_paise ?? 0), 0),
      online: list.filter((row) => (row.attempts as Row[]).some((attempt) => attempt.status === "paid")).length,
      wallet: list.filter((row) => row.paid_with === "ROVEYA Cash").length,
      desk: list.filter((row) => String(row.paid_with ?? "").startsWith("Desk")).length,
    },
    bookings: shown.slice(0, 500),
  };
}