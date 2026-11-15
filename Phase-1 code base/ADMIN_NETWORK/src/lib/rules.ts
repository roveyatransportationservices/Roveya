// Pure rules for Phase 1 car seats. Shared by the API and the tests; the SQL
// functions in 20261028120000_seat_marketplace.sql are the source of truth for money.

export type SeatCell = { id: string; label: string; row: number; col: number; window: boolean };
export type LayoutKind = "seat4" | "seat5c" | "seat6" | "seat6c" | "seat7";
export type CarClass = "Hatchback" | "Sedan" | "SUV" | "Premium SUV" | "Traveller";
export type Cycle = "daily" | "weekly" | "monthly";

export const CAR_CLASSES: CarClass[] = ["Hatchback", "Sedan", "SUV", "Premium SUV", "Traveller"];

// What captains pick from. "Seats" counts everyone in the car; travellers get one fewer (the captain drives).
export const LAYOUTS: { kind: LayoutKind; title: string; line: string; examples: string }[] = [
  { kind: "seat4", title: "5-seater", line: "1 front + 3 in the back", examples: "Swift, Dzire, City, Creta, Nexon" },
  { kind: "seat5c", title: "6-seater · captain seats", line: "1 front + 2 captain seats + 2 at the back", examples: "XL6, Carens 6, Hector Plus 6" },
  { kind: "seat6", title: "7-seater", line: "1 front + 3 in the middle + 2 at the back", examples: "Ertiga, Carens 7, XUV700 7" },
  { kind: "seat6c", title: "7-seater · captain seats", line: "1 front + 2 captain seats + 3 at the back", examples: "Innova Crysta 7, Innova Hycross 7" },
  { kind: "seat7", title: "8-seater", line: "1 front + 3 in the middle + 3 at the back", examples: "Innova Crysta 8, Marazzo 8" },
];

export const LAYOUT_KINDS = LAYOUTS.map((item) => item.kind);
export const layoutInfo = (kind: string) => LAYOUTS.find((item) => item.kind === kind) ?? LAYOUTS[0]!;

// Middle-row seats in a captain-seat car are individual chairs with an aisle between them.
export const isCaptainChair = (layout: string, row: number) => (layout === "seat5c" || layout === "seat6c") && row === 1;

// Seen from above. Column 0 is the left window; the captain sits at row 0, column 2.
export const SEAT_TEMPLATES: Record<LayoutKind, SeatCell[]> = {
  seat4: [
    { id: "F1", label: "F1", row: 0, col: 0, window: true },
    { id: "R1", label: "R1", row: 1, col: 0, window: true },
    { id: "R2", label: "R2", row: 1, col: 1, window: false },
    { id: "R3", label: "R3", row: 1, col: 2, window: true },
  ],
  seat5c: [
    { id: "F1", label: "F1", row: 0, col: 0, window: true },
    { id: "C1", label: "C1", row: 1, col: 0, window: true },
    { id: "C2", label: "C2", row: 1, col: 2, window: true },
    { id: "B1", label: "B1", row: 2, col: 0, window: true },
    { id: "B2", label: "B2", row: 2, col: 2, window: true },
  ],
  seat6c: [
    { id: "F1", label: "F1", row: 0, col: 0, window: true },
    { id: "C1", label: "C1", row: 1, col: 0, window: true },
    { id: "C2", label: "C2", row: 1, col: 2, window: true },
    { id: "B1", label: "B1", row: 2, col: 0, window: true },
    { id: "B2", label: "B2", row: 2, col: 1, window: false },
    { id: "B3", label: "B3", row: 2, col: 2, window: true },
  ],
  seat6: [
    { id: "F1", label: "F1", row: 0, col: 0, window: true },
    { id: "M1", label: "M1", row: 1, col: 0, window: true },
    { id: "M2", label: "M2", row: 1, col: 1, window: false },
    { id: "M3", label: "M3", row: 1, col: 2, window: true },
    { id: "B1", label: "B1", row: 2, col: 0, window: true },
    { id: "B2", label: "B2", row: 2, col: 2, window: true },
  ],
  seat7: [
    { id: "F1", label: "F1", row: 0, col: 0, window: true },
    { id: "M1", label: "M1", row: 1, col: 0, window: true },
    { id: "M2", label: "M2", row: 1, col: 1, window: false },
    { id: "M3", label: "M3", row: 1, col: 2, window: true },
    { id: "B1", label: "B1", row: 2, col: 0, window: true },
    { id: "B2", label: "B2", row: 2, col: 1, window: false },
    { id: "B3", label: "B3", row: 2, col: 2, window: true },
  ],
};

export const LAYOUT_FOR_COUNT: Record<number, LayoutKind> = { 4: "seat4", 6: "seat6", 7: "seat7" };

// Front seats sell first, captain chairs are the most comfortable, back rows are cheaper.
// Applied on top of the trip's base fare.
export function seatDeltaRupees(cell: Pick<SeatCell, "row" | "window">, layout: LayoutKind) {
  if (cell.row === 0) return 60;
  if (isCaptainChair(layout, cell.row)) return 30;
  const lastRow = layout === "seat4" ? 1 : 2;
  if (cell.row === lastRow && layout !== "seat4") return cell.window ? -40 : -60;
  return cell.window ? 0 : -40;
}

