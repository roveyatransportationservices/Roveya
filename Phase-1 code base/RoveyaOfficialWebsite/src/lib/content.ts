// Static copy for the help and policy pages. Legal text gets a final review before launch.
import { COMPANY_NAME, DESK_EMAIL, DESK_PHONE, DESK_TEL, DESK_WHATSAPP, OFFICE_CITY } from "./format";

export type Section = { title: string; items: { q?: string; body: string }[] };

export const faqGroups: Section[] = [
  {
    title: "Online Booking Related",
    items: [
      { q: "How do I book a seat?", body: "Pick your cities and date on Home, choose a car, tap the seats you want, pick boarding and drop points, add traveller details, and pay." },
      { q: "Can I book the whole car?", body: "Yes. Select every seat in the car. Full-car bookings with your own route arrive in the next release." },
      { q: "Will I get a ticket?", body: "Your ticket and PNR come by SMS and are always in Bookings. Show either at boarding." },
    ],
  },
  {
    title: "ROVEYA Cash Related",
    items: [
      { q: "What is ROVEYA Cash?", body: "Your ROVEYA travel wallet. Refunds, cashback, and referral rewards land here and can pay up to 20% of any booking." },
      { q: "Does ROVEYA Cash expire?", body: "Refunds never expire. Promotional cash expires 12 months after it is added." },
    ],
  },
  {
    title: "Cancellation Related",
    items: [
      { q: "How do I cancel?", body: "Open the ticket in Bookings and tap Cancel, or use Cancel Booking in Account with your PNR and mobile number." },
      { q: "How much do I get back?", body: "It depends on how many hours before departure you cancel. The slabs are on every trip and ticket." },
    ],
  },
  {
    title: "Payments Related",
    items: [
      { q: "Which payment methods work?", body: "UPI, debit and credit cards, net banking, and ROVEYA Cash. Payments are processed by Razorpay." },
      { q: "Money left my account but no ticket came", body: "If the seat was not confirmed, the money returns to the source within 5 to 7 working days. Call the desk with the UPI reference to check." },
    ],
  },
  {
    title: "Refunds Related",
    items: [{ q: "When does my refund arrive?", body: "Instantly to ROVEYA Cash, or 3 to 5 working days to UPI, card, or bank." }],
  },
  {
    title: "Captain and Operator Related",
    items: [
      { q: "Who drives the car?", body: "A ROVEYA captain who is background checked, licence verified, and trained in safe driving and passenger care." },
      { q: "When do I get the captain's details?", body: "Name, photo, phone, and car number arrive 2 hours before boarding." },
    ],
  },
  {
    title: "Discounts and Offers",
    items: [{ q: "Where do I enter a coupon?", body: "On the review screen, under Offers. One coupon per booking." }],
  },
  {
    title: "Free Cancellation Related",
    items: [{ q: "What does Secure your trip include?", body: "Free cancellation up to 6 hours before departure, travel insurance up to ₹5 lakh, and priority support, for ₹19 a seat." }],
  },
  {
    title: "Women Zone Related",
    items: [{ q: "How does Women Zone work?", body: "A seat next to a woman traveller opens only to women and shows in pink on the seat map." }],
  },
  {
    title: "Other Information",
    items: [{ q: "Can I carry luggage?", body: "One cabin bag and one medium suitcase per seat. Bigger loads need the full boot; ask the desk." }],
  },
];

export const termsSections: Section[] = [
  { title: "General Terms and Conditions", items: [{ body: "ROVEYA is a platform that sells seats in cars run by ROVEYA and its verified partners. Booking a seat means you accept these terms, the cancellation policy of the trip, and the travel guidelines." }] },
  { title: "ROVEYA Cash Terms and Conditions", items: [{ body: "ROVEYA Cash cannot be withdrawn as money. Promotional cash expires after 12 months. Up to 20% of a booking can be paid with ROVEYA Cash." }] },
  { title: "Offers and Discounts", items: [{ body: "One coupon per booking. Offers cannot be combined and may change or end at any time." }] },
  { title: "ROVEYA Responsibility", items: [{ body: "ROVEYA issues the ticket, assigns a verified captain and car, shares trip details on time, and handles refunds as per policy." }] },
  { title: "What ROVEYA Is Not Responsible For", items: [{ body: "Delays from traffic, weather, road closures, or events outside our control, and personal items left in the car, though the desk helps you recover them." }] },
  { title: "Failed Transactions", items: [{ body: "If payment succeeds but the seat is not confirmed, the full amount returns to the source within 5 to 7 working days." }] },
  { title: "Cancellation Policy", items: [{ body: "Refunds follow the slab shown on the trip: 100% more than 48 hours before, 90% from 24 to 48 hours, 75% from 6 to 24 hours, 50% from 2 to 6 hours, and none in the last 2 hours." }] },
  { title: "Refunds Policy", items: [{ body: "Refunds go to ROVEYA Cash instantly, or to the original payment method in 3 to 5 working days." }] },
  { title: "Free Cancellation Terms and Conditions", items: [{ body: "With Secure your trip, cancellation up to 6 hours before departure is free. The ₹19 fee itself is not refunded." }] },
  { title: "ROVEYA Assured Terms and Conditions", items: [{ body: "Assured cars are under 3 years old and driven by captains rated 4.5 or more. If an Assured trip is cancelled by us, you get a full refund plus ₹100 ROVEYA Cash." }] },
  { title: "Travel Guidelines", items: [{ body: "Carry a government photo ID. Reach 10 minutes early. No smoking, alcohol, or loud calls. Wear the seat belt." }] },
  { title: "Insurance Terms", items: [{ body: "Insurance under Secure your trip covers accidental injury up to ₹5 lakh during the trip, from boarding to drop." }] },
  { title: "Change Contact, Boarding and Dropping Terms", items: [{ body: "Contact details and boarding or drop points can be changed up to 2 hours before departure from the ticket, free of charge." }] },
  { title: "Change Date (Reschedule) Terms", items: [{ body: "Reschedule up to 12 hours before departure to another car on the same route. Any fare difference is collected or refunded to ROVEYA Cash." }] },
];

