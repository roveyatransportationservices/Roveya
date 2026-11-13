import { ApiError, api, live, loadSession, sendCode, signOutRemote, uploadPhoto, verifyCode, watch } from "./backend";
import { SEAT_TEMPLATES, driveMinutes, fareBounds, fromIst, isCaptainChair, istParts, layoutInfo, planPeriodEnd, pointsFor, seatDeltaRupees, suggestedFare, validateSeats, type LayoutKind } from "./rules";
import type { Car, Cycle, DocKind, Earnings, FareHint, Payouts, Plan, Profile, PublishInput, Registration, SeatCell, TripBooking, TripDetail, TripSeat, TripSummary } from "./types";

export type OfflineGender = "Male" | "Female" | null;

export type Service = {
  live: boolean;
  restore(): Promise<Profile | null | "signedOut">;
  sendCode(phone: string): Promise<void>;
  verify(phone: string, code: string): Promise<Profile | null>;
  me(): Promise<Profile | null>;
  register(input: Registration): Promise<Profile>;
  upload(kind: DocKind, uri: string): Promise<void>;
  updateSeats(seats: SeatCell[]): Promise<Car>;
  changeLayout(layout: LayoutKind, seats: SeatCell[]): Promise<Car>;
  block(tripId: string, seats: string[], gender: OfflineGender, note: string): Promise<TripDetail>;
  unblock(tripId: string, seats: string[]): Promise<TripDetail>;
  fareHint(fromId: string, toId: string): Promise<FareHint>;
  publish(input: PublishInput): Promise<TripDetail>;
  trips(scope: "upcoming" | "past"): Promise<TripSummary[]>;
  trip(id: string): Promise<TripDetail>;
  action(id: string, action: "start" | "complete" | "cancel", reason?: string): Promise<TripDetail>;
  board(tripId: string, bookingId: string, boarded: boolean): Promise<TripDetail>;
  rateTraveller(tripId: string, bookingId: string, stars: number): Promise<TripDetail>;
  earnings(range: "today" | "week" | "month"): Promise<Earnings>;
  payouts(): Promise<Payouts>;
  choosePlan(cycle: Cycle): Promise<{ plan: Plan; message: string }>;
  signOut(): Promise<void>;
  watch(tripId: string | null, onChange: () => void): () => void;
  approvePreview?(): Promise<Profile>;
};

// ---------------------------------------------------------------------------
// Live: the ROVEYA API on Supabase
// ---------------------------------------------------------------------------

