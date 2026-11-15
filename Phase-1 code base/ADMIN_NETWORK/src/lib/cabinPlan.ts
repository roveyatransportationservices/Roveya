import { LAYOUT_KINDS, SEAT_TEMPLATES, type SeatCell } from "./rules";

export const MIN_PASSENGER_SEATS = 1;
export const MAX_PASSENGER_SEATS = 12;

export type CabinLayout = "seat4" | "seat5c" | "seat6" | "seat6c" | "seat7" | "flex";

function rowsBehind(count: number): number[] {
  if (count <= 0) return [];
  if (count <= 3) return [count];
  if (count === 4) return [2, 2];
  if (count === 5) return [3, 2];
  const rows: number[] = [];
  let left = count;
  while (left > 0) {
    if (left === 4) {
      rows.push(2, 2);
      break;
    }
    if (left === 5) {
      rows.push(3, 2);
      break;
    }
    const take = Math.min(3, left);
    rows.push(take);
    left -= take;
  }
  return rows;
}

function places(count: number) {
  if (count === 1) return [{ col: 0, window: true }];
  if (count === 2) return [{ col: 0, window: true }, { col: 2, window: true }];
  return [
    { col: 0, window: true },
    { col: 1, window: false },
    { col: 2, window: true },
  ];
}

function freshLabel(preferred: string, fallback: string, used: Set<string>) {
  const ok = (value: string) => /^[A-Za-z0-9 -]{1,12}$/.test(value) && !used.has(value.toUpperCase());
  if (ok(preferred)) return preferred;
  if (ok(fallback)) return fallback;
  const stem = (fallback.replace(/\d+$/, "") || "S").slice(0, 10);
  let n = 1;
  let label = `${stem}${n}`;
  while (!ok(label)) label = `${stem}${++n}`;
  return label;
}

// Passenger seats only. The captain always drives on the right of the front row.
export function buildCabin(count: number, previous: SeatCell[] = []): SeatCell[] {
  const total = Math.max(MIN_PASSENGER_SEATS, Math.min(MAX_PASSENGER_SEATS, count));
  const plan = [1, ...rowsBehind(total - 1)];
  const slots: SeatCell[] = [];
  plan.forEach((seatsInRow, row) => {
    const last = row === plan.length - 1 && row > 0;
    const letter = row === 0 ? "F" : last ? "B" : plan.length > 3 && row > 1 ? "R" : "M";
    places(seatsInRow).forEach((place, index) => {
      slots.push({ id: row === 0 ? "F1" : `${letter}${row}${place.col}`, label: row === 0 ? "F1" : `${letter}${index + 1}`, row, col: place.col, window: place.window });
    });
  });
  const kind = LAYOUT_KINDS.find((item) => {
    const template = SEAT_TEMPLATES[item];
    return template.length === slots.length && template.every((slot) => slots.some((seat) => seat.row === slot.row && seat.col === slot.col));
  });
  const base = kind ? SEAT_TEMPLATES[kind] : slots;
  const used = new Set<string>();
  return base.map((slot) => {
    const kept = previous.find((seat) => seat.row === slot.row && seat.col === slot.col);
    const label = freshLabel(kept?.label.trim() || "", slot.label, used);
    used.add(label.toUpperCase());
    return { ...slot, label };
  });
}

export function kindForCabin(seats: SeatCell[]): CabinLayout {
  for (const kind of LAYOUT_KINDS) {
    const template = SEAT_TEMPLATES[kind];
    if (template.length !== seats.length) continue;
    if (template.every((slot) => seats.some((seat) => seat.row === slot.row && seat.col === slot.col))) return kind;
  }
  return "flex";
}

export function validateCabin(kind: CabinLayout, seats: SeatCell[]): string | null {
  if (kind === "flex") {
    if (seats.length < MIN_PASSENGER_SEATS || seats.length > MAX_PASSENGER_SEATS) return "Choose between 1 and 12 passenger seats.";
    const expected = buildCabin(seats.length);
    if (expected.length !== seats.length || expected.some((slot) => !seats.some((seat) => seat.row === slot.row && seat.col === slot.col))) return "Those seats are not sitting in the right places.";
  }
  const template = kind === "flex" ? buildCabin(seats.length) : SEAT_TEMPLATES[kind];
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
