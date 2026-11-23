import type { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

export type IconName = keyof typeof Ionicons.glyphMap;
export type Glyph = IconName | `mc:${keyof typeof MaterialCommunityIcons.glyphMap}`;

// The users-app kit's OfferCard needs this; the captain app does not show offers.
export type Offer = { code: string; title: string; line: string; kicker: string; tone: "gold" | "plum" | "burgundy" };

export type Cycle = "daily" | "weekly" | "monthly";
export type CarClass = "Hatchback" | "Sedan" | "SUV" | "Premium SUV" | "Traveller";
export type { LayoutKind, SeatCell } from "./rules";
import type { LayoutKind, SeatCell } from "./rules";

export type Car = {
  id: string;
  makeModel: string;
  carClass: CarClass;
  plate: string;
  color: string;
  year: number;
  ac: boolean;
  amenities: string[];
  layout: LayoutKind;
  layoutTitle?: string;
  seatCount: number;
  seats: SeatCell[];
  status: "review" | "active" | "rejected";
  reviewNote: string | null;
};

export type Captain = {
  user_id: string;
  captain_code: string;
  phone: string;
  name: string;
  city: string;
  status: "review" | "active" | "suspended";
  rating: number;
  bank_last4: string;
  email?: string | null;
  emergency_name?: string;
  emergency_phone?: string;
};

export type DocKind = "dlFront" | "dlBack" | "rc" | "insurance" | "permit" | "fitness" | "aadhaar" | "pan" | "selfie" | "carFront" | "carBack" | "carInside";
export type DocStatus = { kind: DocKind; status: "uploaded" | "verified" | "rejected"; review_note: string | null; updated_at: string; expires_on?: string | null };

export type Plan = { cycle: Cycle; pendingCycle: Cycle | null; periodStart: string; periodEnd: string };

export type Verification = { minutes: number; startedAt: string; dueAt: string };

export type Profile = { captain: Captain; car: Car | null; documents: DocStatus[]; plan: Plan | null; balance: number; verification?: Verification };

export type Stop = { id: string; name: string; landmark: string; time: string; dayOffset: number };

export type TripSummary = {
  id: string;
  code: string;
  fromId: string;
  toId: string;
  date: string;
  departAt: string;
  arriveAt: string;
  durationMin: number;
  status: "scheduled" | "on_trip" | "completed" | "cancelled";
  fare: number;
  seatsLeft: number;
  seats: { id: string; label: string; row: number; col: number; price: number; state: string; window: boolean }[];
  boarding: Stop[];
  drops: Stop[];
  womenFriendly: boolean;
  booked: number;
  revenue: number;
};

export type Traveller = { seatId: string; name: string; age: number; gender: "Male" | "Female" };

export type TripSeat = {
  id: string;
  label: string;
  row: number;
  col: number;
  window: boolean;
  chair?: boolean;
  price: number;
  // offline: a passenger who paid the captain directly sits here; the app shows it as booked.
  status: "available" | "held" | "booked" | "offline";
  gender: "Male" | "Female" | null;
  pnr: string | null;
  passenger: { name: string; age: number; gender: "Male" | "Female" } | null;
  offlineNote?: string | null;
  boarded: boolean;
};

export type TripBooking = {
  id: string;
  pnr: string;
  status: "confirmed" | "completed" | "cancelled";
  seats: string[];
  travellers: Traveller[];
  boarding: { name: string; landmark: string; time?: string };
  drop: { name: string; landmark: string; time?: string };
  phone: string;
  boarded: boolean;
  fare: number;
  myRating?: number | null;
};

export type TripDetail = {
  trip: TripSummary & { cancelReason?: string | null };
  seats: TripSeat[];
  bookings: TripBooking[];
  totals: { booked: number; offline?: number; free?: number; seats: number; fare: number; commission: number; earning: number };
};

export type Earnings = { range: "today" | "week" | "month"; earned: number; completed: number; cancelled: number; entries: { id: number; kind: string; amount: number; note: string | null; at: string }[] };

export type Payout = { id: string; amount: number; status: "requested" | "paid" | "rejected"; reference: string | null; cycle: Cycle | null; periodStart: string | null; periodEnd: string | null; at: string; paidAt: string | null };

export type Payouts = { plan: Plan | null; balance: number; bankLast4: string; payouts: Payout[] };

export type FareHint = { suggested: number; bounds: { min: number; max: number }; durationMin: number; boarding: { id: string; name: string; landmark: string }[]; drops: { id: string; name: string; landmark: string }[] };

export type Registration = {
  name: string;
  dob: string;
  gender: "Male" | "Female" | "Other";
  email: string;
  city: string;
  emergencyName: string;
  emergencyPhone: string;
  bankHolder: string;
  accountNumber: string;
  ifsc: string;
  upi: string;
  payoutCycle: Cycle;
  car: {
    makeModel: string;
    carClass: CarClass;
    plate: string;
    color: string;
    year: number;
    ac: boolean;
    amenities: string[];
    layout: LayoutKind;
    seats: SeatCell[];
  };
};

export type PublishInput = {
  fromId: string;
  toId: string;
  date: string;
  time: string;
  fare: number;
  durationMin?: number;
  boarding: { id: string; name: string; landmark: string; offsetMin: number }[];
  drops: { id: string; name: string; landmark: string; offsetMin: number }[];
  womenFriendly: boolean;
};
