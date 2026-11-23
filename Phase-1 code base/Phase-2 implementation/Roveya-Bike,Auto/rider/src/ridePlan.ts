// Keep in step with users-app/src/ridePlan.ts.
export type RidePlanMode = "subscription" | "commission";
export type RideVehicle = "bike" | "auto";

export type RidePlan = {
  mode: RidePlanMode;
  bikeDay: number;
  bikeMonth: number;
  autoDay: number;
  autoMonth: number;
  commissionPct: number;
  bikePassengerFee: number;
  autoPassengerFee: number;
};

export const DEFAULT_RIDE_PLAN: RidePlan = {
  mode: "subscription",
  bikeDay: 10,
  bikeMonth: 270,
  autoDay: 12,
  autoMonth: 280,
  commissionPct: 10,
  bikePassengerFee: 0,
  autoPassengerFee: 0,
};

const money = (value: unknown, fallback: number, max: number) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return fallback;
  return Math.min(max, Math.max(0, Math.round(amount)));
};

export function normalizeRidePlan(input: Partial<RidePlan> | null | undefined): RidePlan {
  return {
    mode: input?.mode === "commission" ? "commission" : "subscription",
    bikeDay: money(input?.bikeDay, DEFAULT_RIDE_PLAN.bikeDay, 200),
    bikeMonth: money(input?.bikeMonth, DEFAULT_RIDE_PLAN.bikeMonth, 5000),
    autoDay: money(input?.autoDay, DEFAULT_RIDE_PLAN.autoDay, 200),
    autoMonth: money(input?.autoMonth, DEFAULT_RIDE_PLAN.autoMonth, 5000),
    commissionPct: money(input?.commissionPct, DEFAULT_RIDE_PLAN.commissionPct, 40),
    bikePassengerFee: money(input?.bikePassengerFee, 0, 50),
    autoPassengerFee: money(input?.autoPassengerFee, 0, 50),
  };
}

export type RideBill = {
  fare: number;
  passengerFee: number;
  passengerPays: number;
  commission: number;
  captainReceives: number;
};

export function rideBill(vehicle: RideVehicle, fare: number, plan: RidePlan = activePlan): RideBill {
  const price = Math.max(0, Math.round(Number(fare) || 0));
  const passengerFee = vehicle === "bike" ? plan.bikePassengerFee : plan.autoPassengerFee;
  const commission = plan.mode === "commission" ? Math.round((price * plan.commissionPct) / 100) : 0;
  return { fare: price, passengerFee, passengerPays: price + passengerFee, commission, captainReceives: price - commission };
}

export function captainAccess(vehicle: RideVehicle, plan: RidePlan = activePlan) {
  if (plan.mode === "commission") return { mode: "commission" as const, day: 0, month: 0, commissionPct: plan.commissionPct };
  return vehicle === "bike"
    ? { mode: "subscription" as const, day: plan.bikeDay, month: plan.bikeMonth, commissionPct: 0 }
    : { mode: "subscription" as const, day: plan.autoDay, month: plan.autoMonth, commissionPct: 0 };
}

let activePlan = DEFAULT_RIDE_PLAN;

export function activeRidePlan() {
  return activePlan;
}

export async function refreshRidePlan() {
  const base = (process.env.EXPO_PUBLIC_ADMIN_URL || process.env.EXPO_PUBLIC_API_URL || "http://localhost:3006").replace(/\/$/, "");
  const response = await fetch(`${base}/api/ride-plan`).catch(() => null);
  if (!response?.ok) return activePlan;
  const next = (await response.json().catch(() => null)) as Partial<RidePlan> | null;
  activePlan = normalizeRidePlan(next);
  return activePlan;
}
