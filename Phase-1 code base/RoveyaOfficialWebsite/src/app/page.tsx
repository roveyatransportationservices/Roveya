import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import { ArrowRight, BadgeCheck, Car, ChevronDown, CreditCard, HeartHandshake, MapPinned, Siren, Sparkles, Star, Ticket, UserRoundCheck, Wallet } from "lucide-react";
import { PhoneMock } from "@/components/PhoneMock";
import { SearchBox } from "@/components/SearchBox";
import { StoreButtons } from "@/components/StoreButtons";
import { HappyStrip } from "@/components/HappyStrip";
import { Testimonials } from "@/components/Testimonials";
import { faqGroups, happyMoments } from "@/lib/content";
import { loadReviews } from "@/lib/reviews";
import { POPULAR_ROUTES, SITE_URL, cityName, inr, todayIso } from "@/lib/format";
import { driveMinutes, suggestedFare } from "@/lib/rules";
import { loadOffers } from "@/lib/offers";

export const revalidate = 600;

const steps = [
  { icon: MapPinned, title: "Find your route", line: "Choose your cities and travel date. Every departure shows its time, seats left and fare." },
  { icon: Car, title: "Choose your seat", line: "Front, window or middle. You see the captain's actual car, seat by seat." },
  { icon: CreditCard, title: "Pay securely", line: "UPI, cards, net banking or ROVEYA Cash. Your seats stay held while you pay." },
  { icon: Ticket, title: "Board and relax", line: "Captain details arrive 2 hours before departure. Follow the car live and share it with family." },
];

const promises = [
  { icon: UserRoundCheck, title: "Verified captains", line: "Licence, RC, insurance and permit checked, with police verification before the first trip." },
  { icon: MapPinned, title: "Live tracking", line: "Follow the car on the map and share a live link your family opens without an app." },
  { icon: Siren, title: "SOS on every trip", line: "Hold for two seconds and the safety desk and your emergency contacts receive your location." },
  { icon: Wallet, title: "Instant refunds", line: "Cancel online and your refund lands in ROVEYA Cash at once, by clear time-based slabs." },
];

