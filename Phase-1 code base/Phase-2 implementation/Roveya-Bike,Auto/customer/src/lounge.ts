import type { Ionicons } from "@expo/vector-icons";
import type { Reward } from "./types";

type Icon = keyof typeof Ionicons.glyphMap;

export const COINS_PER_CORRECT = 10;
export const TRIVIA_LENGTH = 5;
export const REDEEM_COINS = 100;
export const REDEEM_VALUE = 10;
export const REFERRAL_BONUS = 50;

export type Question = { q: string; options: string[]; answer: number; topic: string };

export const questions: Question[] = [
  { topic: "Hyderabad", q: "In which year was the Charminar built?", options: ["1591", "1687", "1724", "1857"], answer: 0 },
  { topic: "Andhra", q: "Which river flows past Vijayawada?", options: ["Godavari", "Krishna", "Tungabhadra", "Penna"], answer: 1 },
  { topic: "Warangal", q: "Which dynasty built the Thousand Pillar Temple?", options: ["Cholas", "Kakatiyas", "Qutb Shahis", "Vijayanagara"], answer: 1 },
  { topic: "Telangana", q: "Ramappa Temple became a UNESCO World Heritage Site in which year?", options: ["2014", "2017", "2019", "2021"], answer: 3 },
  { topic: "Telangana", q: "On which date was Telangana formed?", options: ["2 June 2014", "1 November 2014", "15 August 2013", "26 January 2015"], answer: 0 },
  { topic: "Hyderabad", q: "Whose statue stands in the middle of Hussain Sagar?", options: ["Ashoka", "Buddha", "Mahavira", "Shivaji"], answer: 1 },
  { topic: "Cricket", q: "In which year did India win its first Cricket World Cup?", options: ["1975", "1983", "1987", "2011"], answer: 1 },
  { topic: "Movies", q: "Which film's song \"Naatu Naatu\" won the Oscar for Best Original Song?", options: ["Baahubali 2", "Pushpa", "RRR", "Eega"], answer: 2 },
  { topic: "Telangana", q: "Pochampally is famous for which craft?", options: ["Ikat weaving", "Bidri metalwork", "Kalamkari", "Pottery"], answer: 0 },
  { topic: "Hyderabad", q: "Golconda was once the world's centre of which trade?", options: ["Silk", "Spices", "Diamonds", "Pearls only"], answer: 2 },
  { topic: "Telangana", q: "Bathukamma is the floral festival of which state?", options: ["Kerala", "Telangana", "Odisha", "Goa"], answer: 1 },
  { topic: "Science", q: "Which is the largest planet in our solar system?", options: ["Saturn", "Neptune", "Jupiter", "Earth"], answer: 2 },
  { topic: "India", q: "What is the national animal of India?", options: ["Lion", "Elephant", "Tiger", "Peacock"], answer: 2 },
  { topic: "Andhra", q: "The Kanaka Durga Temple stands on which hill?", options: ["Indrakeeladri", "Tirumala", "Simhachalam", "Srisailam"], answer: 0 },
  { topic: "Telangana", q: "What is the state bird of Telangana?", options: ["Peacock", "Palapitta", "Parrot", "Myna"], answer: 1 },
  { topic: "Movies", q: "Who directed Baahubali?", options: ["Sukumar", "Trivikram", "S. S. Rajamouli", "Mani Ratnam"], answer: 2 },
  { topic: "Cricket", q: "How many players does a cricket team field at one time?", options: ["9", "10", "11", "12"], answer: 2 },
  { topic: "Telangana", q: "Nagarjuna Sagar Dam is built across which river?", options: ["Krishna", "Godavari", "Musi", "Manjira"], answer: 0 },
  { topic: "Science", q: "Which mission landed India near the Moon's south pole in 2023?", options: ["Mangalyaan", "Chandrayaan-2", "Chandrayaan-3", "Aditya-L1"], answer: 2 },
  { topic: "Telangana", q: "What is the state animal of Telangana?", options: ["Tiger", "Spotted deer", "Blackbuck", "Elephant"], answer: 1 },
];

