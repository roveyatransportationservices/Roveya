import type { CaptainPin } from "./components/RouteMap";
import type { VehicleKind } from "./types";

type Point = { latitude: number; longitude: number };

export const kinds: VehicleKind[] = ["bike", "auto", "cab"];
export const vehiclePhotos: Record<VehicleKind, number> = {
  bike: require("../assets/hero-bike.jpg"),
  auto: require("../assets/hero-auto.jpg"),
  cab: require("../assets/hero-car.jpg"),
};
export const taglines: Record<VehicleKind, string> = { bike: "Quick bike rides", auto: "Hassle-free auto rides", cab: "Comfortable car rides" };
const fleetSize: Record<VehicleKind, number> = { bike: 7, auto: 6, cab: 4 };
const spread: Record<VehicleKind, [number, number]> = { bike: [0.008, 0.024], auto: [0.007, 0.022], cab: [0.008, 0.024] };

function seeded(seed: number) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

export function spawn(center: Point) {
  const random = seeded(Math.round(Math.abs(center.latitude * 1000 + center.longitude * 1000)) + 7);
  const pins: CaptainPin[] = [];
  kinds.forEach((kind) => {
    const [near, far] = spread[kind];
    const offset = random() * Math.PI * 2;
    for (let i = 0; i < fleetSize[kind]; i += 1) {
      const angle = offset + (i / fleetSize[kind]) * Math.PI * 2 + (random() - 0.5) * 0.6;
      const radius = near + random() * (far - near);
      pins.push({ id: `${kind}-${i}`, kind, latitude: center.latitude + Math.sin(angle) * radius, longitude: center.longitude + Math.cos(angle) * radius, heading: Math.round(random() * 360) });
    }
  });
  return pins;
}

function stepAlong(pin: CaptainPin, heading: number, step: number): CaptainPin {
  const radians = (heading * Math.PI) / 180;
  return { ...pin, heading, latitude: pin.latitude + Math.cos(radians) * step, longitude: pin.longitude + Math.sin(radians) * step };
}

export function drift(pins: CaptainPin[]) {
  return pins.map((pin) => stepAlong(pin, (pin.heading + (Math.random() - 0.5) * 50 + 360) % 360, 0.00035 + Math.random() * 0.00035));
}

export function converge(pins: CaptainPin[], target: Point) {
  return pins.map((pin) => {
    const dLat = target.latitude - pin.latitude;
    const dLng = target.longitude - pin.longitude;
    const gap = Math.hypot(dLat, dLng);
    const toward = (Math.atan2(dLng, dLat) * 180) / Math.PI;
    if (gap < 0.0065) return { ...pin, heading: (toward + 90 + (Math.random() - 0.5) * 40 + 360) % 360 };
    const heading = (toward + (Math.random() - 0.5) * 30 + 360) % 360;
    return stepAlong(pin, heading, Math.min(gap - 0.006, 0.0003 + Math.random() * 0.0003));
  });
}
