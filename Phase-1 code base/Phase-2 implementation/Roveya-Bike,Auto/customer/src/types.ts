import type { ImageSourcePropType } from "react-native";

export type VehicleKind = "bike" | "auto";
export type PayMethod = "cash" | "upi" | "online";

export type Place = {
  id: string;
  name: string;
  subtitle: string;
  latitude: number;
  longitude: number;
};

export type Captain = {
  name: string;
  rating: number;
  vehicleNo: string;
  vehicleName: string;
  trips: number;
  photo?: ImageSourcePropType;
};

export type PastRide = {
  id: string;
  when: string;
  pickup: string;
  drop: string;
  vehicle: VehicleKind;
  fare: number;
  passengerFee?: number;
  status: "Completed" | "Cancelled";
  reason?: string;
  distanceKm?: number;
  payment?: PayMethod;
  rating?: number;
};

export type WalletEntry = { id: string; label: string; amount: number; at: number };

export type TrustedContact = { name: string; phone: string };

export type Claim = { id: string; rideId: string; route: string; topic: string; note: string; at: number; status: "Under review" | "Resolved" };

export type TripStatus =
  | "searching"
  | "assigned"
  | "arrived"
  | "onTrip"
  | "payment"
  | "rating"
  | "done";

export type PoolBooking = {
  id: string;
  code: string;
  from: string;
  to: string;
  boarding: string;
  dropPoint: string;
  departAt: number;
  arriveAt: number;
  seats: number;
  farePerSeat: number;
  total: number;
  payment: PayMethod;
  captain: string;
  car: string;
  plate: string;
};

export type Reward = { kind: "cash" | "coins"; amount: number };

export type ScratchCard = { id: string; from: string; reward: Reward; scratched: boolean };

export type ParcelContact = { name: string; phone: string; detail: string };

export type ParcelBooking = {
  id: string;
  vehicle: "bike" | "auto";
  item: string;
  pickup: string;
  drop: string;
  sender: ParcelContact;
  receiver: ParcelContact;
  pickupCode: string;
  deliveryCode: string;
  fare: number;
  distanceKm: number;
  payment: PayMethod;
  captain: string;
  vehicleNo: string;
};

export type ActiveTrip = {
  id: string;
  pickup: Place;
  drop: Place;
  vehicle: VehicleKind;
  fare: number;
  passengerFee?: number;
  distanceKm: number;
  etaMin: number;
  payment: PayMethod;
  otp: string;
  captain: Captain;
  status: TripStatus;
  progress: number;
  serverId?: string;
  captainAt?: { latitude: number; longitude: number; heading: number; updatedAt?: string | null };
};
