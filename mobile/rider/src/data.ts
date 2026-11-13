import type { Feedback, Place, Trip, Txn, VehicleKind } from "./types";

export const DEMO_LOGIN_CODE = "1234";
export const DEMO_RIDE_OTP = "4821";
export const DESK_PHONE = "tel:+919000000001";
export const DESK_LABEL = "+91 90000 00001";
export const MIN_REDEEM = 100;

export const home: Place = { id: "here", name: "Banjara Hills", subtitle: "Road No. 2", latitude: 17.4156, longitude: 78.4347 };

export const pickups: Place[] = [
  { id: "p-jubilee", name: "Jubilee Hills Check Post", subtitle: "Road No. 36", latitude: 17.4318, longitude: 78.4071 },
  { id: "p-rd12", name: "Road No. 12", subtitle: "Banjara Hills", latitude: 17.4126, longitude: 78.44 },
  { id: "p-panja", name: "Panjagutta Circle", subtitle: "Near Galleria Mall", latitude: 17.4265, longitude: 78.451 },
  { id: "p-ameer", name: "Ameerpet Metro", subtitle: "Gate 2", latitude: 17.4375, longitude: 78.4482 },
  { id: "p-khair", name: "Khairatabad", subtitle: "Raj Bhavan Road", latitude: 17.4116, longitude: 78.46 },
  { id: "p-masab", name: "Masab Tank", subtitle: "NMDC Bus Stop", latitude: 17.401, longitude: 78.452 },
  { id: "p-film", name: "Film Nagar", subtitle: "Apollo Hospital Gate", latitude: 17.414, longitude: 78.409 },
];

export const drops: Place[] = [
  { id: "d-hitech", name: "Hitech City", subtitle: "Cyber Towers", latitude: 17.4435, longitude: 78.3772 },
  { id: "d-gachi", name: "Gachibowli", subtitle: "DLF Cyber City", latitude: 17.4401, longitude: 78.3489 },
  { id: "d-madha", name: "Madhapur", subtitle: "Inorbit Mall", latitude: 17.4483, longitude: 78.3915 },
  { id: "d-secbad", name: "Secunderabad Station", subtitle: "Platform 1 Gate", latitude: 17.4399, longitude: 78.4983 },
  { id: "d-begum", name: "Begumpet", subtitle: "Airport Metro", latitude: 17.444, longitude: 78.467 },
  { id: "d-mehdi", name: "Mehdipatnam", subtitle: "Bus Depot", latitude: 17.395, longitude: 78.438 },
  { id: "d-charm", name: "Charminar", subtitle: "Laad Bazaar", latitude: 17.3616, longitude: 78.4747 },
  { id: "d-konda", name: "Kondapur", subtitle: "Botanical Garden", latitude: 17.46, longitude: 78.355 },
];

export const demandZones: { name: string; latitude: number; longitude: number; level: "High" | "Busy"; radius: number }[] = [
  { name: "Panjagutta", latitude: 17.4265, longitude: 78.451, level: "High", radius: 650 },
  { name: "Jubilee Hills", latitude: 17.4318, longitude: 78.4071, level: "Busy", radius: 700 },
  { name: "Ameerpet", latitude: 17.4375, longitude: 78.4482, level: "High", radius: 550 },
  { name: "Masab Tank", latitude: 17.401, longitude: 78.452, level: "Busy", radius: 500 },
];

export const customerNames = ["Priya", "Rahul", "Sneha", "Arjun", "Fatima", "Kiran", "Divya", "Imran", "Lakshmi", "Vikram", "Ananya", "Suresh"];

export const services: { kind: VehicleKind; title: string; line: string; photo: number; ratio: number; focusX: number }[] = [
  { kind: "bike", title: "Bike", line: "Two-wheeler with a valid licence", photo: require("../assets/cap-banner-earn.jpg"), ratio: 1000 / 563, focusX: 0.7 },
  { kind: "auto", title: "Auto", line: "Three-wheeler with commercial permit", photo: require("../assets/cap-banner-auto.jpg"), ratio: 1000 / 563, focusX: 0.72 },
  { kind: "cab", title: "Cab", line: "4 or 6 seater with yellow plate", photo: require("../assets/cap-banner-cab.jpg"), ratio: 1000 / 563, focusX: 0.86 },
];

export const vehicleTitle: Record<VehicleKind, string> = { bike: "Bike", auto: "Auto", cab: "Cab" };

export const cities = ["Hyderabad", "Khammam", "Warangal", "Vijayawada", "Karimnagar", "Nalgonda"];

export const colorsList = ["Black", "White", "Silver", "Red", "Blue", "Grey", "Yellow"];