const remote: Service = {
  live: true,
  async restore() {
    if (!(await loadSession())) return "signedOut";
    try {
      return await remote.me();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return "signedOut";
      throw error;
    }
  },
  async sendCode(phone) {
    await sendCode(phone);
  },
  async verify(phone, code) {
    await verifyCode(phone, code);
    return remote.me();
  },
  async me() {
    try {
      return await api<Profile>("/seats/captain/me");
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) return null;
      throw error;
    }
  },
  register: (input) => api<Profile>("/seats/captain/register", { body: input }),
  upload: (kind, uri) => uploadPhoto(kind, uri),
  updateSeats: async (seats) => (await api<{ car: Car }>("/seats/captain/car", { method: "PATCH", body: { seats } })).car,
  changeLayout: async (layout, seats) => (await api<{ car: Car }>("/seats/captain/car", { method: "PATCH", body: { layout, seats } })).car,
  block: (tripId, seats, gender, note) => api<TripDetail>(`/seats/captain/trips/${tripId}/block`, { body: { seats, gender, note: note.trim() || undefined } }),
  unblock: (tripId, seats) => api<TripDetail>(`/seats/captain/trips/${tripId}/unblock`, { body: { seats } }),
  fareHint: (fromId, toId) => api<FareHint>(`/seats/captain/fare-hint?from=${fromId}&to=${toId}`),
  publish: (input) => api<TripDetail>("/seats/captain/trips", { body: input }),
  trips: async (scope) => {
    try {
      return (await api<{ trips: TripSummary[] }>(`/seats/captain/trips?scope=${scope}`)).trips;
    } catch (error) {
      return offline(error, () => preview.trips(scope));
    }
  },
  trip: async (id) => {
    try {
      return await api<TripDetail>(`/seats/captain/trips/${id}`);
    } catch (error) {
      return offline(error, () => preview.trip(id));
    }
  },
  action: async (id, action, reason) => {
    try {
      return await api<TripDetail>(`/seats/captain/trips/${id}/${action}`, { body: action === "cancel" ? { reason } : {} });
    } catch (error) {
      return offline(error, () => preview.action(id, action, reason));
    }
  },
  board: async (tripId, bookingId, boarded) => {
    try {
      return await api<TripDetail>(`/seats/captain/trips/${tripId}/board`, { body: { bookingId, boarded } });
    } catch (error) {
      return offline(error, () => preview.board(tripId, bookingId, boarded));
    }
  },
  rateTraveller: async (tripId, bookingId, stars) => {
    try {
      return await api<TripDetail>(`/seats/captain/trips/${tripId}/rate`, { body: { bookingId, stars } });
    } catch (error) {
      return offline(error, () => preview.rateTraveller(tripId, bookingId, stars));
    }
  },
  earnings: async (range) => {
    try {
      return await api<Earnings>(`/seats/captain/earnings?range=${range}`);
    } catch (error) {
      return offline(error, () => preview.earnings(range));
    }
  },
  payouts: async () => {
    try {
      return await api<Payouts>("/seats/captain/payouts");
    } catch (error) {
      return offline(error, () => preview.payouts());
    }
  },
  choosePlan: (cycle) => api<{ plan: Plan; message: string }>("/seats/captain/payouts", { body: { cycle } }),
  signOut: () => signOutRemote(),
  watch(tripId, onChange) {
    if (tripId) {
      const stopSeats = watch("seat_trip_seats", `trip_id=eq.${tripId}`, onChange);
      const stopBookings = watch("seat_bookings", `trip_id=eq.${tripId}`, onChange);
      return () => {
        stopSeats();
        stopBookings();
      };
    }
    return watch("seat_bookings", "", onChange);
  },
};

// ---------------------------------------------------------------------------
// Preview: the same flows on the phone, with travellers booking on their own
// ---------------------------------------------------------------------------

type DemoTrip = { summary: TripSummary; seats: TripSeat[]; bookings: TripBooking[] };

const wait = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms));
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

const state: { phone: string; signedIn: boolean; profile: Profile | null; trips: DemoTrip[]; ledger: Earnings["entries"]; payouts: Payouts["payouts"] } = {
  phone: "",
  signedIn: false,
  profile: null,
  trips: [],
  ledger: [],
  payouts: [],
};

const names: [string, "Male" | "Female"][] = [
  ["Priya Reddy", "Female"],
  ["Rahul Varma", "Male"],
  ["Sneha Rao", "Female"],
  ["Kiran Kumar", "Male"],
  ["Anjali Devi", "Female"],
  ["Vikram Goud", "Male"],
];

function stop(point: { id: string; name: string; landmark: string }, depart: Date, offsetMin: number, date: string) {
  const parts = istParts(new Date(depart.getTime() + offsetMin * 60000));
  return { id: point.id, name: point.name, landmark: point.landmark, time: parts.time, dayOffset: parts.date > date ? 1 : 0 };
}

function totals(trip: DemoTrip) {
  const live = trip.bookings.filter((booking) => booking.status !== "cancelled");
  const fare = live.reduce((sum, booking) => sum + booking.fare, 0);
  const commission = Math.round(fare * 0.1);
  return {
    booked: live.reduce((sum, booking) => sum + booking.seats.length, 0),
    offline: trip.seats.filter((seat) => seat.status === "offline").length,
    free: trip.seats.filter((seat) => seat.status === "available").length,
    seats: trip.seats.length,
    fare,
    commission,
    earning: fare - commission,
  };
}

