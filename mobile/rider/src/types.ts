export type VehicleKind = "bike" | "auto" | "cab";
export type PayMethod = "cash" | "online";

export type Place = {
  id: string;
  name: string;
  subtitle: string;
  latitude: number;
  longitude: number;
};

export type DocKey = "dlFront" | "dlBack" | "rc" | "aadhaar" | "pan" | "selfie";
export type DocStatus = "missing" | "uploaded" | "verified" | "rejected";

export type CaptainStatus = "review" | "active";

export type Captain = {
  phone: string;
  name: string;
  dob: string;
  gender: string;
  email: string;
  city: string;
  vehicle: VehicleKind;
  vehicleNo: string;
  vehicleModel: string;
  vehicleColor: string;
  vehicleYear: string;
  bankHolder: string;
  bankLast4: string;
  ifsc: string;
  upi: string;
  docs: Record<DocKey, DocStatus>;
  docNotes?: Partial<Record<DocKey, string>>;
  status: CaptainStatus;
  captainId: string;
  joinedAt: number;
  emergencyName: string;
  emergencyPhone: string;
};

export type Customer = { name: string; rating: number; rides: number };

export type Order = {
  id: string;
  vehicle: VehicleKind;
  customer: Customer;
  pickup: Place;
  drop: Place;
  pickupKm: number;
  pickupMin: number;
  tripKm: number;
  tripMin: number;
  fare: number;
  collect?: number;
  bonus: number;
  payment: PayMethod;
  otp: string;
  offerId?: string;
  tripId?: string;
};

export type JobStatus = "toPickup" | "arrived" | "onTrip" | "collect" | "rate";

export type Job = Order & { status: JobStatus; arrivedAt?: number; startedAt?: number };

export type TripStatus = "Completed" | "Cancelled" | "Missed";

export type Trip = {
  id: string;
  at: number;
  vehicle: VehicleKind;
  pickup: string;
  drop: string;
  km: number;
  minutes: number;
  fare: number;
  bonus: number;
  tip: number;
  payment: PayMethod;
  status: TripStatus;
  customer: string;
  ratingGiven?: number;
  ratingReceived?: number;
  reason?: string;
};

export type Txn = { id: string; label: string; amount: number; at: number };

export type Feedback = { id: string; customer: string; stars: number; note: string; tags: string[]; at: number };
