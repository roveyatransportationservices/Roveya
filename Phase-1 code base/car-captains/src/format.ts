import { cityById, istParts } from "./rules";

export const cityName = (id: string) => cityById(id)?.name ?? id.toUpperCase();

export const route = (fromId: string, toId: string) => `${cityName(fromId)} → ${cityName(toId)}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function dayLabel(iso: string) {
  const at = new Date(`${iso}T00:00:00+05:30`);
  const today = istParts(new Date()).date;
  const tomorrow = istParts(new Date(Date.now() + 86400000)).date;
  const prefix = iso === today ? "Today" : iso === tomorrow ? "Tomorrow" : DAYS[new Date(at.getTime() + 330 * 60000).getUTCDay()];
  const shifted = new Date(at.getTime() + 330 * 60000);
  return `${prefix}, ${shifted.getUTCDate()} ${MONTHS[shifted.getUTCMonth()]}`;
}

export function shortDate(isoTime: string) {
  const { date } = istParts(new Date(isoTime));
  const [, month, day] = date.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}

export function nextDays(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const at = new Date(Date.now() + index * 86400000);
    const { date } = istParts(at);
    const shifted = new Date(at.getTime() + 330 * 60000);
    return { iso: date, day: index === 0 ? "Today" : DAYS[shifted.getUTCDay()], date: shifted.getUTCDate(), month: MONTHS[shifted.getUTCMonth()] };
  });
}

export function clock(time: string) {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export const inr = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;
