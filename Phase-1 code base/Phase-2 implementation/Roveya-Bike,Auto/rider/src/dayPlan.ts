// Keep in step with customer/src/dayPlan.ts. Nested captain screens cannot import that file.
export type RideVehicle = "bike" | "auto";

export type DayPass = { vehicle: RideVehicle; day: string; amount: number; used: boolean };

export type DayBook = {
  passes: DayPass[];
  monthVehicle: RideVehicle | null;
  monthUntil: string | null;
  cancelsOn: string;
  cancels: number;
};

export const EMPTY_DAY_BOOK: DayBook = { passes: [], monthVehicle: null, monthUntil: null, cancelsOn: "", cancels: 0 };

export const CANCEL_AFTER_ARRIVAL = { bike: 20, auto: 30 } as const;
export const CAPTAIN_CANCEL_LIMIT = 3;
export const CITY_RIDE_MAX_KM = 300;
export const PAYOUT_DAYS = "Monday and Thursday";

export function payoutOpen(time = new Date()) {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short" }).format(time);
  return day === "Mon" || day === "Thu";
}

export function istDay(time = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(time);
}

export function addDays(day: string, count: number) {
  const [year, month, date] = day.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + count));
  return next.toISOString().slice(0, 10);
}

// A charged day stays on that date. The next day is a new charge.
export function settleDayBook(book: DayBook, today = istDay()): DayBook {
  return {
    ...book,
    passes: book.passes.filter((pass) => pass.day >= addDays(today, -40)),
    cancels: book.cancelsOn === today ? book.cancels : 0,
    cancelsOn: today,
  };
}

export function monthCovers(book: DayBook, vehicle: RideVehicle, today = istDay()) {
  return book.monthVehicle === vehicle && Boolean(book.monthUntil && book.monthUntil >= today);
}

export function dutyGate(book: DayBook, vehicle: RideVehicle, dayFee: number, today = istDay()) {
  const settled = settleDayBook(book, today);
  if (monthCovers(settled, vehicle, today)) return { ok: true, line: `Month plan covers today. You keep every fare.` };
  const pass = settled.passes.find((item) => item.vehicle === vehicle && item.day === today);
  if (pass) return { ok: true, line: `Today's ₹${pass.amount} is already charged. You keep every fare.` };
  return { ok: true, line: `Going on duty charges ₹${dayFee} once today. You keep every fare.` };
}

export function payDay(book: DayBook, vehicle: RideVehicle, amount: number, today = istDay()): DayBook {
  const settled = settleDayBook(book, today);
  if (settled.passes.some((item) => item.vehicle === vehicle && item.day === today)) return settled;
  return { ...settled, passes: [...settled.passes, { vehicle, day: today, amount, used: false }] };
}

export function payMonth(book: DayBook, vehicle: RideVehicle, today = istDay()): DayBook {
  const settled = settleDayBook(book, today);
  return { ...settled, monthVehicle: vehicle, monthUntil: addDays(today, 29) };
}

export function useDayOnCompletedTrip(book: DayBook, vehicle: RideVehicle, today = istDay()): DayBook {
  const settled = settleDayBook(book, today);
  if (monthCovers(settled, vehicle, today)) return settled;
  let marked = false;
  return {
    ...settled,
    passes: settled.passes.map((pass) => {
      if (marked || pass.used || pass.vehicle !== vehicle || pass.day !== today) return pass;
      marked = true;
      return { ...pass, used: true };
    }),
  };
}

export function noteCaptainCancel(book: DayBook, today = istDay()): DayBook {
  const settled = settleDayBook(book, today);
  return { ...settled, cancels: settled.cancels + 1 };
}

export function offersBlocked(book: DayBook) {
  return book.cancels >= CAPTAIN_CANCEL_LIMIT;
}

export function routeProblem(kilometers: number, samePlace: boolean) {
  if (samePlace) return "Pickup and drop are the same place. Choose a drop.";
  if (kilometers > CITY_RIDE_MAX_KM) return "That drop is too far for a city ride. Book Carpool.";
  return "";
}

export function pickupTooFar(pickupKm: number, tripKm: number) {
  return pickupKm > 3 && pickupKm > tripKm * 2;
}

export const FREE_WAIT_MINUTES = 3;
export const WAIT_PER_MINUTE = 1;
export const WAIT_CAP = 15;

export function waitingCharge(waitedMinutes: number) {
  const billable = Math.max(0, Math.floor(waitedMinutes) - FREE_WAIT_MINUTES);
  return Math.min(WAIT_CAP, billable * WAIT_PER_MINUTE);
}

export function passengerCancelFee(vehicle: RideVehicle, status: string) {
  if (status === "searching" || status === "assigned") return 0;
  if (status === "arrived") return CANCEL_AFTER_ARRIVAL[vehicle];
  return null;
}