const hour = 60 * 60 * 1000;
const day = 24 * hour;

function at(daysAgo: number, h: number, m: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(h, m, 0, 0);
  return date.getTime();
}

const seedPlan: [number, number, number, string, string, number, number, number, number, "cash" | "online", string, number?][] = [
  [0, 8, 12, "Ameerpet Metro", "Hitech City", 9.2, 26, 89, 0, "cash", "Rahul", 5],
  [0, 9, 5, "Road No. 12", "Begumpet", 5.1, 17, 61, 10, "online", "Sneha", 5],
  [0, 10, 20, "Panjagutta Circle", "Madhapur", 8.4, 24, 84, 0, "cash", "Imran", 4],
  [1, 18, 40, "Masab Tank", "Secunderabad Station", 7.8, 28, 80, 10, "cash", "Divya", 5],
  [1, 17, 15, "Film Nagar", "Gachibowli", 9.9, 30, 94, 0, "online", "Kiran", 5],
  [1, 13, 2, "Khairatabad", "Charminar", 6.6, 25, 71, 0, "cash", "Fatima", 4],
  [1, 9, 30, "Jubilee Hills Check Post", "Kondapur", 7.1, 22, 75, 10, "cash", "Vikram", 5],
  [2, 19, 10, "Ameerpet Metro", "Mehdipatnam", 6.2, 21, 68, 0, "online", "Ananya", 5],
  [2, 8, 45, "Road No. 12", "Hitech City", 8.7, 25, 86, 10, "cash", "Lakshmi", 5],
  [3, 18, 5, "Panjagutta Circle", "Secunderabad Station", 6.4, 24, 70, 10, "cash", "Suresh", 4],
  [3, 10, 0, "Film Nagar", "Madhapur", 6.0, 19, 67, 0, "online", "Priya", 5],
  [4, 17, 50, "Masab Tank", "Gachibowli", 11.2, 34, 103, 10, "cash", "Rahul", 5],
  [5, 9, 15, "Khairatabad", "Begumpet", 4.4, 15, 56, 0, "cash", "Sneha", 5],
];

export const seedTrips: Trip[] = seedPlan.map(([ago, h, m, pickup, drop, km, minutes, fare, bonus, payment, customer, ratingReceived], index) => ({
  id: `RV-${2390 - index}`,
  at: at(ago, h, m),
  vehicle: "bike",
  pickup,
  drop,
  km,
  minutes,
  fare,
  bonus,
  tip: index % 5 === 1 ? 10 : 0,
  payment,
  status: "Completed",
  customer,
  ratingGiven: 5,
  ratingReceived,
}));

seedTrips.splice(3, 0, { id: "RV-2387", at: at(0, 11, 2), vehicle: "bike", pickup: "Ameerpet Metro", drop: "Kondapur", km: 0, minutes: 0, fare: 0, bonus: 0, tip: 0, payment: "cash", status: "Cancelled", customer: "Arjun", reason: "Passenger cancelled" });

const online = seedTrips.filter((trip) => trip.status === "Completed" && trip.payment === "online");

export const seedTxns: Txn[] = [
  ...online.map((trip) => ({ id: `t-${trip.id}`, label: `Ride ${trip.id} · online`, amount: trip.fare + trip.tip, at: trip.at + 30 * 60 * 1000 })),
  { id: "t-inc-1", label: "Daily incentive · 6 rides", amount: 80, at: at(1, 23, 59) },
  { id: "t-inc-2", label: "Daily incentive · 3 rides", amount: 30, at: at(3, 23, 59) },
  { id: "t-red-1", label: "Redeemed to bank ••4321", amount: -300, at: at(4, 10, 0) },
  { id: "t-start", label: "Joining bonus", amount: 250, at: at(6, 9, 0) },
].sort((a, b) => b.at - a.at);

export const seedFeedback: Feedback[] = [
  { id: "f1", customer: "Rahul", stars: 5, note: "Reached on time and rode safely.", tags: ["On time", "Safe riding"], at: at(0, 8, 50) },
  { id: "f2", customer: "Imran", stars: 4, note: "Good ride. Helmet was a little loose.", tags: ["Polite"], at: at(0, 10, 50) },
  { id: "f3", customer: "Divya", stars: 5, note: "Very polite captain.", tags: ["Polite", "Clean vehicle"], at: at(1, 19, 15) },
  { id: "f4", customer: "Kiran", stars: 5, note: "Knew the shortcuts in traffic.", tags: ["Knows the route"], at: at(1, 17, 50) },
  { id: "f5", customer: "Suresh", stars: 4, note: "", tags: ["On time"], at: at(3, 18, 40) },
];

export const DAY_MS = day;
