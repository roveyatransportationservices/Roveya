import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Car, ChevronDown, Gift, Headset, IndianRupee, MapPin, Minus, Smartphone } from "lucide-react";
import { OffersTabs } from "@/components/OffersTabs";
import { PhoneMock } from "@/components/PhoneMock";
import { SearchBox } from "@/components/SearchBox";
import { StoreButtons } from "@/components/StoreButtons";
import { Testimonials } from "@/components/Testimonials";
import { testimonials } from "@/lib/content";
import { POPULAR_ROUTES, cityName, inr, todayIso } from "@/lib/format";
import { loadOffers } from "@/lib/offers";
import { CITIES, suggestedFare } from "@/lib/rules";

export const metadata: Metadata = { title: "Book car seats online", description: "Book a seat in a verified AC car between Hyderabad, Vijayawada, Khammam, Warangal, Tirupati and more. Pick your exact seat, women-only seats, live tracking and instant refunds." };
export const revalidate = 600;

const stats = [
  { value: `${CITIES.length}`, label: "cities on the network" },
  { value: "4 · 6 · 7", label: "seat cars, your pick of seat" },
  { value: "10 min", label: "seats held while you pay" },
  { value: "24×7", label: "safety desk on every trip" },
];

const reasons = [
  ["Pick your exact seat", "Front, window or middle, on the captain's own seat map."],
  ["Booking for Women", "Seats beside a woman are for women only, and women-friendly cars carry a badge."],
  ["Secure your trip", "Free cancellation up to 6 hours before departure, plus travel insurance up to ₹5 lakh."],
  ["Instant refunds", "Cancel online and the refund lands in ROVEYA Cash at once."],
  ["Verified captains", "Licence, RC, insurance and permit checked before a car joins."],
  ["Live car tracking", "Follow the car from boarding to drop, and share the live link with family."],
  ["SOS and safety desk", "Hold SOS in the app and the 24×7 safety desk and your contacts are alerted."],
  ["Real-person support", "Chat or call the desk from 5 AM to 11 PM; the safety line never closes."],
] as const;

const steps = [
  "Open the ROVEYA website or app and go to Book seats.",
  "Enter where you are leaving from, where you are going and the travel date, then click “Search cars”.",
  "The cars leaving that day appear with times, seats left and fares. Choose a car, then tap your seats on its seat map.",
  "Pick your boarding and drop points, and add each traveller's name, age and gender.",
  "Add an offer code if you have one, then pay with UPI, card, net banking or ROVEYA Cash. Your seats are held for 10 minutes while you pay.",
  "Your PNR arrives by SMS at once, and the captain's name and car number 2 hours before departure.",
];

const carTypes = [
  { name: "Hatchback", seats: "4 seats", line: "The lowest seat fares for short city-to-city hops." },
  { name: "Sedan", seats: "4 seats", line: "More legroom and a bigger boot for longer trips." },
  { name: "SUV", seats: "6 or 7 seats", line: "Ertiga, XL6 and similar. Best for families and small groups." },
  { name: "Premium SUV", seats: "6 or 7 seats", line: "Innova Crysta class comfort with captain seats." },
  { name: "Traveller", seats: "Group seats", line: "For large groups heading the same way." },
];

const tips = [
  "Book early on festival weekends and long holidays, when cars fill fast.",
  "Use the departure time and car type filters to find the trip that suits you.",
  "Pick the boarding point nearest to you; metro stations and bus stands are the easiest to find.",
  "Check the captain's rating and the car's amenities before you pick your seat.",
  "Add Secure your trip if your plans might change.",
  "Apply an offer code at the traveller details step to save on your seats.",
];

const pillars = [
  { icon: Headset, title: "Superior customer service", line: "Real people on chat, call and email, and a safety desk that never closes." },
  { icon: IndianRupee, title: "Fair seat prices", line: "You pay for the seat you sit in, with offers that make every trip lighter." },
  { icon: Gift, title: "Unmatched benefits", line: "Women Zone, live tracking, SOS and instant refunds come with every ticket." },
];

const guide = [
  ["Search", "From, to and date. Turn on Booking for women if you like."],
  ["Choose your seat", "Tap a price on the seat map. Pink seats are for women."],
  ["Add travellers", "Name, age, gender, and an offer code."],
  ["Pay and travel", "UPI or card. Track the car live on the day."],
];