export function pickQuestions(count = TRIVIA_LENGTH) {
  const pool = [...questions];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

export function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

export function makeReward(): Reward {
  const roll = Math.random();
  if (roll < 0.3) return { kind: "cash", amount: 10 };
  if (roll < 0.5) return { kind: "cash", amount: 15 };
  if (roll < 0.6) return { kind: "cash", amount: 25 };
  if (roll < 0.85) return { kind: "coins", amount: 20 };
  return { kind: "coins", amount: 50 };
}

export function rewardLabel(reward: Reward) {
  return reward.kind === "cash" ? `₹${reward.amount} cashback` : `${reward.amount} coins`;
}

export type GuideSpot = { name: string; line: string; icon: Icon };
export type Guide = { cityId: string; name: string; tagline: string; see: GuideSpot[]; eat: GuideSpot[]; know: string };

export const guides: Guide[] = [
  {
    cityId: "khammam",
    name: "Khammam",
    tagline: "Hill fort, lakes, and temple towns",
    see: [
      { name: "Khammam Fort", line: "A hill fort on Stambhadri hill, with wide views over the old town.", icon: "business-outline" },
      { name: "Lakaram Lake", line: "A lakeside walk and boating, best in the evening.", icon: "water-outline" },
      { name: "Jamalapuram Temple", line: "Sri Venkateswara Swamy temple, known locally as the Telangana Tirupati.", icon: "flower-outline" },
      { name: "Bhadrachalam", line: "The Sri Sita Ramachandra Swamy temple on the Godavari, a popular day trip.", icon: "flower-outline" },
    ],
    eat: [{ name: "Telangana meals", line: "Rice, pappu, pickles, and a spicy curry of the day at local mess halls.", icon: "restaurant-outline" }],
    know: "The ROVEYA Travel Desk is in Khammam. Drop by before your return trip.",
  },
  {
    cityId: "warangal",
    name: "Warangal",
    tagline: "The Kakatiya capital",
    see: [
      { name: "Thousand Pillar Temple", line: "A Kakatiya-era temple in Hanamkonda, famed for its carved pillars.", icon: "flower-outline" },
      { name: "Warangal Fort", line: "The stone Kakatiya gateways that appear on Telangana's state emblem.", icon: "business-outline" },
      { name: "Bhadrakali Temple", line: "A hilltop temple beside Bhadrakali Lake.", icon: "flower-outline" },
      { name: "Ramappa Temple", line: "A UNESCO World Heritage Site at Palampet, a day trip from the city.", icon: "ribbon-outline" },
      { name: "Laknavaram Lake", line: "Islands joined by a hanging bridge, set among green hills.", icon: "water-outline" },
    ],
    eat: [{ name: "Sarva pindi", line: "A crisp Telangana rice-flour pancake, best with evening tea.", icon: "restaurant-outline" }],
    know: "Hanamkonda and Kazipet sit next to Warangal. Tell your captain which one you need.",
  },
  {
    cityId: "vijayawada",
    name: "Vijayawada",
    tagline: "On the banks of the Krishna",
    see: [
      { name: "Kanaka Durga Temple", line: "On Indrakeeladri hill, above the Krishna river.", icon: "flower-outline" },
      { name: "Prakasam Barrage", line: "A long barrage across the Krishna, lit up in the evenings.", icon: "water-outline" },
      { name: "Bhavani Island", line: "A river island with boating and green parks.", icon: "boat-outline" },
      { name: "Undavalli Caves", line: "Rock-cut cave temples with a large reclining Vishnu.", icon: "business-outline" },
    ],
    eat: [{ name: "Andhra meals", line: "Generous, spicy thalis with gongura, pappu, and ghee.", icon: "restaurant-outline" }],
    know: "Benz Circle is the city's central junction and an easy meeting point.",
  },
  {
    cityId: "hyderabad",
    name: "Hyderabad",
    tagline: "City of pearls and biryani",
    see: [
      { name: "Charminar", line: "The 1591 monument at the heart of the old city, with Laad Bazaar beside it.", icon: "business-outline" },
      { name: "Golconda Fort", line: "A hill fort with an evening sound and light show.", icon: "business-outline" },
      { name: "Hussain Sagar", line: "The lake with the Buddha statue, and boat rides from Lumbini Park.", icon: "water-outline" },
      { name: "Salar Jung Museum", line: "A vast collection of art and antiques beside the Musi.", icon: "color-palette-outline" },
    ],
    eat: [
      { name: "Hyderabadi biryani", line: "Slow-cooked dum biryani, the city's signature dish.", icon: "restaurant-outline" },
      { name: "Irani chai", line: "Sweet, milky tea with Osmania biscuits at an old Irani cafe.", icon: "cafe-outline" },
    ],
    know: "LB Nagar is the starting point for ROVEYA taxipools heading east.",
  },
  {
    cityId: "nalgonda",
    name: "Nalgonda",
    tagline: "Dams, temples, and handlooms",
    see: [
      { name: "Nagarjuna Sagar Dam", line: "A masonry dam on the Krishna, with the Nagarjunakonda island museum by boat.", icon: "water-outline" },
      { name: "Chaya Someswara Temple", line: "A temple at Panagal where a shadow rests on the shrine all day.", icon: "flower-outline" },
      { name: "Pochampally", line: "The handloom village famous for ikat sarees, a short drive from Hyderabad.", icon: "shirt-outline" },
    ],
    eat: [{ name: "Telangana meals", line: "Hearty rice meals with spicy curries and fresh buttermilk.", icon: "restaurant-outline" }],
    know: "The Clock Tower Centre is the town's main landmark for pickups.",
  },
  {
    cityId: "suryapet",
    name: "Suryapet",
    tagline: "The highway town between two capitals",
    see: [
      { name: "Phanigiri", line: "A Buddhist heritage site with stupa remains on a hill.", icon: "ribbon-outline" },
      { name: "Mattapalli", line: "The Lakshmi Narasimha Swamy temple on the banks of the Krishna.", icon: "flower-outline" },
    ],
    eat: [{ name: "Highway dhabas", line: "Hot rotis, dal, and tea, a favourite stop on the Vijayawada road.", icon: "restaurant-outline" }],
    know: "Suryapet sits on the Hyderabad and Vijayawada highway, halfway between the two cities.",
  },
];