function detail(trip: DemoTrip): TripDetail {
  const sum = totals(trip);
  const summary = { ...trip.summary, booked: sum.booked, revenue: sum.fare, seatsLeft: sum.free };
  trip.summary = summary;
  return JSON.parse(JSON.stringify({ trip: summary, seats: trip.seats, bookings: trip.bookings, totals: sum })) as TripDetail;
}

function makeTrip(input: PublishInput, car: Car): DemoTrip {
  const depart = fromIst(input.date, input.time) ?? new Date(Date.now() + 3 * 3600000);
  const drive = input.durationMin ?? driveMinutes(input.fromId, input.toId);
  const lastBoard = Math.max(0, ...input.boarding.map((point) => point.offsetMin));
  const arrive = new Date(depart.getTime() + (lastBoard + drive) * 60000);
  const seats: TripSeat[] = car.seats.map((seat) => ({
    id: seat.id,
    label: seat.label,
    row: seat.row,
    col: seat.col,
    window: seat.window,
    chair: isCaptainChair(car.layout, seat.row),
    price: Math.max(99, input.fare + seatDeltaRupees(seat, car.layout)),
    status: "available",
    gender: null,
    pnr: null,
    passenger: null,
    boarded: false,
  }));
  const id = `demo-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  return {
    summary: {
      id,
      code: `RVT-${50000 + state.trips.length + 1}`,
      fromId: input.fromId,
      toId: input.toId,
      date: input.date,
      departAt: input.time,
      arriveAt: istParts(arrive).time,
      durationMin: Math.round((arrive.getTime() - depart.getTime()) / 60000),
      status: "scheduled",
      fare: Math.min(...seats.map((seat) => seat.price)),
      seatsLeft: seats.length,
      seats: seats.map((seat) => ({ id: seat.id, label: seat.label, row: seat.row, col: seat.col, price: seat.price, state: "available", window: seat.window })),
      boarding: input.boarding.map((point) => stop(point, depart, point.offsetMin, input.date)),
      drops: input.drops.map((point, index) => stop(point, depart, lastBoard + drive - 20 + index * 10, input.date)),
      womenFriendly: input.womenFriendly,
      booked: 0,
      revenue: 0,
    },
    seats,
    bookings: [],
  };
}

// Stands in for a traveller booking from the users app.
function simulateBooking(trip: DemoTrip, count = 1) {
  const free = trip.seats.filter((seat) => seat.status === "available");
  if (!free.length || trip.summary.status !== "scheduled") return;
  const [name, gender] = names[(state.trips.indexOf(trip) * 3 + trip.bookings.length) % names.length];
  const picked = free.slice(0, Math.min(count, free.length));
  const pnr = `RVY${482100 + Math.floor(Math.random() * 9000)}`;
  const travellers = picked.map((seat, index) => ({ seatId: seat.id, name: index === 0 ? name : `${name.split(" ")[0]}'s friend`, age: 22 + index * 5, gender: index === 0 ? gender : ("Male" as const) }));
  for (const seat of picked) {
    const traveller = travellers.find((item) => item.seatId === seat.id)!;
    Object.assign(seat, { status: "booked", gender: traveller.gender, pnr, passenger: { name: traveller.name, age: traveller.age, gender: traveller.gender } });
  }
  trip.bookings.push({
    id: `${pnr}-b`,
    pnr,
    status: "confirmed",
    seats: picked.map((seat) => seat.id),
    travellers,
    boarding: trip.summary.boarding[0],
    drop: trip.summary.drops[trip.summary.drops.length - 1],
    phone: `98${String(48000000 + Math.floor(Math.random() * 999999)).slice(0, 8)}`,
    boarded: false,
    fare: picked.reduce((sum, seat) => sum + seat.price, 0),
  });
  notify();
}