// Captains rename seats but keep the template positions, so the user app draws the same car.
export function validateSeats(kind: LayoutKind, seats: SeatCell[]): string | null {
  const template = SEAT_TEMPLATES[kind];
  if (!template) return "Pick a seat layout.";
  if (seats.length !== template.length) return `This layout has ${template.length} seats.`;
  const ids = new Set<string>();
  const labels = new Set<string>();
  for (const seat of seats) {
    const slot = template.find((cell) => cell.id === seat.id);
    if (!slot) return `Seat ${seat.id} is not part of this layout.`;
    if (seat.row !== slot.row || seat.col !== slot.col) return `Seat ${seat.id} must stay in its place.`;
    const label = seat.label.trim();
    if (!/^[A-Za-z0-9 -]{1,12}$/.test(label)) return `Give seat ${seat.id} a name of up to 12 letters or numbers.`;
    if (labels.has(label.toUpperCase())) return `Two seats are named ${label}. Each seat needs its own name.`;
    if (ids.has(seat.id)) return `Seat ${seat.id} appears twice.`;
    ids.add(seat.id);
    labels.add(label.toUpperCase());
  }
  return null;
}

export type City = { id: string; name: string; state: string; lat: number; lng: number };

export const CITIES: City[] = [
  { id: "hyd", name: "Hyderabad", state: "Telangana", lat: 17.385, lng: 78.4867 },
  { id: "vja", name: "Vijayawada", state: "Andhra Pradesh", lat: 16.5062, lng: 80.648 },
  { id: "kmm", name: "Khammam", state: "Telangana", lat: 17.2473, lng: 80.1514 },
  { id: "wgl", name: "Warangal", state: "Telangana", lat: 17.9689, lng: 79.5941 },
  { id: "vsk", name: "Visakhapatnam", state: "Andhra Pradesh", lat: 17.6868, lng: 83.2185 },
  { id: "tpt", name: "Tirupati", state: "Andhra Pradesh", lat: 13.6288, lng: 79.4192 },
  { id: "blr", name: "Bengaluru", state: "Karnataka", lat: 12.9716, lng: 77.5946 },
  { id: "gnt", name: "Guntur", state: "Andhra Pradesh", lat: 16.3067, lng: 80.4365 },
  { id: "knr", name: "Karimnagar", state: "Telangana", lat: 18.4386, lng: 79.1288 },
  { id: "nzb", name: "Nizamabad", state: "Telangana", lat: 18.6725, lng: 78.094 },
  { id: "rjy", name: "Rajahmundry", state: "Andhra Pradesh", lat: 17.0005, lng: 81.804 },
  { id: "nlr", name: "Nellore", state: "Andhra Pradesh", lat: 14.4426, lng: 79.9865 },
  { id: "bdc", name: "Bhadrachalam", state: "Telangana", lat: 17.6688, lng: 80.8936 },
  { id: "ssm", name: "Srisailam", state: "Andhra Pradesh", lat: 16.0733, lng: 78.8681 },
  { id: "ydg", name: "Yadagirigutta", state: "Telangana", lat: 17.5883, lng: 78.9447 },
  { id: "che", name: "Chennai", state: "Tamil Nadu", lat: 13.0827, lng: 80.2707 },
  { id: "tml", name: "Tirumala", state: "Andhra Pradesh", lat: 13.6833, lng: 79.3474 },
  { id: "kdp", name: "Kadapa", state: "Andhra Pradesh", lat: 14.4673, lng: 78.8242 },
  { id: "krl", name: "Kurnool", state: "Andhra Pradesh", lat: 15.8281, lng: 78.0373 },
  { id: "ong", name: "Ongole", state: "Andhra Pradesh", lat: 15.5057, lng: 80.0499 },
  { id: "chr", name: "Chirala", state: "Andhra Pradesh", lat: 15.8239, lng: 80.3521 },
  { id: "kkd", name: "Kakinada", state: "Andhra Pradesh", lat: 16.9891, lng: 82.2475 },
  { id: "elr", name: "Eluru", state: "Andhra Pradesh", lat: 16.7107, lng: 81.0952 },
  { id: "atp", name: "Anantapur", state: "Andhra Pradesh", lat: 14.6819, lng: 77.6006 },
  { id: "nlg", name: "Nalgonda", state: "Telangana", lat: 17.0575, lng: 79.2671 },
  { id: "srp", name: "Suryapet", state: "Telangana", lat: 17.1405, lng: 79.6236 },
  { id: "mbn", name: "Mahbubnagar", state: "Telangana", lat: 16.7488, lng: 78.0035 },
  { id: "ktg", name: "Kothagudem", state: "Telangana", lat: 17.5504, lng: 80.6197 },
  { id: "sdp", name: "Siddipet", state: "Telangana", lat: 18.1018, lng: 78.852 },
  { id: "mcl", name: "Mancherial", state: "Telangana", lat: 18.8679, lng: 79.4639 },
  { id: "adb", name: "Adilabad", state: "Telangana", lat: 19.6641, lng: 78.532 },
];

