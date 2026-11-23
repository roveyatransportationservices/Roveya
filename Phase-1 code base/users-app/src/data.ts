import type { Booking, CarClass, City, Glyph, IconName, Layout, Offer, Seat, SeatState, StopPoint, Trip } from "./types";
import { CANCELLATION_SLABS, departInstant, passengerPercent, hoursUntil } from "./refundPolicy";

// Static demo data. Every list here is replaced by the API in a later phase.

export const cities: (City & { lat: number; lng: number })[] = [
  { id: "hyd", name: "Hyderabad", state: "Telangana", icon: "mc:mosque", lat: 17.385, lng: 78.4867 },
  { id: "vja", name: "Vijayawada", state: "Andhra Pradesh", icon: "mc:bridge", lat: 16.5062, lng: 80.648 },
  { id: "kmm", name: "Khammam", state: "Telangana", icon: "mc:home-city-outline", lat: 17.2473, lng: 80.1514 },
  { id: "wgl", name: "Warangal", state: "Telangana", icon: "mc:castle", lat: 17.9689, lng: 79.5941 },
  { id: "vsk", name: "Visakhapatnam", state: "Andhra Pradesh", icon: "mc:beach", lat: 17.6868, lng: 83.2185 },
  { id: "tpt", name: "Tirupati", state: "Andhra Pradesh", icon: "mc:temple-hindu", lat: 13.6288, lng: 79.4192 },
  { id: "blr", name: "Bengaluru", state: "Karnataka", icon: "mc:office-building-outline", lat: 12.9716, lng: 77.5946 },
  { id: "gnt", name: "Guntur", state: "Andhra Pradesh", icon: "mc:chili-hot", lat: 16.3067, lng: 80.4365 },
  { id: "knr", name: "Karimnagar", state: "Telangana", icon: "mc:factory", lat: 18.4386, lng: 79.1288 },
  { id: "nzb", name: "Nizamabad", state: "Telangana", icon: "mc:sprout-outline", lat: 18.6725, lng: 78.094 },
  { id: "rjy", name: "Rajahmundry", state: "Andhra Pradesh", icon: "mc:ferry", lat: 17.0005, lng: 81.804 },
  { id: "nlr", name: "Nellore", state: "Andhra Pradesh", icon: "mc:fish", lat: 14.4426, lng: 79.9865 },
  { id: "bdc", name: "Bhadrachalam", state: "Telangana", icon: "mc:temple-hindu-outline", lat: 17.6688, lng: 80.8936 },
  { id: "ssm", name: "Srisailam", state: "Andhra Pradesh", icon: "mc:temple-hindu-outline", lat: 16.0733, lng: 78.8681 },
  { id: "ydg", name: "Yadagirigutta", state: "Telangana", icon: "mc:temple-hindu-outline", lat: 17.5883, lng: 78.9447 },
  { id: "che", name: "Chennai", state: "Tamil Nadu", icon: "mc:temple-hindu-outline", lat: 13.0827, lng: 80.2707 },
  { id: "tml", name: "Tirumala", state: "Andhra Pradesh", icon: "mc:temple-hindu", lat: 13.6833, lng: 79.3474 },
  { id: "kdp", name: "Kadapa", state: "Andhra Pradesh", icon: "mc:city-variant-outline", lat: 14.4673, lng: 78.8242 },
  { id: "krl", name: "Kurnool", state: "Andhra Pradesh", icon: "mc:city-variant-outline", lat: 15.8281, lng: 78.0373 },
  { id: "ong", name: "Ongole", state: "Andhra Pradesh", icon: "mc:city-variant-outline", lat: 15.5057, lng: 80.0499 },
  { id: "chr", name: "Chirala", state: "Andhra Pradesh", icon: "mc:city-variant-outline", lat: 15.8239, lng: 80.3521 },
  { id: "kkd", name: "Kakinada", state: "Andhra Pradesh", icon: "mc:city-variant-outline", lat: 16.9891, lng: 82.2475 },
  { id: "elr", name: "Eluru", state: "Andhra Pradesh", icon: "mc:city-variant-outline", lat: 16.7107, lng: 81.0952 },
  { id: "atp", name: "Anantapur", state: "Andhra Pradesh", icon: "mc:city-variant-outline", lat: 14.6819, lng: 77.6006 },
  { id: "nlg", name: "Nalgonda", state: "Telangana", icon: "mc:city-variant-outline", lat: 17.0575, lng: 79.2671 },
  { id: "srp", name: "Suryapet", state: "Telangana", icon: "mc:city-variant-outline", lat: 17.1405, lng: 79.6236 },
  { id: "mbn", name: "Mahbubnagar", state: "Telangana", icon: "mc:city-variant-outline", lat: 16.7488, lng: 78.0035 },
  { id: "ktg", name: "Kothagudem", state: "Telangana", icon: "mc:city-variant-outline", lat: 17.5504, lng: 80.6197 },
  { id: "sdp", name: "Siddipet", state: "Telangana", icon: "mc:city-variant-outline", lat: 18.1018, lng: 78.852 },
  { id: "mcl", name: "Mancherial", state: "Telangana", icon: "mc:city-variant-outline", lat: 18.8679, lng: 79.4639 },
  { id: "adb", name: "Adilabad", state: "Telangana", icon: "mc:city-variant-outline", lat: 19.6641, lng: 78.532 },
];

