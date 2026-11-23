// Dispatch rules shared by the ride API and the tests. No database calls live here.

export type DispatchSettings = {
  offerSeconds: number;
  radiiKm: number[];
  searchSeconds: number;
  gpsFreshSeconds: number;
  batch: number;
};

export const DISPATCH_DEFAULTS: DispatchSettings = {
  offerSeconds: 20,
  radiiKm: [2, 4, 6, 8],
  searchSeconds: 150,
  gpsFreshSeconds: 120,
  batch: 1,
};

export type CaptainAvailability = "OFFLINE" | "AVAILABLE" | "OFFER_PENDING" | "GOING_TO_PICKUP" | "ARRIVED_AT_PICKUP" | "RIDE_IN_PROGRESS" | "TEMPORARILY_UNAVAILABLE" | "SUSPENDED";

export type BookingPhase = "SEARCHING" | "OFFERED" | "CAPTAIN_ARRIVING" | "ARRIVED" | "STARTED" | "COMPLETED" | "CUSTOMER_CANCELLED" | "CAPTAIN_CANCELLED" | "EXPIRED" | "PAYMENT_PENDING" | "PAYMENT_COMPLETED";

const NEXT: Record<string, string[]> = {
  searching: ["assigned", "cancelled", "expired"],
  assigned: ["arrived", "searching", "cancelled"],
  arrived: ["on_trip", "searching", "cancelled"],
  on_trip: ["completed"],
  completed: [],
  cancelled: [],
  expired: [],
};

export function canTransition(from: string, to: string) {
  return (NEXT[from] ?? []).includes(to);
}

export function clampSettings(input: Partial<DispatchSettings>): DispatchSettings {
  const offerSeconds = clamp(input.offerSeconds, 10, 60, DISPATCH_DEFAULTS.offerSeconds);
  const searchSeconds = clamp(input.searchSeconds, 60, 300, DISPATCH_DEFAULTS.searchSeconds);
  const gpsFreshSeconds = clamp(input.gpsFreshSeconds, 30, 180, DISPATCH_DEFAULTS.gpsFreshSeconds);
  const batch = clamp(input.batch, 1, 2, DISPATCH_DEFAULTS.batch);
  const radii = (input.radiiKm ?? DISPATCH_DEFAULTS.radiiKm).map((value) => clamp(value, 1, 15, 2)).slice(0, 4);
  while (radii.length < 4) radii.push(radii[radii.length - 1] ?? 8);
  for (let index = 1; index < radii.length; index += 1) radii[index] = Math.max(radii[index], radii[index - 1]);
  return { offerSeconds, radiiKm: radii, searchSeconds, gpsFreshSeconds, batch };
}

export function parseRadii(value: string) {
  const radii = value.split(",").map((part) => Number(part.trim())).filter((part) => Number.isFinite(part) && part > 0);
  return clampSettings({ radiiKm: radii.length ? radii : undefined }).radiiKm;
}

const clamp = (value: number | undefined, min: number, max: number, fallback: number) => {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
};

// The search starts at 2 km and steps out once per offer window: 2, 4, 6, then 8.
export function searchRadiusKm(elapsedSeconds: number, settings: DispatchSettings = DISPATCH_DEFAULTS) {
  const step = Math.max(1, settings.offerSeconds);
  const index = Math.min(settings.radiiKm.length - 1, Math.max(0, Math.floor(Math.max(0, elapsedSeconds) / step)));
  return settings.radiiKm[index];
}

export function searchExpired(elapsedSeconds: number, settings: DispatchSettings = DISPATCH_DEFAULTS) {
  return elapsedSeconds >= settings.searchSeconds;
}

// A long pickup for a short city ride is not offered. Dead kilometres stay unpaid.
export function pickupTooFar(pickupKm: number, tripKm: number) {
  return pickupKm > 3 && pickupKm > tripKm * 2;
}

export type DispatchCaptain = {
  id: string;
  vehicle: string;
  pickupKm: number;
  approved: boolean;
  fresh: boolean;
  busy: boolean;
  pending: boolean;
};

export function eligibleCaptains(captains: DispatchCaptain[], vehicle: string, radiusKm: number, tripKm: number) {
  return captains
    .filter((captain) => captain.vehicle === vehicle && captain.approved && captain.fresh && !captain.busy && !captain.pending)
    .filter((captain) => captain.pickupKm <= radiusKm && !pickupTooFar(captain.pickupKm, tripKm))
    .sort((a, b) => a.pickupKm - b.pickupKm || a.id.localeCompare(b.id));
}

export function rankCaptains(captains: DispatchCaptain[], vehicle: string, radiusKm: number, tripKm: number, batch = 1) {
  const size = Math.min(2, Math.max(1, batch));
  return eligibleCaptains(captains, vehicle, radiusKm, tripKm).slice(0, size);
}

export function captainAvailability(input: { account: string; online: boolean; gpsFresh: boolean; offerPending: boolean; tripStatus: string | null }): CaptainAvailability {
  if (input.account === "suspended") return "SUSPENDED";
  if (!input.online || input.account !== "active") return "OFFLINE";
  if (input.tripStatus === "on_trip") return "RIDE_IN_PROGRESS";
  if (input.tripStatus === "arrived") return "ARRIVED_AT_PICKUP";
  if (input.tripStatus === "assigned") return "GOING_TO_PICKUP";
  if (input.offerPending) return "OFFER_PENDING";
  if (!input.gpsFresh) return "TEMPORARILY_UNAVAILABLE";
  return "AVAILABLE";
}