export const privacySections: Section[] = [
  { title: "What We Collect", items: [{ body: "Your mobile number, name, email if you add it, traveller details, trip history, and payment status. We never see your card number or UPI PIN." }] },
  { title: "How We Use It", items: [{ body: "To book seats, send tickets and captain details, process refunds, keep trips safe, and show offers you have agreed to receive." }] },
  { title: "Location", items: [{ body: "Used only to suggest nearby boarding points and for live trip sharing when you choose to share." }] },
  { title: "Sharing", items: [{ body: "Your first name and seat number reach the captain. Payment partners see what they need to process a payment. We never sell your data." }] },
  { title: "Emergency Contacts", items: [{ body: "Your emergency contacts get your live location and car details only when you tap SOS or share a trip." }] },
  { title: "Your Rights", items: [{ body: "Ask the desk to see, correct, export, or delete your data at any time. We reply within 7 days." }] },
  { title: "Grievance Officer", items: [{ body: `Write to ${DESK_EMAIL}. We acknowledge within 24 hours and resolve within 15 days.` }] },
];

export const aboutParagraphs = [
  `ROVEYA is the travel brand of ${COMPANY_NAME}, founded in Hyderabad by Shaik Asif Nawaz. The name comes from the idea of travelling together, and the promise is simple: your own seat in a clean, verified car between the cities you travel, booked in a minute.`,
  "We began on the Hyderabad, Khammam and Vijayawada roads, where buses run full and a private cab costs too much for one person. A shared car with a fixed seat price sits right in between: faster than the bus, fairer than a cab.",
  "Every captain is background checked and trained. Every traveller chooses their own seat, and seats beside women are kept for women. Every trip can be tracked live and shared with family.",
  "We build the technology ourselves: the seat booking website and app, the captain app, live tracking, and a support desk staffed by real people.",
];

export const contactCards: { title: string; lines: { label: string; value: string; link?: string; action?: "help" }[] }[] = [
  { title: "Bookings and support", lines: [{ label: "Chat", value: "Chat with us", action: "help" }, { label: "Phone", value: DESK_PHONE, link: DESK_TEL }] },
  { title: "Full car and groups", lines: [{ label: "Phone", value: DESK_PHONE, link: DESK_TEL }, { label: "Email", value: DESK_EMAIL, link: `mailto:${DESK_EMAIL}` }] },
  { title: "Captains and partners", lines: [{ label: "WhatsApp", value: DESK_PHONE, link: DESK_WHATSAPP }, { label: "Email", value: DESK_EMAIL, link: `mailto:${DESK_EMAIL}` }] },
  { title: "Press and media", lines: [{ label: "Email", value: DESK_EMAIL, link: `mailto:${DESK_EMAIL}` }] },
];

export const officeAddress = [COMPANY_NAME, OFFICE_CITY];

export type Testimonial = { name: string; role: string; route: string; seat: string; rating: number; quote: string; image: string; alt: string };

