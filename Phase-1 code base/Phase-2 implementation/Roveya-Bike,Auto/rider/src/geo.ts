import { activeFareCard, quoteAmount } from "./fareCard";
import type { Place, VehicleKind } from "./types";

export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earth = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const minutes: Record<VehicleKind, number> = { bike: 1, auto: 1.4, cab: 1.8 };
const cab = { base: 60, perKm: 16, min: 90 };

export function quoteFare(vehicle: VehicleKind, kilometers: number) {
  if (vehicle === "cab") return Math.max(cab.min, Math.round(cab.base + cab.perKm * kilometers));
  return quoteAmount(vehicle, kilometers);
}

export function fareParts(vehicle: VehicleKind, kilometers: number, fare: number) {
  const rate = vehicle === "cab" ? cab : activeFareCard()[vehicle];
  const distance = Math.round(rate.perKm * kilometers);
  return { base: rate.base, perKm: rate.perKm, distance, extra: fare - rate.base - distance };
}

export function quoteEta(vehicle: VehicleKind, kilometers: number) {
  return Math.max(4, Math.round(kilometers * minutes[vehicle] + 3));
}

export function moveToward(from: Place, to: Place, progress: number): { latitude: number; longitude: number } {
  const t = Math.min(1, Math.max(0, progress));
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * t,
    longitude: from.longitude + (to.longitude - from.longitude) * t,
  };
}

export function inr(amount: number) {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}