export function bookingPhase(input: { status: string; cancelledBy?: string | null; paymentStatus?: string | null; offered?: boolean }): BookingPhase {
  if (input.status === "cancelled") return input.cancelledBy === "captain" ? "CAPTAIN_CANCELLED" : "CUSTOMER_CANCELLED";
  if (input.status === "expired") return "EXPIRED";
  if (input.status === "searching") return input.offered ? "OFFERED" : "SEARCHING";
  if (input.status === "assigned") return "CAPTAIN_ARRIVING";
  if (input.status === "arrived") return "ARRIVED";
  if (input.status === "on_trip") return "STARTED";
  if (input.status === "completed") return input.paymentStatus === "paid" ? "PAYMENT_COMPLETED" : "PAYMENT_PENDING";
  return "SEARCHING";
}

// One trip and one captain. The earlier assignment wins when two writes overlap.
export function assignmentWinner(mineAt: string, othersAt: string[]) {
  return othersAt.every((at) => mineAt <= at);
}

export function pointToSegmentKm(point: { lat: number; lng: number }, from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const rad = (value: number) => (value * Math.PI) / 180;
    const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  };
  const length = km(from, to);
  if (length < 0.05) return km(point, from);
  const steps = 12;
  let best = km(point, from);
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    best = Math.min(best, km(point, { lat: from.lat + (to.lat - from.lat) * t, lng: from.lng + (to.lng - from.lng) * t }));
  }
  return best;
}

export function offRoute(point: { lat: number; lng: number }, pickup: { lat: number; lng: number }, drop: { lat: number; lng: number }) {
  return pointToSegmentKm(point, pickup, drop) > 1.2;
}

export function nearPickup(point: { lat: number; lng: number }, pickup: { lat: number; lng: number }) {
  const rad = (value: number) => (value * Math.PI) / 180;
  const h = Math.sin(rad(pickup.lat - point.lat) / 2) ** 2 + Math.cos(rad(point.lat)) * Math.cos(rad(pickup.lat)) * Math.sin(rad(pickup.lng - point.lng) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) <= 0.08;
}

type SimTrip = { id: string; vehicle: string; lat: number; lng: number; status: string; captainId: string | null; assignedAt: string | null };
type SimCaptain = { id: string; vehicle: string; lat: number; lng: number; approved: boolean; fresh: boolean };

const distance = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const rad = (value: number) => (value * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

// In-memory stand-in for a database transaction. Used to prove the assignment rule under overlap.
export function createDispatchBoard() {
  const trips = new Map<string, SimTrip>();
  const captains: SimCaptain[] = [];
  let chain: Promise<unknown> = Promise.resolve();
  const transact = <T>(work: () => T) => {
    const run = chain.then(work, work);
    chain = run.then(() => undefined, () => undefined);
    return run;
  };
  return {
    addCaptain(captain: SimCaptain) {
      captains.push(captain);
    },
    addTrip(trip: SimTrip) {
      trips.set(trip.id, trip);
    },
    claim(tripId: string, captainId: string, at: string) {
      return transact(() => {
        const trip = trips.get(tripId);
        const captain = captains.find((item) => item.id === captainId);
        if (!trip || !captain || trip.status !== "searching" || trip.captainId) return "trip-taken" as const;
        const busy = [...trips.values()].some((item) => item.captainId === captainId && ["assigned", "arrived", "on_trip"].includes(item.status));
        if (busy || !captain.approved || !captain.fresh || captain.vehicle !== trip.vehicle) return "captain-unavailable" as const;
        trip.status = "assigned";
        trip.captainId = captainId;
        trip.assignedAt = at;
        return "ok" as const;
      });
    },
    resolveOverlap() {
      const byCaptain = new Map<string, SimTrip[]>();
      for (const trip of trips.values()) {
        if (!trip.captainId || trip.status !== "assigned") continue;
        const list = byCaptain.get(trip.captainId) ?? [];
        list.push(trip);
        byCaptain.set(trip.captainId, list);
      }
      for (const list of byCaptain.values()) {
        list.sort((a, b) => String(a.assignedAt).localeCompare(String(b.assignedAt)) || a.id.localeCompare(b.id));
        for (const extra of list.slice(1)) {
          extra.status = "searching";
          extra.captainId = null;
          extra.assignedAt = null;
        }
      }
    },
    snapshot() {
      return [...trips.values()].map((trip) => ({ ...trip }));
    },
  };
}

export function waveFor(trips: SimTrip[], captains: SimCaptain[], settings: DispatchSettings = DISPATCH_DEFAULTS) {
  const pending = new Set<string>();
  const chosen: { tripId: string; captainId: string }[] = [];
  for (const trip of trips.filter((item) => item.status === "searching")) {
    const busy = new Set(trips.filter((item) => item.captainId && ["assigned", "arrived", "on_trip"].includes(item.status)).map((item) => String(item.captainId)));
    const ranked = rankCaptains(
      captains.map((captain) => ({
        id: captain.id,
        vehicle: captain.vehicle,
        pickupKm: distance(captain, trip),
        approved: captain.approved,
        fresh: captain.fresh,
        busy: busy.has(captain.id),
        pending: pending.has(captain.id),
      })),
      trip.vehicle,
      searchRadiusKm(0, settings),
      5,
      settings.batch,
    );
    for (const captain of ranked) {
      pending.add(captain.id);
      chosen.push({ tripId: trip.id, captainId: captain.id });
    }
  }
  return chosen;
}