// Sample stories for launch. Swap them for real traveller reviews (with consent) as they come in.
export const testimonials: Testimonial[] = [
  {
    name: "Sravani K.",
    role: "Student, travels home every month",
    route: "Hyderabad → Vijayawada",
    seat: "Window seat M1",
    rating: 5,
    quote: "I pick the same window seat every time and the seat beside me stays women only. My mother watches the car on the live link until I reach Benz Circle.",
    image: "/images/happy/woman-window.jpg",
    alt: "A young woman laughing by the window in a ROVEYA car",
  },
  {
    name: "Rahul, Arjun and Meghana",
    role: "Friends on a weekend trip",
    route: "Hyderabad → Warangal",
    seat: "Middle row M1, M2, M3",
    rating: 5,
    quote: "We booked the whole middle row for less than one cab fare. Clean car, good music, and the captain waited two minutes when we were late at the metro.",
    image: "/images/happy/friends-backseat.jpg",
    alt: "Three friends laughing together in the back seat of a car",
  },
  {
    name: "Karthik R.",
    role: "Software engineer, weekly commute",
    route: "Khammam → Hyderabad",
    seat: "Front seat F1",
    rating: 5,
    quote: "Monday 5 AM, front seat, laptop on my lap and at my desk by nine. Booking takes less than a minute and the refund came instantly when a meeting moved.",
    image: "/images/happy/professional-front.jpg",
    alt: "A smiling professional in the front seat of a car",
  },
  {
    name: "Lakshmi and Divya",
    role: "Mother and daughter",
    route: "Vijayawada → Visakhapatnam",
    seat: "Middle row M2, M3",
    rating: 5,
    quote: "Two seats together in the middle row, AC working the whole way, and the captain helped with our bags. It felt like travelling in our own car.",
    image: "/images/happy/mother-daughter.jpg",
    alt: "A mother and daughter laughing at a phone in a car",
  },
  {
    name: "Venkat Rao and Saroja",
    role: "Retired, temple trips",
    route: "Hyderabad → Tirupati",
    seat: "Middle row M1, M2",
    rating: 5,
    quote: "Our son booked from the website and got the car number two hours before. The captain drove carefully and stopped for tea. We will go again in Karthika masam.",
    image: "/images/happy/elderly-couple.jpg",
    alt: "An elderly couple smiling in the back seat of a car",
  },
  {
    name: "Anusha and Pooja",
    role: "Colleagues travelling home",
    route: "Hyderabad → Khammam",
    seat: "Back row B1, B2",
    rating: 5,
    quote: "Evening trip after office, two women together and a women-friendly car. We shared the live trip with both our families and slept half the way.",
    image: "/images/happy/women-selfie.jpg",
    alt: "Two women friends taking a selfie in a car at dusk",
  },
];

export const happyMoments = [
  { image: "/images/happy/friends-backseat.jpg", caption: "Weekend in Warangal" },
  { image: "/images/happy/woman-window.jpg", caption: "Home for Sankranti" },
  { image: "/images/happy/elderly-couple.jpg", caption: "Darshan at Tirumala" },
  { image: "/images/happy/women-selfie.jpg", caption: "Office to home, together" },
  { image: "/images/cust-pool-group.jpg", caption: "Four friends, one car" },
  { image: "/images/happy/mother-daughter.jpg", caption: "Vizag beach holiday" },
  { image: "/images/happy/professional-front.jpg", caption: "Monday morning commute" },
  { image: "/images/cust-car-woman.jpg", caption: "Solo, and safe" },
];

export const feedbackTopics = ["Android App", "iPhone App", "Website", "Booking and payment", "Captain", "Car and comfort", "Refund"];

export type BlogPost = { id: string; title: string; summary: string; body: string[]; read: string; date: string; image: string };

export const blogPosts: BlogPost[] = [
  {
    id: "b1",
    title: "Front, window, or middle: picking your seat",
    summary: "Why the front seat and window seats sell out first on long routes.",
    body: ["On trips over 4 hours, travellers pick the front seat and windows first. The front seat has the most legroom; windows give a view and a place to rest your head.", "Middle seats cost ₹40 less, so they are the smart pick on short hops like Hyderabad to Yadagirigutta."],
    read: "3 min read",
    date: "26 Oct",
    image: "/images/cust-pool-group.jpg",
  },
  {
    id: "b2",
    title: "Women Zone: how seat matching works",
    summary: "A seat beside a woman traveller opens only to women. Here is how.",
    body: ["When a woman books a seat, the seats beside her in the same row turn pink and only women can book them.", "Cars marked women friendly already have women travellers booked or a woman captain."],
    read: "4 min read",
    date: "21 Oct",
    image: "/images/cust-car-woman.jpg",
  },
  {
    id: "b3",
    title: "Tirupati by car: an early-morning plan",
    summary: "Leave Hyderabad at 4 AM and reach in time for the afternoon darshan.",
    body: ["The 4 AM ROVEYA Prime cars reach Tirupati by early afternoon with one tea stop near Kurnool.", "Book Secure your trip for free cancellation if your darshan slot changes."],
    read: "5 min read",
    date: "14 Oct",
    image: "/images/hero-car.jpg",
  },
  {
    id: "b4",
    title: "Meet our captains",
    summary: "Ravi has driven 2,400 ROVEYA trips without a single late start.",
    body: ["Ravi Kumar from Khammam joined ROVEYA in 2025. He checks tyres and AC before every trip and greets every traveller by name.", "Our captains train for two days on safety and passenger care before their first trip."],
    read: "2 min read",
    date: "8 Oct",
    image: "/images/banner-cab.jpg",
  },
];
