// Shapes returned by the ROVEYA /api/v1 seat endpoints (same as the users app).

export type SeatView = "available" | "female" | "booked" | "bookedFemale";

// chair: an individual captain seat in the middle row, with an aisle beside it.
export type Seat = { id: string; label: string; row: number; col: number; price: number; state: SeatView; window: boolean; chair?: boolean };

export type Stop = { id: string; name: string; landmark: string; time: string; dayOffset: number; phone: string };

export type Trip = {
  id: string;
  code: string;
  fromId: string;
  toId: string;
  date: string;
  departAt: string;
  arriveAt: string;
  durationMin: number;
  status: string;
  operator: string;
  operatorRating: number;
  operatorReviews: number;
  car: string;
  carClass: string;
  ac: boolean;
  layout: string;
  layoutTitle?: string;
  carAge: string;
  rating: number;
  reviews: number;
  fare: number;
  seats: Seat[];
  seatsLeft: number;
  boarding: Stop[];
  drops: Stop[];
  tags: string[];
  amenities: string[];
  womenFriendly: boolean;
  assured: boolean;
};

export type Gender = "Male" | "Female";

export type Booking = {
  id: string;
  pnr: string;
  status: "Upcoming" | "Completed" | "Cancelled" | "Pending";
  trip: Trip;
  seats: Seat[];
  travellers: { seatId: string; name: string; age: string; gender: Gender }[];
  boarding: Stop;
  drop: Stop;
  phone: string;
  email: string | null;
  fare: number;
  fee: number;
  gst: number;
  secure: number;
  discount: number;
  cashUsed: number;
  total: number;
  payable: number;
  secured: boolean;
  paidWith: string;
  refund?: number;
  refundQuote: { percent: number; amount: number; refundPaise?: number; note?: string; kind?: string; securePaise?: number } | null;
  refundNote?: string;
  holdUntil: string | null;
  boarded: boolean;
  bookedAt: string;
  captain: { name: string; phone: string; car: string; plate: string; rating: number } | null;
};

export type Offer = { code: string; title: string; line: string; endsAt: string | null };

export type Rider = { name: string; phone: string; email?: string | null };
