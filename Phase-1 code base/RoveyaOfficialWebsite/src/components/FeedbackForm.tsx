"use client";

import { useState } from "react";
import Link from "next/link";
import { CarFront, CheckCircle2, Loader2, Star } from "lucide-react";
import { api } from "@/lib/api";

const SEATS = ["Front seat", "Middle row", "Back row", "Window seat"];
const WORDS = ["", "Poor", "Could be better", "Good", "Very good", "Excellent"];

export function FeedbackForm({ routes, preset, car }: { routes: string[]; preset: string; car: string }) {
  const [rating, setRating] = useState(0);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [route, setRoute] = useState(preset);
  const [seat, setSeat] = useState("");
  const [quote, setQuote] = useState("");
  const [consent, setConsent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!rating) return setError("Tap a star to rate your trip.");
    if (name.trim().length < 2) return setError("Tell us your name.");
    if (quote.trim().length < 10) return setError("Write at least a line about your trip.");
    setBusy(true);
    try {
      await api("/reviews", {
        auth: false,
        body: { rating, name: name.trim(), mobile: mobile.trim() || undefined, route: route || undefined, seat: seat || undefined, quote: quote.trim(), car: car || undefined, consent },
      });
      setDone(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="card p-8 text-center">
        <CheckCircle2 size={44} className="mx-auto text-gold" />
        <p className="display mt-4 text-3xl">Thank you, {name.trim().split(/\s+/)[0]}</p>
        <p className="mt-3 text-cream/65">Your review has reached the ROVEYA team. Safe travels, and see you on your next trip.</p>
        <Link href="/book" className="btn mt-8">
          Book your next seat
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-6 p-6 sm:p-8" noValidate>
      {car ? (
        <p className="flex items-center gap-2 text-sm text-cream/60">
          <CarFront size={16} className="text-gold" /> Car <span className="font-semibold tracking-wider text-cream">{car}</span>
        </p>
      ) : null}

      <div>
        <p className="text-sm font-medium">Your rating</p>
        <div className="mt-3 flex items-center gap-2" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((value) => (
            <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`${value} star${value > 1 ? "s" : ""}`} onClick={() => setRating(value)} className="p-1 transition active:scale-90">
              <Star size={36} className={value <= rating ? "fill-gold text-gold" : "text-cream/25"} />
            </button>
          ))}
        </div>
        <p className="mt-1 h-5 text-sm text-gold">{WORDS[rating]}</p>
      </div>

      <label className="block">
        <span className="text-sm font-medium">Your name</span>
        <input className="field mt-2" value={name} onChange={(event) => setName(event.target.value)} placeholder="As you'd like it shown" maxLength={60} autoComplete="name" />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Route</span>
        <select className="field mt-2" value={route} onChange={(event) => setRoute(event.target.value)}>
          <option value="">Select your route</option>
          {routes.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      <div>
        <p className="text-sm font-medium">Where did you sit?</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SEATS.map((item) => (
            <button key={item} type="button" className="chip" data-on={seat === item} onClick={() => setSeat(seat === item ? "" : item)}>
              {item}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="text-sm font-medium">Tell us about your trip</span>
        <textarea className="field mt-2 min-h-32 resize-y" value={quote} onChange={(event) => setQuote(event.target.value)} placeholder="The car, the captain, the comfort, anything that stood out" maxLength={600} />
        <span className="mt-1 block text-right text-xs text-cream/40">{quote.length}/600</span>
      </label>

      <label className="block">
        <span className="text-sm font-medium">
          Mobile number <span className="text-cream/45">(optional)</span>
        </span>
        <input className="field mt-2" value={mobile} onChange={(event) => setMobile(event.target.value.replace(/[^\d+ ]/g, ""))} placeholder="So we can follow up if needed" inputMode="tel" maxLength={14} autoComplete="tel" />
        <span className="mt-1 block text-xs text-cream/45">Never shown on the website.</span>
      </label>

      <label className="flex items-start gap-3 text-sm text-cream/70">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 h-4 w-4 accent-[#d6a000]" />
        ROVEYA may show my first name, route and review on its website.
      </label>

      {error ? <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p> : null}

      <button type="submit" className="btn w-full" disabled={busy}>
        {busy ? <Loader2 size={18} className="animate-spin" /> : null}
        {busy ? "Sending" : "Send my review"}
      </button>
    </form>
  );
}