// Landmark icons for the popular-city grid, in the order shown.
export const landmarkCities: { id: string; icon: string }[] = [
  { id: "hyd", icon: "mosque" },
  { id: "vja", icon: "bridge" },
  { id: "blr", icon: "office-building-outline" },
  { id: "che", icon: "temple-hindu-outline" },
  { id: "vsk", icon: "beach" },
  { id: "tpt", icon: "temple-hindu" },
  { id: "wgl", icon: "castle" },
  { id: "kmm", icon: "home-city-outline" },
  { id: "gnt", icon: "chili-hot" },
  { id: "nlr", icon: "fish" },
  { id: "rjy", icon: "ferry" },
  { id: "knr", icon: "factory" },
];

export const popularCityIds = ["hyd", "vja", "kmm", "wgl", "vsk", "tpt", "blr", "gnt"];

export const cityById = (id: string) => cities.find((city) => city.id === id) ?? cities[0];

const hydPoints: [string, string][] = [
  ["Miyapur", "Metro station, pillar 600"],
  ["KPHB Colony", "Near JNTU bus stop"],
  ["Ameerpet", "Opp. Metro station exit B"],
  ["Lakdikapul", "Near Telephone Bhavan"],
  ["Dilsukhnagar", "Opp. Konark theatre"],
  ["LB Nagar", "LB Nagar ring road junction"],
  ["Uppal", "Uppal X Roads, near depot"],
  ["Gachibowli", "DLF gate 1"],
];

const cityPoints: Record<string, [string, string][]> = {
  hyd: hydPoints,
  vja: [
    ["Benz Circle", "Near Trendset Mall"],
    ["Pandit Nehru Bus Station", "Platform side entry"],
    ["Ramavarappadu Ring", "Ring road flyover"],
  ],
  kmm: [
    ["Khammam New Bus Stand", "Main entrance"],
    ["Wyra Road", "Near Mamatha Hospital"],
    ["Khammam Railway Station", "Parking bay"],
  ],
  wgl: [
    ["Hanamkonda Chowrasta", "Near Kakatiya Mall"],
    ["Warangal Railway Station", "East gate"],
  ],
  blr: [
    ["Majestic", "Kempegowda bus station gate 2"],
    ["Hebbal", "Hebbal flyover, Esteem Mall side"],
    ["Electronic City", "Infosys gate 1"],
  ],
};

function pointsFor(cityId: string): [string, string][] {
  const city = cityById(cityId);
  return cityPoints[cityId] ?? [
    [`${city.name} Bus Stand`, "Main entrance"],
    [`${city.name} Railway Station`, "Parking bay"],
    [`${city.name} Main Road`, "Near clock tower"],
  ];
}

function hash(text: string) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  return value >>> 0;
}

