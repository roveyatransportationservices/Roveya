"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { OffersTabs } from "@/components/OffersTabs";
import type { Offer } from "@/lib/types";

const SHELL = "Offers from the desk will appear here.";

export function LiveOffers({ place }: { place: "home" | "tabs" }) {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let gone = false;
    fetch("/api/public-offers")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("offers"))))
      .then((data: { offers?: Offer[]; ok?: boolean }) => {
        if (gone) return;
        setOk(Boolean(data.ok));
        setOffers(Array.isArray(data.offers) ? data.offers : []);
      })
      .catch(() => {
        if (gone) return;
        setOk(false);
        setOffers([]);
      });
    return () => {
      gone = true;
    };
  }, []);

  if (!offers) return <p className="text-sm text-cream/55">{SHELL}</p>;
  if (!ok || offers.length === 0) return <p className="text-sm text-cream/55">{SHELL}</p>;
  if (place === "tabs") return <OffersTabs offers={offers} />;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {offers.slice(0, 3).map((offer, index) => (
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
  );
}
