import type { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

export type IconName = keyof typeof Ionicons.glyphMap;

export type Glyph = IconName | `mc:${keyof typeof MaterialCommunityIcons.glyphMap}`;

export type City = { id: string; name: string; state: string; icon: Glyph };

export type StopPoint = { id: string; name: string; landmark: string; time: string; dayOffset: number; phone: string };

export type SeatState = "available" | "female" | "male" | "booked" | "bookedFemale";

// chair: an individual captain seat (middle row of a captain-seat car), with an aisle beside it.
export type Seat = { id: string; label: string; row: number; col: number; price: number; state: SeatState; window: boolean; chair?: boolean };

// sedan/suv/traveller come from the preview data; seat4/5c/6/6c/7 are the captain-defined layouts from the API.
export type Layout = "sedan" | "suv" | "traveller" | "seat4" | "seat5c" | "seat6" | "seat6c" | "seat7";

export type CarClass = "Hatchback" | "Sedan" | "SUV" | "Premium SUV" | "Traveller";

export type Trip = {
  id: string;
  fromId: string;
  toId: string;
  date: string;
  operator: string;
  operatorRating: number;
  operatorReviews: number;
  car: string;
  carClass: CarClass;
  ac: boolean;
  layout: Layout;
  carAge: string;
  departAt: string;
  arriveAt: string;
  durationMin: number;
  rating: number;
  reviews: number;
  fare: number;
  seats: Seat[];
  boarding: StopPoint[];
  drops: StopPoint[];
  tags: string[];
  amenities: string[];
  offer?: string;
  womenFriendly: boolean;
  assured: boolean;
};

export type Gender = "Male" | "Female";

export type Traveller = { seatId: string; name: string; age: string; gender: Gender | null };

export type BookingStatus = "Upcoming" | "Completed" | "Cancelled";

export type CaptainInfo = { name: string; phone: string; car: string; plate: string; rating: number };

export type Booking = {
  id?: string;
  captain?: CaptainInfo | null;
  secure?: number;
  refundQuote?: { percent: number; amount: number; refundPaise?: number; note?: string; kind?: string; securePaise?: number } | null;
  refundNote?: string;
  pnr: string;
  trip: Trip;
  seats: Seat[];
  travellers: Traveller[];
  boarding: StopPoint;
  drop: StopPoint;
  total: number;
  discount: number;
  secured: boolean;
  paidWith: string;
  phone: string;
  status: BookingStatus;
  bookedAt: string;
  refund?: number;
};

export type Offer = { code: string; title: string; line: string; kicker: string; tone: "gold" | "plum" | "burgundy" };