function seedTrips(car: Car) {
  const soon = istParts(new Date(Math.ceil((Date.now() + 3 * 3600000) / (15 * 60000)) * 15 * 60000));
  const tomorrow = istParts(new Date(Date.now() + 24 * 3600000)).date;
  const hint = (fromId: string, toId: string) => ({ boarding: pointsFor(fromId).slice(0, 2).map((point, index) => ({ ...point, offsetMin: index * 15 })), drops: pointsFor(toId).slice(0, 2).map((point, index) => ({ ...point, offsetMin: index * 10 })) });
  const first = makeTrip({ fromId: "hyd", toId: "vja", date: soon.date, time: soon.time, fare: suggestedFare("hyd", "vja", car.carClass), womenFriendly: true, ...hint("hyd", "vja") }, car);
  const second = makeTrip({ fromId: "vja", toId: "hyd", date: tomorrow, time: "06:30", fare: suggestedFare("vja", "hyd", car.carClass), womenFriendly: false, ...hint("vja", "hyd") }, car);
  state.trips = [first, second];
  simulateBooking(first, 1);
  simulateBooking(first, 2);
  simulateBooking(second, 1);
  state.ledger = [{ id: 1, kind: "seat_earning", amount: 1240, note: "Seats on RVT-49988", at: new Date(Date.now() - 2 * 86400000).toISOString() }];
  state.payouts = [{ id: "p1", amount: 3860, status: "paid", reference: "UTR 4821 0091", cycle: "weekly", periodStart: new Date(Date.now() - 14 * 86400000).toISOString(), periodEnd: new Date(Date.now() - 7 * 86400000).toISOString(), at: new Date(Date.now() - 7 * 86400000).toISOString(), paidAt: new Date(Date.now() - 6 * 86400000).toISOString() }];
}

function needProfile() {
  if (!state.profile) throw new Error("Register as a captain first.");
  return state.profile;
}

export function rememberCaptain(profile: Profile) {
  state.signedIn = true;
  state.profile = profile;
  if (profile.captain.status === "active" && profile.car && state.trips.length === 0) seedTrips(profile.car);
}

function offline<T>(error: unknown, fallback: () => Promise<T>) {
  if (error instanceof ApiError && error.status === 0) return fallback();
  throw error;
}

function demoTrip(id: string) {
  const trip = state.trips.find((item) => item.summary.id === id);
  if (!trip) throw new Error("Trip not found.");
  return trip;
}

