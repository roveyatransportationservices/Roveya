import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Contact, Eye, HeartHandshake, Headset, MapPinned, Share2, ShieldCheck, Siren, UserRoundCheck } from "lucide-react";

export const metadata: Metadata = { title: "Safety and Women Zone", description: "Verified captains, women-only seat matching, live tracking, trip sharing and SOS on every ROVEYA trip." };

const layers = [
  { icon: UserRoundCheck, title: "Verified captains", line: "Driving licence, Aadhaar, RC, insurance and permit are checked by the ROVEYA team before a car can publish a trip." },
  { icon: MapPinned, title: "Live trip tracking", line: "The captain app shares the car's position through the trip. Watch it on your ticket from boarding to drop." },
  { icon: Share2, title: "Share with family", line: "One link shows the car, the route and the arrival time. It opens in any browser, no app needed, and ends after the trip." },
  { icon: Siren, title: "SOS in the app", line: "Hold SOS for two seconds. The 24×7 safety desk and your emergency contacts get your live location by SMS." },
  { icon: Eye, title: "Route watch", line: "If a car leaves the route, stops too long or goes too fast, the safety desk is alerted and calls the trip." },
  { icon: Headset, title: "People, not bots", line: "A trained ROVEYA agent answers every safety alert, chat and call." },
];

export default function SafetyPage() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8">
      <div className="max-w-3xl">
        <p className="kicker">Safety</p>
        <h1 className="display mt-4 text-5xl sm:text-6xl">Safety in every seat, on every mile</h1>
        <p className="mt-5 text-lg leading-8 text-cream/70">Six layers of safety are built into every ROVEYA trip. They work quietly in the background, without you having to ask.</p>
      </div>
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {layers.map((item) => (
          <div key={item.title} className="card p-7">
            <item.icon size={26} className="text-gold" />
            <p className="mt-5 text-lg font-semibold">{item.title}</p>
            <p className="mt-2 text-sm leading-6 text-cream/65">{item.line}</p>
          </div>
        ))}
      </div>

      <section id="women" className="mt-24 scroll-mt-24">
        <div className="card grid overflow-hidden lg:grid-cols-2">
          <div className="p-8 sm:p-12">
            <p className="kicker text-rose">Women Zone</p>
            <h2 className="display mt-4 text-4xl sm:text-5xl">Travel beside women, by design</h2>
            <div className="mt-6 space-y-5 text-cream/75">
              <p className="flex gap-3">
                <HeartHandshake size={20} className="mt-1 shrink-0 text-rose" /> When a woman books a seat, the seats beside her are reserved for women. They show in pink on the seat map.
              </p>
              <p className="flex gap-3">
                <ShieldCheck size={20} className="mt-1 shrink-0 text-rose" /> Women-friendly cars carry a badge in search, so you can choose them at a glance.
              </p>
              <p className="flex gap-3">
                <Contact size={20} className="mt-1 shrink-0 text-rose" /> Add up to five emergency contacts in the app. SOS reaches all of them at once.
              </p>
            </div>
            <Link href="/book" className="btn mt-8">
              Book a seat
            </Link>
          </div>
          <div className="relative min-h-[360px]">
            <Image src="/images/cust-car-woman.jpg" alt="A woman travelling with ROVEYA" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
          </div>
        </div>
      </section>

      <section className="mt-16 rounded-3xl border border-danger/30 bg-danger/10 p-8 text-center">
        <p className="text-lg font-semibold">In an emergency, call 112 first.</p>
        <p className="mt-2 text-sm text-cream/70">Then hold SOS in the ROVEYA app so our safety desk can follow up with the captain and your family.</p>
      </section>
    </div>
  );
}