const faqs = [
  { q: "Is it safe to book car seats online on ROVEYA?", a: "Yes. Every captain's licence, RC, insurance and permit are checked before their car joins, payments run through Razorpay with encryption, and you choose your seat on the live seat map." },
  { q: "Can I download my ticket after booking?", a: "Yes. Your PNR comes by SMS right after payment, and the ticket in My bookings has a Print ticket button to save it as a PDF." },
  { q: "Can women book women-only seats?", a: "Yes. When a woman books a seat, the seats beside her are kept for women. Turn on Booking for women in search to see women-friendly cars only." },
  { q: "How do I get discounts on ROVEYA?", a: "Check Offers for you on this page, then enter the code at the traveller details step. It is applied when your seats are held." },
  { q: "How do I cancel and get a refund?", a: "Open the ticket in My bookings and click Cancel. The refund goes to ROVEYA Cash at once, by the time-based slabs shown on the ticket." },
  { q: "What happens if the captain cancels the trip?", a: "Every traveller on the trip gets a full refund to ROVEYA Cash, and our desk helps you find another car." },
  { q: "How many seats can I book at once?", a: "Up to 4 seats in one booking. Add the name, age and gender of each traveller." },
  { q: "Can my family track the car?", a: "Yes. Click Track car live on your ticket and share the link. It opens in any browser and ends after the trip." },
];

const moreRoutes: [string, string][] = [...POPULAR_ROUTES, ...POPULAR_ROUTES.map(([from, to]) => [to, from] as [string, string])].filter(
  ([from, to], at, all) => all.findIndex(([a, b]) => a === from && b === to) === at,
);

// One container for every block, so all left edges line up with the header.
const WRAP = "mx-auto w-full max-w-7xl px-5 lg:px-8";