const preview: Service = {
  live: false,
  async restore() {
    return state.signedIn ? state.profile : "signedOut";
  },
  async sendCode(phone) {
    await wait(700);
    state.phone = phone;
  },
  async verify(phone, code) {
    await wait(700);
    if (code !== "1234") throw new Error("That code does not match. Use 1234 in this preview.");
    state.phone = phone;
    state.signedIn = true;
    return state.profile;
  },
  async me() {
    return state.profile;
  },
  async register(input) {
    await wait(1100);
    const kind = input.car.layout;
    const problem = validateSeats(kind, input.car.seats);
    if (problem) throw new Error(problem);
    const start = new Date();
    state.profile = {
      captain: { user_id: "preview", captain_code: "RC100421", phone: state.phone, name: input.name, city: input.city, status: "review", rating: 5, bank_last4: input.accountNumber.slice(-4), email: input.email, emergency_name: input.emergencyName, emergency_phone: input.emergencyPhone },
      car: { id: "car-preview", makeModel: input.car.makeModel, carClass: input.car.carClass, plate: input.car.plate, color: input.car.color, year: input.car.year, ac: input.car.ac, amenities: input.car.amenities, layout: kind, layoutTitle: layoutInfo(kind).title, seatCount: input.car.seats.length, seats: input.car.seats, status: "review", reviewNote: null },
      documents: [],
      plan: { cycle: input.payoutCycle, pendingCycle: null, periodStart: start.toISOString(), periodEnd: planPeriodEnd(input.payoutCycle, start).toISOString() },
      balance: 0,
      verification: { minutes: 45, startedAt: start.toISOString(), dueAt: new Date(start.getTime() + 45 * 60000).toISOString() },
    };
    return state.profile;
  },
  async upload(kind) {
    await wait(1200);
    const profile = needProfile();
    profile.documents = [...profile.documents.filter((doc) => doc.kind !== kind), { kind, status: "uploaded", review_note: null, updated_at: new Date().toISOString() }];
  },
  async updateSeats(seats) {
    await wait(600);
    const profile = needProfile();
    if (!profile.car) throw new Error("Add your car first.");
    const problem = validateSeats(profile.car.layout, seats);
    if (problem) throw new Error(problem);
    profile.car = { ...profile.car, seats };
    return profile.car;
  },
  async changeLayout(layout, seats) {
    await wait(700);
    const profile = needProfile();
    if (!profile.car) throw new Error("Add your car first.");
    const problem = validateSeats(layout, seats);
    if (problem) throw new Error(problem);
    const changed = layout !== profile.car.layout;
    profile.car = {
      ...profile.car,
      layout,
      layoutTitle: layoutInfo(layout).title,
      seats,
      seatCount: seats.length,
      ...(changed && profile.car.status === "active" ? { status: "review" as const, reviewNote: `Seat layout changed to ${layoutInfo(layout).title}. ROVEYA checks the car photos again before new trips.` } : null),
    };
    return profile.car;
  },
  async block(tripId, seats, gender, note) {
    await wait(500);
    const trip = demoTrip(tripId);
    if (!["scheduled", "on_trip"].includes(trip.summary.status)) throw new Error("This trip is no longer taking bookings.");
    for (const id of seats) {
      const seat = trip.seats.find((item) => item.id === id);
      if (!seat) throw new Error("One of these seats is not in this car.");
      if (seat.status !== "available") throw new Error("That seat is already booked, or a traveller is paying for it right now. Pick a free seat.");
      const besideWoman = trip.seats.some((other) => other.status !== "available" && other.gender === "Female" && other.row === seat.row && Math.abs(other.col - seat.col) === 1);
      if (besideWoman && gender !== "Female") throw new Error("That seat is beside a woman traveller. Mark it only for a woman passenger.");
    }
    trip.seats = trip.seats.map((seat) => (seats.includes(seat.id) ? { ...seat, status: "offline", gender, offlineNote: note.trim() || null } : seat));
    notify();
    return detail(trip);
  },
  async unblock(tripId, seats) {
    await wait(400);
    const trip = demoTrip(tripId);
    trip.seats = trip.seats.map((seat) => (seats.includes(seat.id) && seat.status === "offline" ? { ...seat, status: "available", gender: null, offlineNote: null } : seat));
    notify();
    return detail(trip);
  },
  async fareHint(fromId, toId) {
    await wait(300);
    const carClass = state.profile?.car?.carClass ?? "Sedan";
    return { suggested: suggestedFare(fromId, toId, carClass), bounds: fareBounds(fromId, toId), durationMin: driveMinutes(fromId, toId), boarding: pointsFor(fromId), drops: pointsFor(toId) };
  },
  async publish(input) {
    await wait(900);
    const profile = needProfile();
    if (profile.captain.status !== "active" || !profile.car) throw new Error("Your documents are still in review.");
    const trip = makeTrip(input, profile.car);
    state.trips.unshift(trip);
    setTimeout(() => simulateBooking(trip, 1), 6000);
    setTimeout(() => simulateBooking(trip, 2), 14000);
    return detail(trip);
  },
  async trips(scope) {
    await wait(500);
    return state.trips
      .filter((trip) => (scope === "upcoming" ? ["scheduled", "on_trip"].includes(trip.summary.status) : ["completed", "cancelled"].includes(trip.summary.status)))
      .map((trip) => detail(trip).trip);
  },
  async trip(id) {
    await wait(300);
    return detail(demoTrip(id));
  },
  async action(id, action, reason) {
    await wait(700);
    const trip = demoTrip(id);
    if (action === "start") trip.summary.status = "on_trip";
    if (action === "complete") {
      trip.summary.status = "completed";
      const earning = totals(trip).earning;
      if (earning > 0) {
        state.ledger.unshift({ id: Date.now(), kind: "seat_earning", amount: earning, note: `Seats on ${trip.summary.code}`, at: new Date().toISOString() });
        needProfile().balance += earning;
      }
    }
    if (action === "cancel") {
      if (!reason || reason.length < 4) throw new Error("Tell travellers why the trip is cancelled.");
      trip.summary.status = "cancelled";
      trip.bookings = trip.bookings.map((booking) => ({ ...booking, status: "cancelled" }));
      trip.seats = trip.seats.map((seat) => ({ ...seat, status: "available", gender: null, pnr: null, passenger: null }));
    }
    notify();
    return detail(trip);
  },
  async rateTraveller(tripId, bookingId, stars) {
    await wait(300);
    const trip = demoTrip(tripId);
    const booking = trip.bookings.find((item) => item.id === bookingId);
    if (booking) booking.myRating = stars;
    return detail(trip);
  },
  async board(tripId, bookingId, boarded) {
    await wait(300);
    const trip = demoTrip(tripId);
    const booking = trip.bookings.find((item) => item.id === bookingId);
    if (booking) {
      booking.boarded = boarded;
      trip.seats = trip.seats.map((seat) => (booking.seats.includes(seat.id) ? { ...seat, boarded } : seat));
    }
    return detail(trip);
  },
  async earnings(range) {
    await wait(500);
    const since = range === "today" ? 86400000 : range === "week" ? 7 * 86400000 : 31 * 86400000;
    const entries = state.ledger.filter((entry) => Date.now() - Date.parse(entry.at) < since);
    return {
      range,
      earned: entries.filter((entry) => entry.kind === "seat_earning").reduce((sum, entry) => sum + entry.amount, 0),
      completed: state.trips.filter((trip) => trip.summary.status === "completed").length,
      cancelled: state.trips.filter((trip) => trip.summary.status === "cancelled").length,
      entries,
    };
  },
  async payouts() {
    await wait(500);
    const profile = needProfile();
    return { plan: profile.plan, balance: profile.balance, bankLast4: profile.captain.bank_last4, payouts: state.payouts };
  },
  async choosePlan(cycle) {
    await wait(600);
    const profile = needProfile();
    const plan = profile.plan!;
    profile.plan = { ...plan, pendingCycle: cycle === plan.cycle ? null : cycle };
    const until = istParts(new Date(plan.periodEnd)).date;
    return { plan: profile.plan, message: profile.plan.pendingCycle ? `Your ${plan.cycle} cycle runs until ${until}. ${cycle[0].toUpperCase()}${cycle.slice(1)} payouts start right after.` : `You stay on ${plan.cycle} payouts.` };
  },
  async signOut() {
    state.signedIn = false;
  },
  watch(_tripId, onChange) {
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  },
  async approvePreview() {
    await wait(800);
    const profile = needProfile();
    profile.captain = { ...profile.captain, status: "active" };
    if (profile.car) profile.car = { ...profile.car, status: "active" };
    profile.documents = profile.documents.map((doc) => ({ ...doc, status: "verified" }));
    if (!state.trips.length && profile.car) seedTrips(profile.car);
    return profile;
  },
};

export const service: Service = live ? remote : preview;

export function templateSeats(layout: LayoutKind): SeatCell[] {
  return SEAT_TEMPLATES[layout].map((seat) => ({ ...seat }));
}
