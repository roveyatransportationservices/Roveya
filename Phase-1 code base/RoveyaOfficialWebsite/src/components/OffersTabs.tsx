"use client";

import { useState } from "react";
import { Check, Copy, Sparkles } from "lucide-react";
import type { Offer } from "@/lib/types";

const TABS = [
  { key: "all", label: "All" },
  { key: "new", label: "First trip", test: /first|new/i },
  { key: "women", label: "Women", test: /women/i },
  { key: "more", label: "Weekend and more", test: /weekend|off your seats|bookings of/i },
] as const;

const TONES = ["from-burgundy to-cherry", "from-plum to-inkwell", "from-cherry to-night", "from-burgundy to-plum"];

export function OffersTabs({ offers }: { offers: Offer[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");
  const [copied, setCopied] = useState("");
  const rule = TABS.find((item) => item.key === tab);
  const shown = offers.filter((offer) => !rule || !("test" in rule) || rule.test.test(`${offer.code} ${offer.title} ${offer.line}`));

  const copy = (code: string) => {
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(code);
      setTimeout(() => setCopied(""), 1800);
    });
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button key={item.key} type="button" className="chip" data-on={tab === item.key} onClick={() => setTab(item.key)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="no-scrollbar -mx-5 mt-6 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-1 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-5 lg:overflow-visible lg:px-0">
        {shown.length ? (
          shown.map((offer, at) => (
            <div key={offer.code} className={`relative flex w-[78%] max-w-[18rem] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-gold/20 bg-gradient-to-br p-5 sm:w-72 lg:w-auto lg:max-w-none ${TONES[at % TONES.length]}`}>
              <Sparkles className="absolute -right-2 -top-2 h-16 w-16 text-gold/10" />
              <span className="self-start rounded-md bg-night/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gold">Car seats</span>
              <p className="mt-3 font-semibold leading-snug">{offer.title}</p>
              <p className="mt-1 flex-1 text-xs leading-5 text-cream/60">{offer.line}</p>
              <button type="button" onClick={() => copy(offer.code)} className="mt-4 inline-flex items-center gap-2 self-start rounded-lg border border-dashed border-gold px-3 py-1.5 text-xs font-bold tracking-widest text-gold transition hover:bg-gold/10">
                {offer.code}
                {copied === offer.code ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
          ))
        ) : (
          <p className="text-sm text-cream/55">No offers in this group right now.</p>
        )}
      </div>
    </div>
  );
}