export default async function Home() {
  const [list, testimonials, qr] = await Promise.all([loadOffers(), loadReviews(), QRCode.toDataURL(`${SITE_URL}/app`, { margin: 1, width: 220, color: { dark: "#12060D", light: "#F6F1DC" } })]);
  const today = todayIso();
  const faqs = faqGroups.flatMap((group) => group.items.filter((item) => item.q)).slice(0, 7);

  return (
    <>
      {/* Hero */}
      <section className="relative -mt-[76px] overflow-hidden pt-[76px]">
        <Image src="/images/hero-car.jpg" alt="" fill priority sizes="100vw" className="object-cover object-center opacity-55" />
        <div className="absolute inset-0 bg-gradient-to-b from-night/70 via-night/55 to-night" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(107,24,56,0.55),transparent_55%)]" />
        <div className="relative mx-auto max-w-7xl px-5 pb-16 pt-16 sm:pt-24 lg:px-8 lg:pb-24">
          <div className="rise max-w-3xl">
            <p className="kicker">Premium intercity car seats · Telangana and Andhra Pradesh</p>
            <h1 className="display mt-5 text-5xl sm:text-6xl lg:text-7xl">
              Reserve your seat.
              <br />
              <span className="text-gold">Arrive in comfort.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-cream/75">Clean AC cars and verified captains between the cities you travel. Choose your exact seat, pay only for that seat, and follow the journey live from pickup to drop.</p>
          </div>
          <div id="book" className="rise mt-10 scroll-mt-28" style={{ animationDelay: "120ms" }}>
            <SearchBox />
          </div>
          <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 text-sm text-cream/70">
            {["Verified captains", "Women-only seats", "Live tracking and SOS", "Instant refunds"].map((item) => (
              <span key={item} className="flex items-center gap-2">
                <BadgeCheck size={16} className="text-gold" /> {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Offers */}
      <section className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          {list.slice(0, 3).map((offer, index) => (
            <div key={offer.code} className={`relative overflow-hidden rounded-3xl border border-gold/20 p-6 ${index === 0 ? "bg-gradient-to-br from-burgundy to-cherry" : index === 1 ? "bg-gradient-to-br from-plum to-inkwell" : "bg-gradient-to-br from-cherry to-night"}`}>
              <Sparkles className="absolute -right-3 -top-3 h-24 w-24 text-gold/10" />
              <p className="kicker">Offer</p>
              <p className="mt-3 text-xl font-semibold">{offer.title}</p>
              <p className="mt-1 text-sm text-cream/65">{offer.line}</p>
              <p className="mt-5 inline-flex overflow-hidden rounded-lg border border-dashed border-gold text-xs font-bold tracking-widest">
                <span className="bg-gold px-2 py-1.5 text-night">CODE</span>
                <span className="px-3 py-1.5 text-gold">{offer.code}</span>
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto mt-28 max-w-7xl px-5 lg:px-8">
        <div className="max-w-2xl">
          <p className="kicker">How it works</p>
          <h2 className="display mt-4 text-4xl sm:text-5xl">Four simple steps to your seat</h2>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <div key={step.title} className="card p-7">
              <div className="flex items-center justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gold/30 bg-night text-gold">
                  <step.icon size={22} />
                </span>
                <span className="display text-4xl text-gold/30">0{index + 1}</span>
              </div>
              <p className="mt-6 text-lg font-semibold">{step.title}</p>
              <p className="mt-2 text-sm leading-6 text-cream/65">{step.line}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Popular routes */}
      <section className="mx-auto mt-28 max-w-7xl px-5 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="kicker">Popular routes</p>
            <h2 className="display mt-4 text-4xl sm:text-5xl">Routes travellers love</h2>
          </div>
          <Link href="/book" className="flex items-center gap-2 text-sm text-gold">
            Explore all routes <ArrowRight size={16} />
          </Link>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {POPULAR_ROUTES.map(([from, to]) => (
            <Link key={`${from}-${to}`} href={`/search?from=${from}&to=${to}&date=${today}`} className="group card p-6 transition hover:-translate-y-1 hover:border-gold/60">
              <p className="text-lg font-semibold">{cityName(from)}</p>
              <div className="my-3 flex items-center gap-2 text-gold">
                <span className="h-px flex-1 bg-gold/30" />
                <Car size={16} />
                <span className="h-px flex-1 bg-gold/30" />
              </div>
              <p className="text-lg font-semibold">{cityName(to)}</p>
              <div className="mt-5 flex items-center justify-between text-sm">
                <span className="text-cream/55">about {Math.round(driveMinutes(from, to) / 60)} h</span>
                <span className="font-semibold text-gold">from {inr(suggestedFare(from, to, "Hatchback") - 60)}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Women Zone */}
      <section className="mx-auto mt-28 max-w-7xl px-5 lg:px-8">
        <div className="card grid overflow-hidden lg:grid-cols-2">
          <div className="relative min-h-[320px]">
            <Image src="/images/cust-car-woman.jpg" alt="A woman traveller in a ROVEYA car" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-inkwell/80 lg:to-inkwell" />
          </div>
          <div className="p-8 sm:p-12">
            <p className="kicker text-rose">Women Zone</p>
            <h2 className="display mt-4 text-4xl sm:text-5xl">Travel beside women, by design</h2>
            <p className="mt-5 leading-8 text-cream/70">When a woman books a seat, the seats beside her turn pink and only women can book them. Women-friendly cars appear first when you travel alone.</p>
            <ul className="mt-6 space-y-3 text-sm text-cream/80">
              {["Seat matching on every car, every trip", "Share your live trip with family in one tap", "SOS reaches the 24×7 safety desk and your contacts", "15% off with WOMEN15 on Women Zone seats"].map((item) => (
                <li key={item} className="flex gap-3">
                  <HeartHandshake size={18} className="shrink-0 text-rose" /> {item}
                </li>
              ))}
            </ul>
            <Link href="/safety" className="btn-ghost mt-8">
              See how we keep you safe <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* Promises */}
      <section className="mx-auto mt-28 max-w-7xl px-5 lg:px-8">
        <div className="max-w-2xl">
          <p className="kicker">The ROVEYA promise</p>
          <h2 className="display mt-4 text-4xl sm:text-5xl">Comfort and safety you can count on</h2>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {promises.map((item) => (
            <div key={item.title} className="rounded-3xl border border-gold/15 bg-gradient-to-b from-mist to-inkwell p-7">
              <item.icon size={26} className="text-gold" />
              <p className="mt-5 text-lg font-semibold">{item.title}</p>
              <p className="mt-2 text-sm leading-6 text-cream/65">{item.line}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="mx-auto mt-28 max-w-7xl px-5 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="kicker">Traveller stories</p>
            <h2 className="display mt-4 text-4xl sm:text-5xl">Journeys worth sharing</h2>
          </div>
          <p className="flex items-center gap-2 text-sm text-cream/60">
            <span className="flex text-gold">
              {[0, 1, 2, 3, 4].map((star) => (
                <Star key={star} size={16} fill="currentColor" />
              ))}
            </span>
            Rated by travellers after every trip
          </p>
        </div>
        <div className="mt-10">
          <Testimonials items={testimonials} />
        </div>
      </section>

      {/* Happy moments */}
      <section className="mt-24">
        <p className="kicker text-center">On the road with ROVEYA</p>
        <h2 className="display mx-auto mt-4 max-w-2xl px-5 text-center text-4xl sm:text-5xl">Moments from every mile</h2>
        <div className="mt-10">
          <HappyStrip items={happyMoments} />
        </div>
      </section>

      {/* App download */}
      <section id="app" className="mx-auto mt-28 max-w-7xl scroll-mt-24 px-5 lg:px-8">
        <div className="relative overflow-hidden rounded-[2rem] border border-gold/25 bg-gradient-to-br from-cherry via-plum to-night px-6 py-14 sm:px-12 lg:px-16">
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="kicker">The ROVEYA app</p>
              <h2 className="display mt-4 text-4xl sm:text-5xl">The whole journey, in your pocket</h2>
              <p className="mt-5 max-w-lg leading-8 text-cream/75">One account across the website and the app. The app adds live tracking, SOS, captain details and trip alerts right on your phone.</p>
              <div className="mt-8">
                <StoreButtons />
              </div>
              <div className="mt-8 flex items-center gap-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="Scan to download the ROVEYA app" className="h-28 w-28 rounded-2xl border border-gold/30" />
                <p className="max-w-[14rem] text-sm leading-6 text-cream/65">Scan with your phone camera to get the app.</p>
              </div>
            </div>
            <PhoneMock />
          </div>
        </div>
      </section>

      {/* Captains */}
      <section className="mx-auto mt-28 max-w-7xl px-5 lg:px-8">
        <div className="relative overflow-hidden rounded-[2rem] border border-gold/20">
          <Image src="/images/banner-cab.jpg" alt="" fill sizes="100vw" className="object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-r from-night via-night/85 to-night/30" />
          <div className="relative max-w-xl px-8 py-16 sm:px-12">
            <p className="kicker">For car owners</p>
            <h2 className="display mt-4 text-4xl sm:text-5xl">Your car. Your route. Every seat filled.</h2>
            <p className="mt-5 leading-8 text-cream/75">Publish the trips you already drive and earn from every empty seat, with daily, weekly or monthly payouts straight to your bank.</p>
            <Link href="/captains" className="btn mt-8">
              Become a ROVEYA captain <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto mt-28 max-w-4xl px-5 lg:px-8">
        <p className="kicker text-center">Questions</p>
        <h2 className="display mt-4 text-center text-4xl sm:text-5xl">Everything you need to know</h2>
        <div className="mt-10 space-y-3">
          {faqs.map((item) => (
            <details key={item.q} className="group card px-6 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {item.q}
                <ChevronDown size={18} className="shrink-0 text-gold transition group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm leading-7 text-cream/65">{item.body}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