export const cityById = (id: string) => CITIES.find((city) => city.id === id) ?? null;

export function roadKm(fromId: string, toId: string) {
  const a = cityById(fromId);
  const b = cityById(toId);
  if (!a || !b) return 0;
  const rad = (value: number) => (value * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return Math.max(40, Math.round(6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 1.22));
}

export function driveMinutes(fromId: string, toId: string) {
  return Math.round((roadKm(fromId, toId) / 62) * 60) + 15;
}

const PER_KM: Record<CarClass, number> = { Hatchback: 1.4, Sedan: 1.55, SUV: 1.75, "Premium SUV": 2.2, Traveller: 1.9 };

// A seat price suggestion for the captain; they may publish anything within the bounds below.
export function suggestedFare(fromId: string, toId: string, carClass: CarClass) {
  return Math.round((roadKm(fromId, toId) * PER_KM[carClass] + 49) / 10) * 10 - 1;
}

export function fareBounds(fromId: string, toId: string) {
  const km = roadKm(fromId, toId);
  return { min: Math.max(99, Math.round(km * 0.9)), max: Math.max(499, Math.round(km * 4)) };
}

const POINTS: Record<string, [string, string][]> = {
  hyd: [
    ["Miyapur", "Metro station, pillar 600"],
    ["KPHB Colony", "Near JNTU bus stop"],
    ["Ameerpet", "Opp. Metro station exit B"],
    ["Lakdikapul", "Near Telephone Bhavan"],
    ["Dilsukhnagar", "Opp. Konark theatre"],
    ["LB Nagar", "LB Nagar ring road junction"],
    ["Uppal", "Uppal X Roads, near depot"],
    ["Gachibowli", "DLF gate 1"],
  ],
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

export function pointsFor(cityId: string) {
  const city = cityById(cityId);
  const list = POINTS[cityId] ?? (city ? [[`${city.name} Bus Stand`, "Main entrance"], [`${city.name} Railway Station`, "Parking bay"], [`${city.name} Main Road`, "Near clock tower"]] : []);
  return list.map(([name, landmark], index) => ({ id: `${cityId}-${index}`, name, landmark }));
}

export const CANCELLATION_SLABS = [
  { label: "Before the car leaves", hoursBefore: 0, refund: 100 },
  { label: "After the car has left", hoursBefore: -1, refund: 0 },
];

// Mirrors seat_cancel for the quote shown before a traveller confirms.
export function refundFor(paidPaise: number, securePaise: number, secured: boolean, departAt: Date, now = new Date()) {
  const hours = (departAt.getTime() - now.getTime()) / 3600000;
  const percent = secured && hours >= 6 ? 100 : (CANCELLATION_SLABS.find((slab) => hours >= slab.hoursBefore)?.refund ?? 0);
  return { percent, refundPaise: Math.round(((paidPaise - securePaise) * percent) / 100 / 100) * 100 };
}

const IST_MS = 330 * 60 * 1000;

export function istParts(at: Date) {
  const shifted = new Date(at.getTime() + IST_MS);
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    date: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    time: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`,
  };
}

export function fromIst(date: string, time: string) {
  const at = new Date(`${date}T${time}:00+05:30`);
  return Number.isNaN(at.getTime()) ? null : at;
}

export function istDayRange(date: string) {
  const start = fromIst(date, "00:00");
  if (!start) return null;
  return { start, end: new Date(start.getTime() + 24 * 3600 * 1000) };
}

// Mirrors plan_period_end: periods end at IST midnight after 1 day, 7 days or 1 month.
export function planPeriodEnd(cycle: Cycle, start: Date) {
  const local = new Date(start.getTime() + IST_MS);
  local.setUTCHours(0, 0, 0, 0);
  if (cycle === "daily") local.setUTCDate(local.getUTCDate() + 1);
  else if (cycle === "weekly") local.setUTCDate(local.getUTCDate() + 7);
  else local.setUTCMonth(local.getUTCMonth() + 1);
  return new Date(local.getTime() - IST_MS);
}

export type SeatView = "available" | "female" | "booked" | "bookedFemale";

// What a traveller sees: held seats and seats sold outside the app look booked,
// and seats beside a woman are for women only.
export function seatViews(seats: { seat_id: string; seat_row: number; seat_col: number; state: string; gender: string | null }[]) {
  const views: Record<string, SeatView> = {};
  for (const seat of seats) {
    if (seat.state !== "available") {
      views[seat.seat_id] = seat.gender === "Female" ? "bookedFemale" : "booked";
      continue;
    }
    const besideWoman = seats.some((other) => other.state !== "available" && other.gender === "Female" && other.seat_row === seat.seat_row && Math.abs(other.seat_col - seat.seat_col) === 1);
    views[seat.seat_id] = besideWoman ? "female" : "available";
  }
  return views;
}
