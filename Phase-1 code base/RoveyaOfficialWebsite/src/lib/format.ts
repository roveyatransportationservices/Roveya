import { cityById, istParts } from "./rules";

export const inr = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;

export const cityName = (id: string) => cityById(id)?.name ?? id.toUpperCase();

export const todayIso = () => istParts(new Date()).date;

export function shiftDay(iso: string, days: number) {
  const at = new Date(`${iso}T12:00:00+05:30`);
  at.setUTCDate(at.getUTCDate() + days);
  return istParts(at).date;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function dayParts(iso: string) {
  const at = new Date(`${iso}T12:00:00+05:30`);
  const local = new Date(at.getTime() + 330 * 60000);
  return { day: DAYS[local.getUTCDay()], date: local.getUTCDate(), month: MONTHS[local.getUTCMonth()], year: local.getUTCFullYear() };
}

export function dayLabel(iso: string) {
  const parts = dayParts(iso);
  const today = todayIso();
  const prefix = iso === today ? "Today" : iso === shiftDay(today, 1) ? "Tomorrow" : parts.day;
  return `${prefix}, ${parts.date} ${parts.month}`;
}

export function clock(time: string) {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export const duration = (minutes: number) => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;

export const PLAY_URL = process.env.NEXT_PUBLIC_PLAY_STORE_URL ?? "";
export const APP_STORE_URL = process.env.NEXT_PUBLIC_APP_STORE_URL ?? "";
export const APK_URL = process.env.NEXT_PUBLIC_APK_URL ?? "";
export const CAPTAIN_PLAY_URL = process.env.NEXT_PUBLIC_CAPTAIN_PLAY_STORE_URL ?? "";
export const CAPTAIN_APK_URL = process.env.NEXT_PUBLIC_CAPTAIN_APK_URL ?? "";
export const COMPANY_NAME = "Roveya Transportation Services Private Limited";
export const DESK_PHONE = "+91 99498 56781";
export const DESK_TEL = "tel:+919949856781";
export const DESK_WHATSAPP = "https://wa.me/919949856781";
export const DESK_EMAIL = "roveyatransportationservices@gmail.com";
export const OFFICE_CITY = "Hyderabad, Telangana, India";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3005").replace(/\/$/, "");

export const POPULAR_ROUTES: [string, string][] = [
  ["hyd", "vja"],
  ["hyd", "kmm"],
  ["hyd", "wgl"],
  ["hyd", "tpt"],
  ["hyd", "blr"],
  ["vja", "vsk"],
  ["kmm", "hyd"],
  ["hyd", "ydg"],
];
