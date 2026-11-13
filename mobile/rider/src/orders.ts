import { customerNames, DEMO_RIDE_OTP, drops, pickups } from "./data";
import { distanceKm, quoteEta, quoteFare } from "./geo";
import type { Order, Trip, VehicleKind } from "./types";

type Point = { latitude: number; longitude: number };

export const dailyTargets = [
  { orders: 3, reward: 30 },
  { orders: 6, reward: 80 },
  { orders: 10, reward: 150 },
];

export const weeklyTargets = [
  { orders: 20, reward: 300 },
  { orders: 35, reward: 600 },
];

export const PEAK_BONUS = 10;
export const LONG_PICKUP_BONUS = 15;
export const LONG_PICKUP_KM = 2.5;

export const peakWindows = [
  { label: "Morning rush", from: 8, to: 11 },
  { label: "Evening rush", from: 17, to: 21 },
];

export function inPeak(time = new Date()) {
  const hour = time.getHours();
  return peakWindows.find((window) => hour >= window.from && hour < window.to) ?? null;
}

function pick<T>(list: T[]) {
  return list[Math.floor(Math.random() * list.length)];
}

export function makeOrder(vehicle: VehicleKind, near: Point): Order {
  const pickup = pick(pickups);
  const options = drops.filter((place) => distanceKm(pickup, place) > 3);
  const drop = pick(options.length ? options : drops);
  const pickupKm = Math.max(0.4, distanceKm(near, pickup) * 1.3);
  const tripKm = Math.max(2, distanceKm(pickup, drop) * 1.25);
  const bonus = (inPeak() ? PEAK_BONUS : 0) + (pickupKm > LONG_PICKUP_KM ? LONG_PICKUP_BONUS : 0);
  return {
    id: `RV-${String(Date.now()).slice(-4)}`,
    vehicle,
    customer: { name: pick(customerNames), rating: Math.round((4.5 + Math.random() * 0.5) * 10) / 10, rides: 3 + Math.floor(Math.random() * 140) },
    pickup,
    drop,
    pickupKm,
    pickupMin: Math.max(2, Math.round(pickupKm * 3) + 1),
    tripKm,
    tripMin: quoteEta(vehicle, tripKm),
    fare: quoteFare(vehicle, tripKm),
    bonus,
    payment: Math.random() < 0.6 ? "cash" : "online",
    otp: DEMO_RIDE_OTP,
  };
}

export function startOfDay(time = Date.now()) {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function startOfWeek(time = Date.now()) {
  const date = new Date(startOfDay(time));
  const shift = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - shift);
  return date.getTime();
}

export function earned(trip: Trip) {
  return trip.status === "Completed" ? trip.fare + trip.bonus + trip.tip : 0;
}

export function nextTarget<T extends { orders: number }>(targets: T[], done: number) {
  return targets.find((target) => done < target.orders) ?? null;
}
