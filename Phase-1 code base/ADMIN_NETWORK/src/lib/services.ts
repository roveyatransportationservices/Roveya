// The four ROVEYA services, as the admin panel names them.
// Bike, Auto and Taxi are city rides (public.trips, by vehicle); Carpool Travels is seat booking (seat_*).
export const SERVICE_KEYS = ["bike", "auto", "taxi", "carpool"] as const;
export type ServiceKey = (typeof SERVICE_KEYS)[number];

export const SERVICE_INFO: Record<ServiceKey, { name: string; short: string; vehicle: "bike" | "auto" | "cab" | null; soon?: boolean }> = {
  bike: { name: "ROVEYA Bike", short: "Bike", vehicle: "bike" },
  auto: { name: "ROVEYA Auto", short: "Auto", vehicle: "auto" },
  taxi: { name: "ROVEYA Taxi", short: "Taxi", vehicle: "cab", soon: true },
  carpool: { name: "ROVEYA Carpool Travels", short: "Carpool", vehicle: null },
};

export const isService = (value: string | null | undefined): value is ServiceKey => (SERVICE_KEYS as readonly string[]).includes(value ?? "");

// Riders are the passengers who travel; Vado are the captains who drive them.
export const ridersTitle = (key: ServiceKey) => `${SERVICE_INFO[key].name} Riders`;
export const vadoTitle = (key: ServiceKey) => `${SERVICE_INFO[key].name} Vado`;
export const bookingsTitle = (key: ServiceKey) => `ROVEYA ${SERVICE_INFO[key].short} Bookings`;

export function serviceOfCaptain(row: { service?: string | null; vehicle?: string | null }): ServiceKey {
  if (row.service === "seats") return "carpool";
  if (row.vehicle === "cab") return "taxi";
  return row.vehicle === "auto" ? "auto" : "bike";
}

export const serviceOfVehicle = (vehicle: string | null | undefined): ServiceKey => (vehicle === "cab" ? "taxi" : vehicle === "auto" ? "auto" : "bike");
