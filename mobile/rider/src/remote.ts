import type { Captain, DocKey, Job, Order, VehicleKind } from "./types";

export type ServerCaptain = {
  user_id: string;
  captain_code: string;
  phone: string;
  name: string;
  dob: string;
  gender: string;
  email: string | null;
  city: string;
  vehicle: VehicleKind;
  vehicle_no: string;
  vehicle_model: string;
  vehicle_color: string;
  vehicle_year: string;
  bank_holder: string;
  bank_last4: string;
  ifsc: string;
  upi: string | null;
  emergency_name: string;
  emergency_phone: string;
  status: "review" | "active" | "suspended";
  created_at: string;
};

export type ServerOffer = {
  id: string;
  tripId: string;
  code: string;
  vehicle: VehicleKind;
  pickup: { name: string; latitude: number; longitude: number };
  drop: { name: string; latitude: number; longitude: number };
  pickupKm: number;
  pickupMin: number;
  tripKm: number;
  tripMin: number;
  fare: number;
  collect: number;
  bonus: number;
  payment: "cash" | "online";
  passenger: { name: string; rides: number };
};

export type ServerDocument = { kind: DocKey; status: "uploaded" | "verified" | "rejected"; review_note: string | null };

const docKeys: DocKey[] = ["dlFront", "dlBack", "rc", "aadhaar", "pan", "selfie"];

export function docsFromServer(documents: ServerDocument[]) {
  const docs = Object.fromEntries(docKeys.map((key) => [key, "missing"])) as Captain["docs"];
  const docNotes: Partial<Record<DocKey, string>> = {};
  for (const doc of documents) {
    docs[doc.kind] = doc.status;
    if (doc.status === "rejected" && doc.review_note) docNotes[doc.kind] = doc.review_note;
  }
  return { docs, docNotes };
}

export function captainFromServer(row: ServerCaptain, documents?: ServerDocument[]): Captain {
  const [y, m, d] = row.dob.split("-");
  const status = row.status === "active" ? "verified" : "uploaded";
  const fromServer = documents ? docsFromServer(documents) : null;
  return {
    phone: row.phone,
    name: row.name,
    dob: `${d}/${m}/${y}`,
    gender: row.gender,
    email: row.email ?? "",
    city: row.city,
    vehicle: row.vehicle,
    vehicleNo: row.vehicle_no,
    vehicleModel: row.vehicle_model,
    vehicleColor: row.vehicle_color,
    vehicleYear: row.vehicle_year,
    bankHolder: row.bank_holder,
    bankLast4: row.bank_last4,
    ifsc: row.ifsc,
    upi: row.upi ?? "",
    docs: fromServer?.docs ?? (Object.fromEntries(docKeys.map((key) => [key, key === "pan" ? "missing" : status])) as Captain["docs"]),
    docNotes: fromServer?.docNotes,
    status: row.status === "active" ? "active" : "review",
    captainId: row.captain_code,
    joinedAt: Date.parse(row.created_at),
    emergencyName: row.emergency_name,
    emergencyPhone: row.emergency_phone,
  };
}

export function orderFromServer(offer: ServerOffer): Order {
  return {
    id: offer.code,
    offerId: offer.id,
    tripId: offer.tripId,
    vehicle: offer.vehicle,
    customer: { name: offer.passenger.name, rating: 5, rides: offer.passenger.rides },
    pickup: { id: `p-${offer.tripId}`, name: offer.pickup.name, subtitle: "Pickup", latitude: offer.pickup.latitude, longitude: offer.pickup.longitude },
    drop: { id: `d-${offer.tripId}`, name: offer.drop.name, subtitle: "Drop", latitude: offer.drop.latitude, longitude: offer.drop.longitude },
    pickupKm: offer.pickupKm,
    pickupMin: offer.pickupMin,
    tripKm: offer.tripKm,
    tripMin: offer.tripMin,
    fare: offer.fare,
    collect: offer.collect,
    bonus: offer.bonus,
    payment: offer.payment,
    otp: "",
  };
}

export type ServerTrip = {
  id: string;
  code: string;
  vehicle: VehicleKind;
  status: "assigned" | "arrived" | "on_trip" | "completed" | "cancelled";
  pickup: { name: string; latitude: number; longitude: number };
  drop: { name: string; latitude: number; longitude: number };
  distanceKm: number;
  etaMin: number;
  fare: number;
  collect: number;
  bonus: number;
  payment: "cash" | "wallet" | "online";
  passenger: { name: string };
};

const jobStatus = { assigned: "toPickup", arrived: "arrived", on_trip: "onTrip", completed: "collect", cancelled: "collect" } as const;

export function jobFromServer(trip: ServerTrip): Job {
  return {
    id: trip.code,
    tripId: trip.id,
    vehicle: trip.vehicle,
    customer: { name: trip.passenger.name, rating: 5, rides: 0 },
    pickup: { id: `p-${trip.id}`, name: trip.pickup.name, subtitle: "Pickup", latitude: trip.pickup.latitude, longitude: trip.pickup.longitude },
    drop: { id: `d-${trip.id}`, name: trip.drop.name, subtitle: "Drop", latitude: trip.drop.latitude, longitude: trip.drop.longitude },
    pickupKm: 1,
    pickupMin: 4,
    tripKm: trip.distanceKm,
    tripMin: trip.etaMin,
    fare: trip.fare,
    collect: trip.collect,
    bonus: trip.bonus,
    payment: trip.payment === "cash" ? "cash" : "online",
    otp: "",
    status: jobStatus[trip.status],
  };
}

export function isoDob(ddmmyyyy: string) {
  const [d, m, y] = ddmmyyyy.split("/");
  return `${y}-${m}-${d}`;
}
