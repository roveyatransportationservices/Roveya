import type { ImageSourcePropType } from "react-native";
import { portraits } from "./data";
import { distanceKm } from "./geo";

export type PoolCity = {
  id: string;
  name: string;
  point: string;
  farePerSeat: number;
  latitude: number;
  longitude: number;
};

export const poolCities: PoolCity[] = [
  { id: "hyderabad", name: "Hyderabad", point: "LB Nagar X Roads", farePerSeat: 800, latitude: 17.385, longitude: 78.4867 },
  { id: "khammam", name: "Khammam", point: "ROVEYA Travel Desk", farePerSeat: 500, latitude: 17.2473, longitude: 80.1514 },
  { id: "warangal", name: "Warangal", point: "Hanamkonda Chowrasta", farePerSeat: 450, latitude: 18.0001, longitude: 79.5882 },
  { id: "vijayawada", name: "Vijayawada", point: "Benz Circle", farePerSeat: 700, latitude: 16.5062, longitude: 80.648 },
  { id: "nalgonda", name: "Nalgonda", point: "Clock Tower Centre", farePerSeat: 400, latitude: 17.0575, longitude: 79.2671 },
  { id: "suryapet", name: "Suryapet", point: "New Bus Stand", farePerSeat: 350, latitude: 17.1405, longitude: 79.6204 },
];

export const popularRoutes: [string, string][] = [
  ["hyderabad", "khammam"],
  ["hyderabad", "vijayawada"],
  ["hyderabad", "warangal"],
];

export const SEATS_PER_CAR = 4;

export function cityById(id: string | null) {
  return poolCities.find((city) => city.id === id) ?? null;
}

export function journeyMinutes(from: PoolCity, to: PoolCity) {
  const roadKm = distanceKm(from, to) * 1.3;
  return Math.round((roadKm / 55) * 60 / 5) * 5;
}

export function duration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

type Car = {
  captain: string;
  photo: ImageSourcePropType;
  rating: number;
  trips: number;
  car: string;
  plate: string;
  premium: boolean;
};

const fleet: Car[] = [
  { captain: "Arjun Reddy", photo: portraits.arjun, rating: 4.95, trips: 720, car: "Maruti Ertiga", plate: "TS07 EA 1184", premium: false },
  { captain: "Meera Patel", photo: portraits.meera, rating: 4.9, trips: 540, car: "Toyota Innova Crysta", plate: "TS10 UB 4402", premium: true },
  { captain: "Ravi Kumar", photo: portraits.ravi, rating: 4.88, trips: 1210, car: "Kia Carens", plate: "TS09 FC 7731", premium: false },
];

const slots = [
  [5, 30],
  [7, 0],
  [9, 30],
  [13, 0],
  [16, 30],
  [19, 0],
];

export const PREMIUM_EXTRA = 150;

export type Departure = {
  id: string;
  departAt: number;
  arriveAt: number;
  minutes: number;
  seatsLeft: number;
  farePerSeat: number;
} & Car;

function hash(text: string) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function startOfDay(date: Date) {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function departures(from: PoolCity, to: PoolCity, start: Date, days: number, now = Date.now()): Departure[] {
  const minutes = journeyMinutes(from, to);
  const list: Departure[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const day = addDays(startOfDay(start), offset);
    const dayKey = `${from.id}-${to.id}-${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
    slots.forEach(([hour, minute], index) => {
      const seed = hash(`${dayKey}-${index}`);
      if (seed % 5 === 0) return;
      const depart = new Date(day);
      depart.setHours(hour, minute, 0, 0);
      if (depart.getTime() < now + 30 * 60 * 1000) return;
      const car = fleet[seed % fleet.length];
      list.push({
        id: `${dayKey}-${index}`,
        departAt: depart.getTime(),
        arriveAt: depart.getTime() + minutes * 60 * 1000,
        minutes,
        seatsLeft: (seed >>> 3) % (SEATS_PER_CAR + 1),
        farePerSeat: to.farePerSeat + (car.premium ? PREMIUM_EXTRA : 0),
        ...car,
      });
    });
  }
  return list;
}

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function dayLabel(time: number | Date) {
  const date = new Date(time);
  return `${weekdays[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
}

export function shortDay(time: number | Date) {
  const date = new Date(time);
  return `${date.getDate()} ${months[date.getMonth()]}`;
}

export function monthLabel(date: Date) {
  return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}

export function weekdayShort(date: Date) {
  return weekdays[date.getDay()];
}

export function clock(time: number) {
  const date = new Date(time);
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
}