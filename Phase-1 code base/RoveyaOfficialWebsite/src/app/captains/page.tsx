import type { Metadata } from "next";
import Image from "next/image";
import { BadgeCheck, CalendarClock, Car, CheckCircle2, FileCheck2, IndianRupee, Route, Users } from "lucide-react";
import { StoreButtons } from "@/components/StoreButtons";
import { CAPTAIN_APK_URL, CAPTAIN_PLAY_URL, SITE_URL } from "@/lib/format";
import { qrFor } from "@/lib/qr";

export const metadata: Metadata = { title: "Drive with ROVEYA", description: "Publish the city-to-city trips you already drive, sell every empty seat, and get paid daily, weekly or monthly." };

const steps = [
  { icon: FileCheck2, title: "Register in the captain app", line: "Add your details, your car and photos of your documents. Review takes about a day." },
  { icon: Car, title: "Set up your seats", line: "Tell us how many seats your car has and name them. Travellers book from your own seat map." },
  { icon: Route, title: "Publish a trip", line: "Pick the route, time, boarding and drop points and a fare. ROVEYA suggests a fair price." },
  { icon: Users, title: "Drive and get paid", line: "See who booked which seat, mark boarding, and earn into your ROVEYA wallet." },
];

const documents = {
  You: ["Driving licence, front and back", "Aadhaar card", "Your photo", "PAN card (for payouts)"],
  Car: ["Registration certificate (RC)", "Insurance, valid today", "Tourist or contract permit", "Photos of the car, front and inside"],
};

const payouts = [
  { cycle: "Weekly", line: "One payout for every seven days of completed trips. The default for new captains." },
  { cycle: "Daily", line: "Settled after midnight for the day's completed trips." },
  { cycle: "Monthly", line: "One payout for the whole month of completed trips." },
];

export default async function CaptainsPage() {
  const qr = await qrFor(CAPTAIN_PLAY_URL || CAPTAIN_APK_URL || `${SITE_URL}/captains`);
  return (
    <>
      <section className="relative -mt-[76px] overflow-hidden pt-[76px]">
        <Image src="/images/banner-cab.jpg" alt="" fill priority sizes="100vw" className="object-cover opacity-45" />
        <div className="absolute inset-0 bg-gradient-to-r from-night via-night/85 to-night/40" />
        <div className="relative mx-auto max-w-7xl px-5 py-24 lg:px-8 lg:py-32">
          <div className="rise max-w-2xl">
            <p className="kicker">ROVEYA Captains</p>
            <h1 className="display mt-5 text-5xl sm:text-6xl lg:text-7xl">
              Your car. Your route. <span className="text-gold">Every seat filled.</span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-cream/75">You already drive between cities. Publish the trip on ROVEYA, fill the empty seats, and earn on every kilometre.</p>
            <div className="mt-10">
              <StoreButtons play={CAPTAIN_PLAY_URL} appStore="" apk={CAPTAIN_APK_URL} />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-7xl px-5 lg:px-8">
        <div className="grid gap-5 md:grid-cols-3">
          {[
            { icon: IndianRupee, value: "90%", line: "of every seat fare is yours. ROVEYA keeps a 10% commission." },
            { icon: CalendarClock, value: "Your choice", line: "Daily, weekly or monthly payouts straight to your bank." },
            { icon: BadgeCheck, value: "Verified riders", line: "Every traveller logs in with a verified mobile number." },
          ].map((item) => (
            <div key={item.value} className="card p-7">
              <item.icon size={24} className="text-gold" />
              <p className="display mt-4 text-4xl text-gold">{item.value}</p>
              <p className="mt-2 text-sm leading-6 text-cream/65">{item.line}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-24 max-w-7xl px-5 lg:px-8">
        <p className="kicker">How it works</p>
        <h2 className="display mt-4 text-4xl sm:text-5xl">Start earning in four steps</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <div key={step.title} className="card p-7">
              <div className="flex items-center justify-between">
                <step.icon size={24} className="text-gold" />
                <span className="display text-4xl text-gold/30">0{index + 1}</span>
              </div>
              <p className="mt-5 text-lg font-semibold">{step.title}</p>
              <p className="mt-2 text-sm leading-6 text-cream/65">{step.line}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-24 grid max-w-7xl gap-6 px-5 lg:grid-cols-2 lg:px-8">
        <div className="card p-8">
          <p className="kicker">Documents</p>
          <h2 className="display mt-4 text-4xl">Documents to keep ready</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {Object.entries(documents).map(([group, items]) => (
              <div key={group}>
                <p className="text-sm font-semibold text-cream/80">{group === "You" ? "About you" : "About the car"}</p>
                <ul className="mt-3 space-y-2.5 text-sm text-cream/70">
                  {items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-gold" /> {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-8">
          <p className="kicker">Payouts</p>
          <h2 className="display mt-4 text-4xl">Payouts on your terms</h2>
          <div className="mt-6 space-y-3">
            {payouts.map((item) => (
              <div key={item.cycle} className="rounded-2xl border border-gold/15 p-4">
                <p className="font-semibold">{item.cycle}</p>
                <p className="mt-1 text-sm text-cream/60">{item.line}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-cream/45">A cycle you choose runs to its end. A change starts from the next cycle.</p>
        </div>
      </section>

      <section className="mx-auto mt-24 max-w-7xl px-5 lg:px-8">
        <div className="flex flex-col items-center gap-8 rounded-[2rem] border border-gold/25 bg-gradient-to-br from-cherry via-plum to-night p-10 text-center sm:p-14 md:flex-row md:text-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR code for the ROVEYA Captain app" className="h-36 w-36 rounded-2xl border border-gold/30" />
          <div>
            <h2 className="display text-4xl">Get the ROVEYA Captain app</h2>
            <p className="mt-3 max-w-lg text-cream/70">Scan the code with your phone, register in ten minutes, and start publishing trips after review.</p>
          </div>
        </div>
      </section>
    </>
  );
}