function random(seed: number) {
  let state = seed || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function roadKm(fromId: string, toId: string) {
  const a = cityById(fromId);
  const b = cityById(toId);
  const rad = (value: number) => (value * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return Math.max(40, Math.round(6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 1.22));
}

const fleet: { car: string; carClass: CarClass; layout: Layout; perKm: number }[] = [
  { car: "Maruti Dzire", carClass: "Sedan", layout: "sedan", perKm: 1.5 },
  { car: "Toyota Etios", carClass: "Sedan", layout: "sedan", perKm: 1.55 },
  { car: "Honda Amaze", carClass: "Sedan", layout: "sedan", perKm: 1.6 },
  { car: "Maruti Ertiga", carClass: "SUV", layout: "suv", perKm: 1.7 },
  { car: "Kia Carens", carClass: "SUV", layout: "suv", perKm: 1.85 },
  { car: "Toyota Innova Crysta", carClass: "Premium SUV", layout: "traveller", perKm: 2.2 },
  { car: "Toyota Innova Hycross", carClass: "Premium SUV", layout: "traveller", perKm: 2.4 },
];

const operators = [
  { name: "ROVEYA Prime", rating: 4.7, reviews: 18240, assured: true },
  { name: "ROVEYA Pool", rating: 4.5, reviews: 9612, assured: true },
  { name: "Kakatiya Rides", rating: 4.3, reviews: 5320, assured: false },
  { name: "Godavari Wheels", rating: 4.4, reviews: 3870, assured: false },
  { name: "Deccan Seat Cabs", rating: 4.1, reviews: 2610, assured: false },
  { name: "Amaravati Travels", rating: 4.2, reviews: 4105, assured: false },
];

export const amenityIcons: Record<string, IconName> = {
  AC: "snow-outline",
  "Water bottle": "water-outline",
  "Phone charger": "battery-charging-outline",
  "Live tracking": "navigate-outline",
  "Verified driver": "shield-checkmark-outline",
  "Sanitised car": "sparkles-outline",
  "Boot space": "briefcase-outline",
  Music: "musical-notes-outline",
  "Reading light": "bulb-outline",
};

// Seats as seen from above: column 0 is the left window, the driver sits front right.
const layouts: Record<"sedan" | "suv" | "traveller", { id: string; row: number; col: number; window: boolean; delta: number }[]> = {
  sedan: [
    { id: "F1", row: 0, col: 0, window: true, delta: 60 },
    { id: "R1", row: 1, col: 0, window: true, delta: 0 },
    { id: "R2", row: 1, col: 1, window: false, delta: -40 },
    { id: "R3", row: 1, col: 2, window: true, delta: 0 },
  ],
  suv: [
    { id: "F1", row: 0, col: 0, window: true, delta: 60 },
    { id: "M1", row: 1, col: 0, window: true, delta: 0 },
    { id: "M2", row: 1, col: 1, window: false, delta: -40 },
    { id: "M3", row: 1, col: 2, window: true, delta: 0 },
    { id: "B1", row: 2, col: 0, window: true, delta: -60 },
    { id: "B2", row: 2, col: 2, window: true, delta: -60 },
  ],
  traveller: [
    { id: "F1", row: 0, col: 0, window: true, delta: 80 },
    { id: "M1", row: 1, col: 0, window: true, delta: 40 },
    { id: "M2", row: 1, col: 2, window: true, delta: 40 },
    { id: "B1", row: 2, col: 0, window: true, delta: -40 },
    { id: "B2", row: 2, col: 1, window: false, delta: -60 },
    { id: "B3", row: 2, col: 2, window: true, delta: -40 },
  ],
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function clockOf(minutes: number) {
  const total = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

function stops(cityId: string, startMin: number, step: number, rand: () => number, count: number): StopPoint[] {
  const list = pointsFor(cityId);
  const picked = list.slice(0, Math.min(list.length, count));
  return picked.map(([name, landmark], index) => {
    const at = startMin + index * step;
    return { id: `${cityId}-${index}`, name, landmark, time: clockOf(at), dayOffset: Math.floor(at / 1440), phone: `9${String(Math.floor(rand() * 1e9)).padStart(9, "7")}` };
  });
}

function seatsFor(layout: Layout, fare: number, rand: () => number): Seat[] {
  const seats = layouts[layout as keyof typeof layouts].map((seat) => {
    const roll = rand();
    const state: SeatState = roll < 0.22 ? "booked" : roll < 0.34 ? "bookedFemale" : "available";
    return { id: seat.id, label: seat.id, row: seat.row, col: seat.col, window: seat.window, price: Math.max(99, fare + seat.delta), state, chair: layout === "traveller" && seat.row === 1 };
  });
  // A free seat beside a woman traveller is offered to women only.
  return seats.map((seat) => {
    if (seat.state !== "available") return seat;
    const besideWoman = seats.some((other) => other.state === "bookedFemale" && other.row === seat.row && Math.abs(other.col - seat.col) === 1);
    return besideWoman ? { ...seat, state: "female" } : seat;
  });
}

export function searchTrips(fromId: string, toId: string, date: string): Trip[] {
  const rand = random(hash(`${fromId}-${toId}-${date}`));
  const km = roadKm(fromId, toId);
  const driveMin = Math.round((km / 62) * 60) + 15;
  const count = 9 + Math.floor(rand() * 5);
  const trips: Trip[] = [];
  for (let index = 0; index < count; index += 1) {
    const car = fleet[Math.floor(rand() * fleet.length)];
    const operator = operators[Math.floor(rand() * operators.length)];
    const depart = 5 * 60 + Math.floor(((index + rand() * 0.8) / count) * 18 * 60);
    const departRounded = Math.round(depart / 15) * 15;
    const duration = driveMin + Math.floor(rand() * 30);
    const fare = Math.round((km * car.perKm + 49) / 10) * 10 - 1;
    const seats = seatsFor(car.layout, fare, rand);
    const boarding = stops(fromId, departRounded, 12, rand, 2 + Math.floor(rand() * 3));
    const lastBoard = departRounded + (boarding.length - 1) * 12;
    const drops = stops(toId, lastBoard + duration - 20, 10, rand, 1 + Math.floor(rand() * 3));
    const arrive = lastBoard + duration;
    const amenities = ["AC", "Verified driver", "Live tracking", "Sanitised car", "Phone charger", "Water bottle", "Boot space", "Music"].filter((_, position) => position < 3 || rand() > 0.35);
    trips.push({
      id: `${fromId}-${toId}-${date}-${index}`,
      fromId,
      toId,
      date,
      operator: operator.name,
      operatorRating: operator.rating,
      operatorReviews: operator.reviews,
      car: car.car,
      carClass: car.carClass,
      ac: true,
      layout: car.layout,
      carAge: rand() > 0.5 ? "Brand new car" : `${1 + Math.floor(rand() * 3)} yr old car`,
      departAt: clockOf(departRounded),
      arriveAt: clockOf(arrive),
      durationMin: arrive - departRounded,
      rating: Math.round((3.9 + rand() * 1) * 10) / 10,
      reviews: 40 + Math.floor(rand() * 900),
      fare,
      seats,
      boarding,
      drops,
      tags: [car.carClass, rand() > 0.5 ? "Car photos" : "Live tracking", ...(rand() > 0.6 ? ["Women friendly"] : [])],
      amenities,
      offer: rand() > 0.55 ? (operator.assured ? "Save ₹100 with code PRIME100" : "Flat 10% off with code SEAT10") : undefined,
      womenFriendly: rand() > 0.5,
      assured: operator.assured,
    });
  }
  return trips.sort((a, b) => a.departAt.localeCompare(b.departAt));
}

export function tripById(id: string) {
  const parts = id.split("-");
  parts.pop();
  const [fromId, toId, ...dateParts] = parts;
  return searchTrips(fromId, toId, dateParts.join("-")).find((trip) => trip.id === id) ?? null;
}

export function seatsLeft(trip: Trip) {
  return trip.seats.filter((seat) => seat.state === "available" || seat.state === "female" || seat.state === "male").length;
}

export function lowestFare(trip: Trip) {
  return Math.min(...trip.seats.map((seat) => seat.price));
}

export function durationLabel(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m`;
}

export const cancellationSlabs = CANCELLATION_SLABS;

export function departureDate(trip: Pick<Trip, "date" | "departAt">) {
  const [h, m] = trip.departAt.split(":").map(Number);
  const at = new Date(`${trip.date}T00:00:00`);
  at.setHours(h, m, 0, 0);
  return at;
}

export function refundPercent(trip: Pick<Trip, "date" | "departAt">, now = new Date(), secured = false) {
  const at = departInstant(trip.departAt, trip.date);
  if (!at) return null;
  return passengerPercent(hoursUntil(at, now), secured);
}

export const offers: Offer[] = [];

export function couponValue(_code: string, _subtotal: number) {
  return 0;
}

export const popularRoutes: [string, string][] = [
  ["hyd", "vja"],
  ["hyd", "kmm"],
  ["hyd", "wgl"],
  ["hyd", "tpt"],
  ["vja", "vsk"],
  ["hyd", "blr"],
];

export const escapes: { cityId: string; title: string; line: string; icon: Glyph }[] = [
  { cityId: "tpt", title: "Tirupati", line: "Darshan trips with early pickups", icon: "mc:temple-hindu" },
  { cityId: "bdc", title: "Bhadrachalam", line: "Sri Rama temple on the Godavari", icon: "mc:temple-hindu-outline" },
  { cityId: "ssm", title: "Srisailam", line: "Mallikarjuna and the Nallamala ghats", icon: "mc:image-filter-hdr" },
  { cityId: "ydg", title: "Yadagirigutta", line: "Lakshmi Narasimha, an hour away", icon: "mc:flower-tulip-outline" },
];

export const travelPolicy: { q: string; a: string }[] = [
  { q: "Do I need a seat for my child?", a: "Children under 5 travel free on a parent's lap. A child who needs their own seat needs a ticket." },
  { q: "How much luggage can I carry?", a: "One cabin bag and one medium suitcase per seat. Bigger loads need the full boot; ask the desk." },
  { q: "Can I carry a pet?", a: "Pets travel only on full-car bookings, with the captain's consent." },
  { q: "When do I get the captain's details?", a: "The captain's name, photo, phone and car number reach you by SMS and in Bookings 2 hours before departure." },
  { q: "What ID do I carry?", a: "Any government photo ID: Aadhaar, driving licence, voter ID, or passport." },
];

export const faqs: { topic: string; q: string; a: string }[] = [
  { topic: "Booking", q: "How is a ROVEYA seat different from a bus seat?", a: "You share a clean, AC car with up to 5 verified travellers. You pick your exact seat, and the car leaves on time from your boarding point." },
  { topic: "Booking", q: "Can I book the whole car?", a: "Yes. Select every seat in the car, or call the desk for a private trip." },
  { topic: "Payments", q: "Which payment options are available?", a: "UPI, debit and credit cards, net banking, and ROVEYA Cash." },
  { topic: "Cancellation", q: "How do refunds work?", a: "A passenger refund is 100% at 48 hours, 90% at 24 hours, 75% at 6 hours, 50% at 2 hours, and nothing under 2 hours. The percentage applies to the money collected, excluding the Secure your trip fee, and is rounded to the nearest rupee. A captain cancellation refunds the money collected. ROVEYA Cash is instant. A card or UPI refund takes 3 to 5 working days." },
  { topic: "Safety", q: "Who are ROVEYA captains?", a: "Every captain is background verified, licence checked and trained. Women Zone seats are only ever next to women." },
  { topic: "Safety", q: "Can someone track my trip?", a: "Share live tracking from the ticket with anyone. They see the car on the map until you reach." },
];

function isoDate(offsetDays: number) {
  const at = new Date();
  at.setDate(at.getDate() + offsetDays);
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

export const todayIso = () => isoDate(0);
export const dateAfter = isoDate;

function seedBooking(fromId: string, toId: string, offset: number, status: Booking["status"], pnr: string, seatsWanted: number): Booking {
  const trip = searchTrips(fromId, toId, isoDate(offset))[2];
  const seats = trip.seats.slice(0, seatsWanted).map((seat) => ({ ...seat, state: "available" as const }));
  const total = seats.reduce((sum, seat) => sum + seat.price, 0);
  return {
    pnr,
    trip,
    seats,
    travellers: seats.map((seat, index) => ({ seatId: seat.id, name: index === 0 ? "Asif Shaik" : "Sana Shaik", age: index === 0 ? "29" : "26", gender: index === 0 ? "Male" : "Female" })),
    boarding: trip.boarding[0],
    drop: trip.drops[trip.drops.length - 1],
    total,
    discount: 0,
    secured: true,
    paidWith: "UPI · Google Pay",
    phone: "9876543210",
    status,
    bookedAt: isoDate(offset - 4),
    refund: status === "Cancelled" ? Math.round(total * 0.9) : undefined,
  };
}

export function seedBookings(): Booking[] {
  return [
    seedBooking("hyd", "kmm", 3, "Upcoming", "RVY4821AK", 2),
    seedBooking("hyd", "wgl", -12, "Completed", "RVY3390QM", 1),
    seedBooking("vja", "hyd", -30, "Cancelled", "RVY2014PL", 1),
  ];
}

export const cashLog: { id: string; label: string; amount: number; at: string }[] = [
  { id: "c1", label: "Welcome bonus", amount: 100, at: "12 Oct" },
  { id: "c2", label: "Cashback · Hyderabad to Warangal", amount: 45, at: "16 Oct" },
  { id: "c3", label: "Used on RVY3390QM", amount: -60, at: "16 Oct" },
  { id: "c4", label: "Referral · Sana joined", amount: 150, at: "21 Oct" },
];

export const cancelFaqs: { q: string; a: string }[] = [
  { q: "How do I cancel my booking?", a: "Enter your ROVEYA booking ID and the mobile number used to book, then tap Submit. Check the refund amount and tap Cancel booking. You can also cancel from the ticket in Bookings." },
  { q: "Where can I check the cancellation policy?", a: "The bands are 100% at 48 hours, 90% at 24 hours, 75% at 6 hours, 50% at 2 hours, and 0% under 2 hours. Secure your trip refunds the rest in full up to 6 hours before departure. That fee is not refunded." },
  { q: "My car trip was cancelled. What should I do now?", a: "If the captain or ROVEYA cancels, you get the money collected back. Passenger time bands are not used. The desk can help you look for another car." },
  { q: "Where and by when will I get my refund?", a: "The amount is the refund stored when the booking is cancelled. ROVEYA Cash lands at once. A card or UPI refund reaches the original payment in 3 to 5 working days." },
  { q: "Can I cancel only one seat?", a: "A cancellation covers the whole booking. Every seat on that booking is released together." },
];

export const inbox: { id: string; kind: "travel" | "offer"; title: string; body: string; at: string; icon: IconName }[] = [];

export const referSteps: { icon: IconName; text: string }[] = [
  { icon: "share-social-outline", text: "Share your unique referral code with friends and family. The more you share, the more you earn." },
  { icon: "phone-portrait-outline", text: "Your friend installs the ROVEYA app and enters your code while signing up." },
  { icon: "cash-outline", text: "They install the app and sign up with your code." },
  { icon: "briefcase-outline", text: "A cash reward is not paid until the desk turns referrals on." },
];

export const referFaqs: { q: string; a: string }[] = [
  { q: "Where do I find my referral code?", a: "Log in and open Refer A Friend from Account. Your code is at the bottom, ready to share." },
  { q: "When do I get a reward?", a: "Referral cash is off. The desk will turn it on before it is paid." },
  { q: "Is there a limit?", a: "The desk sets the limit when referrals are turned on." },
  { q: "My friend forgot to enter the code", a: "The code has to be entered at sign-up. Ask the desk within 24 hours of their sign-up and we add it for you." },
];

export const referTerms = [
  "The referral code works only for new ROVEYA accounts on a new mobile number.",
  "Referral cash is off until the desk turns it on.",
  "A cancelled trip does not create a referral reward.",
  "Rewards cannot be exchanged for cash and expire 12 months after they are added.",
  "ROVEYA may change or end the programme at any time and may hold rewards from suspected misuse.",
];

export const DESK_PHONE = "+91 90000 00001";