function Heading({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <h2 className="text-[22px] font-semibold leading-tight sm:text-[26px]">{children}</h2>
      {action}
    </div>
  );
}

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="mt-5 space-y-3">
      {items.map((item, at) => (
        <li key={at} className="flex gap-3 text-[15px] leading-7 text-cream/70">
          <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Article({ title, intro, children }: { title: string; intro?: string; children?: React.ReactNode }) {
  return (
    <section className="max-w-4xl">
      <Heading>{title}</Heading>
      {intro ? <p className="mt-4 text-[15px] leading-7 text-cream/70">{intro}</p> : null}
      {children}
    </section>
  );
}

function Fold({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-[15px] font-semibold">
        {title}
        <ChevronDown size={20} className="shrink-0 text-gold transition group-open:rotate-180" />
      </summary>
      <div className="pb-6">{children}</div>
    </details>
  );
}

export default async function BookPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const [{ from, to }, offers] = await Promise.all([searchParams, loadOffers()]);
  const today = todayIso();
  const known = (id?: string) => (id && CITIES.some((city) => city.id === id) ? id : undefined);
  const start = known(from);

  return (
    <>
      <div className="border-b border-gold/15 bg-gradient-to-r from-burgundy via-cherry to-plum">
        <div className={`${WRAP} flex flex-wrap items-center justify-center gap-x-5 gap-y-2 py-2.5 text-sm`}>
          <span className="flex items-center gap-2">
            <Smartphone size={16} className="shrink-0 text-gold" />
            <span>
              <strong className="text-gold">₹200 off</strong> your first seat. Use code <strong className="tracking-wider">ROVEYAFIRST</strong>
            </span>
          </span>
          <Link href="/app" className="rounded-full bg-cream px-4 py-1 text-xs font-semibold text-night transition hover:bg-gold">
            Get the ROVEYA app
          </Link>
        </div>
      </div>

      <section className="relative overflow-hidden">
        <Image src="/images/banner-cab.jpg" alt="" fill priority sizes="100vw" className="object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-night/70 via-night/75 to-night" />
        <div className={`${WRAP} relative pb-14 pt-12 lg:pb-16 lg:pt-16`}>
          <div className="rise max-w-2xl">
            <h1 className="display text-4xl sm:text-5xl lg:text-6xl">
              Your seat on the next ride, <span className="text-gold">city to city</span>
            </h1>
            <p className="mt-4 text-[15px] leading-7 text-cream/70 sm:text-base">Verified AC cars, the exact seat you choose, and live tracking on every trip.</p>
          </div>
          <div id="search" className="rise mt-8 scroll-mt-28" style={{ animationDelay: "100ms" }}>
            <SearchBox key={`${start}-${known(to)}`} initial={{ from: start, to: known(to) }} />
          </div>
        </div>
      </section>

      <div className={`${WRAP} space-y-16 pb-4 sm:space-y-20`}>
        <section>
          <Heading
            action={
              <Link href="/terms" className="pb-1 text-sm text-gold hover:underline">
                Offer terms
              </Link>
            }
          >
            Offers for you
          </Heading>
          <div className="mt-5">
            <OffersTabs offers={offers} />
          </div>
        </section>

        <section className="grid grid-cols-2 overflow-hidden rounded-3xl border border-gold/20 bg-gradient-to-r from-cherry via-plum to-inkwell lg:grid-cols-4">
          {stats.map((item, at) => (
            <div key={item.label} className={`px-6 py-7 sm:px-8 ${at % 2 ? "border-l border-gold/10" : ""} ${at > 1 ? "border-t border-gold/10 lg:border-t-0" : ""} ${at === 2 ? "lg:border-l" : ""}`}>
              <p className="display text-4xl leading-none text-gold sm:text-[44px]">{item.value}</p>
              <p className="mt-3 text-sm leading-5 text-cream/65">{item.label}</p>
            </div>
          ))}
        </section>

        <div className="space-y-14">
          <Article
            title="Book Car Seats Online on ROVEYA"
            intro={`ROVEYA sells single seats in clean, verified AC cars between ${CITIES.length} cities across Telangana, Andhra Pradesh and beyond. Instead of booking a whole cab or standing in a bus queue, you pick the exact seat you want on the captain's own seat map and pay only for that seat. Filter by departure time, car type and boarding point, track the car live on the day, and get refunds in ROVEYA Cash the moment you cancel.`}
          />

          <Article title="Why Choose ROVEYA for Car Seat Booking?" intro="Booking a seat with ROVEYA is simple, safe and fair. Here is what you get on every trip:">
            <Bullets
              items={reasons.map(([label, line]) => (
                <>
                  <strong className="font-semibold text-cream">{label}</strong> – {line}
                </>
              ))}
            />
          </Article>

          <Article title="How to Book a Car Seat on ROVEYA?" intro="The following steps outline the seat booking process:">
            <ol className="mt-5 space-y-3">
              {steps.map((step, at) => (
                <li key={step} className="grid grid-cols-[4.25rem_1fr] text-[15px] leading-7 text-cream/70">
                  <strong className="font-semibold text-gold">Step {at + 1}:</strong>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </Article>

          <section>
            <Article title="Car Types Available with ROVEYA" intro="Captains drive their own cars, so you can choose the comfort and price that suits your trip:" />
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {carTypes.map((item) => (
                <div key={item.name} className="flex items-start gap-4 rounded-2xl border border-gold/15 bg-inkwell p-5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold">
                    <Car size={19} />
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-baseline gap-x-2 font-semibold">
                      {item.name}
                      <span className="text-xs font-medium text-gold">{item.seats}</span>
                    </p>
                    <p className="mt-1 text-sm leading-6 text-cream/60">{item.line}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-6 max-w-4xl text-[15px] leading-7 text-cream/70">Whether you want the lowest fare for a quick trip or an SUV with room for the family, ROVEYA gives you the choice, seat by seat.</p>
          </section>

          <Article title="Exclusive Seat Booking Offers">
            <p className="mt-4 text-[15px] leading-7 text-cream/70">
              New travellers get <strong className="text-cream">₹200 off</strong> the first seat with <strong className="text-gold">ROVEYAFIRST</strong>, women travellers save <strong className="text-cream">15%</strong> on Women Zone seats with <strong className="text-gold">WOMEN15</strong>, and weekend and festival offers appear in Offers for you above. Refunds, cashback and referral rewards in ROVEYA Cash can pay for up to 20% of any booking.
            </p>
          </Article>

          <Article title="Easy Booking Tips for Travellers" intro="A few things to remember when you book seats online:">
            <Bullets items={tips} />
          </Article>
        </div>

        <section>
          <Heading>Why ROVEYA for Seat Booking?</Heading>
          <div className="card mt-6 grid divide-y divide-gold/10 md:grid-cols-3 md:divide-x md:divide-y-0">
            {pillars.map((item) => (
              <div key={item.title} className="flex flex-col items-center px-6 py-10 text-center sm:px-8">
                <span className="relative flex h-20 w-20 items-center justify-center rounded-full border-2 border-gold/40 bg-gradient-to-br from-cherry to-plum text-gold">
                  <item.icon size={30} />
                  <span className="absolute -right-1 top-1 h-2.5 w-2.5 rounded-full bg-rose" />
                  <span className="absolute -left-2 bottom-3 h-2 w-2 rounded-full bg-gold/60" />
                </span>
                <p className="mt-6 text-[13px] font-semibold uppercase tracking-[0.14em]">{item.title}</p>
                <p className="mt-3 max-w-[17rem] text-sm leading-6 text-cream/60">{item.line}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="divide-y divide-gold/15 border-y border-gold/15">
          <Fold title="Top Routes">
            <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              {moreRoutes.map(([a, b]) => (
                <Link key={`${a}-${b}`} href={`/search?from=${a}&to=${b}&date=${today}`} className="-mx-3 flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm text-cream/75 transition hover:bg-mist hover:text-gold">
                  <span className="truncate">
                    {cityName(a)} to {cityName(b)}
                  </span>
                  <span className="shrink-0 text-xs text-gold">from {inr(suggestedFare(a, b, "Hatchback") - 60)}</span>
                </Link>
              ))}
            </div>
          </Fold>
          <Fold title="Top Cities">
            <div className="flex flex-wrap gap-2.5">
              {CITIES.map((city) => (
                <Link key={city.id} href={`/book?from=${city.id}#search`} className="flex items-center gap-1.5 rounded-full border border-gold/15 px-3.5 py-1.5 text-sm text-cream/75 transition hover:border-gold hover:text-gold">
                  <MapPin size={13} className="text-gold" /> {city.name}
                </Link>
              ))}
            </div>
          </Fold>
          <Fold title="Car Types">
            <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {carTypes.map((item) => (
                <li key={item.name} className="text-sm leading-6 text-cream/70">
                  <span className="font-semibold text-cream">{item.name}</span> <span className="text-gold">· {item.seats}</span>
                  <span className="block text-cream/55">{item.line}</span>
                </li>
              ))}
            </ul>
          </Fold>
        </section>

        <section>
          <Heading>How to book car seats online on ROVEYA?</Heading>
          <div className="mt-6 grid items-center gap-10 overflow-hidden rounded-3xl border border-gold/20 bg-gradient-to-br from-cherry via-plum to-inkwell px-6 py-9 sm:px-10 md:grid-cols-[1fr_auto] md:py-10 lg:px-14">
            <div>
              <ol className="space-y-6">
                {guide.map(([title, line], at) => (
                  <li key={title} className="flex items-center gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold text-base font-bold text-night">{at + 1}</span>
                    <span className="min-w-0">
                      <span className="block font-semibold leading-6">{title}</span>
                      <span className="block text-sm leading-6 text-cream/65">{line}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <Link href="#search" className="btn mt-8 text-sm">
                Start booking <ArrowRight size={15} />
              </Link>
            </div>
            <div className="hidden md:block">
              <PhoneMock />
            </div>
          </div>
        </section>

        <section>
          <Heading>Happy seats, happy faces</Heading>
          <div className="mt-6">
            <Testimonials items={testimonials} />
          </div>
        </section>

        <section>
          <Heading>FAQ&apos;s Related to Car Seat Booking with ROVEYA</Heading>
          <div className="mt-6 space-y-3">
            {faqs.map((item, at) => (
              <details key={item.q} open={at < 4} className="group rounded-2xl border border-gold/15 bg-mist/50 px-5 sm:px-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-[15px] font-semibold">
                  {item.q}
                  <Minus size={18} className="hidden shrink-0 text-gold group-open:block" />
                  <ChevronDown size={18} className="shrink-0 text-gold group-open:hidden" />
                </summary>
                <p className="-mt-1 pb-5 text-[15px] leading-7 text-cream/70">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="flex flex-col items-start justify-between gap-6 rounded-3xl border border-gold/25 bg-gradient-to-br from-cherry via-plum to-night px-6 py-8 sm:px-10 lg:flex-row lg:items-center">
          <div>
            <h2 className="display text-3xl">Faster bookings in the ROVEYA app</h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-cream/70">Ticket, live tracking, SOS and trip alerts on your phone. Same account as this website.</p>
          </div>
          <StoreButtons compact />
        </section>
      </div>
    </>
  );
}
