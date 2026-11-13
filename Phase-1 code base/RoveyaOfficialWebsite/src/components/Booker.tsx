"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, BadgeCheck, CheckCircle2, Clock3, CreditCard, Info, Loader2, MapPin, Navigation, ShieldCheck, Star, Ticket, Wallet } from "lucide-react";
import { api, openPayWindow, payOnline } from "@/lib/api";
import { sampleTrip } from "@/lib/sample";
import { cityName, clock, dayLabel, duration, inr } from "@/lib/format";
import type { Booking, Gender, Seat, Stop, Trip } from "@/lib/types";
import { useAuth } from "./Auth";
import { CaptainSeatNote, SeatLegend, SeatMap } from "./SeatMap";

const SECURE_FEE = 19;
const MAX_SEATS = 4;

type Traveller = { name: string; age: string; gender: Gender };
type Hold = { booking: Booking; payable: number };

function StopPicker({ title, stops, value, onChange, icon }: { title: string; stops: Stop[]; value: string; onChange: (id: string) => void; icon: React.ReactNode }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-sm font-semibold">
        {icon} {title}
      </p>
      <div className="mt-3 space-y-2">
        {stops.map((stop) => (
          <label key={stop.id} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition ${value === stop.id ? "border-gold bg-gold/5" : "border-gold/15 hover:border-gold/40"}`}>
            <input type="radio" checked={value === stop.id} onChange={() => onChange(stop.id)} className="mt-1 accent-[#D6A000]" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{stop.name}</span>
              <span className="block text-xs text-cream/50">{stop.landmark}</span>
            </span>
            <span className="text-sm font-semibold text-gold">
              {clock(stop.time)}
              {stop.dayOffset ? <sup className="ml-0.5 text-[10px]">+1</sup> : null}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: "good" }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-cream/60">{label}</span>
      <span className={tone === "good" ? "text-success" : ""}>{value}</span>
    </div>
  );
}

function Countdown({ until, onEnd }: { until: string; onEnd: () => void }) {
  const [left, setLeft] = useState(() => Date.parse(until) - Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      const next = Date.parse(until) - Date.now();
      setLeft(next);
      if (next <= 0) {
        clearInterval(timer);
        onEnd();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [until, onEnd]);
  const seconds = Math.max(0, Math.floor(left / 1000));
  return (
    <span className={`font-semibold tabular-nums ${seconds < 120 ? "text-danger" : "text-gold"}`}>
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
    </span>
  );
}

export function Booker({ id }: { id: string }) {
  const router = useRouter();
  const { rider, login } = useAuth();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [failed, setFailed] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState<{ tone: "info" | "women"; text: string } | null>(null);
  const [boardingId, setBoardingId] = useState("");
  const [dropId, setDropId] = useState("");
  const [stage, setStage] = useState<"seats" | "details" | "pay">("seats");
  const [travellers, setTravellers] = useState<Record<string, Traveller>>({});
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [secured, setSecured] = useState(true);
  const [coupon, setCoupon] = useState("");
  const [useCash, setUseCash] = useState(false);
  const [balance, setBalance] = useState(0);
  const [hold, setHold] = useState<Hold | null>(null);
  const [busy, setBusy] = useState<"" | "hold" | "online" | "wallet">("");
  const [error, setError] = useState("");

  const load = useCallback(
    (quiet: boolean) =>
      api<{ trip: Trip }>(`/seats/trips/${id}`, { auth: false })
        .then(({ trip: next }) => {
          setTrip(next);
          setBoardingId((current) => current || next.boarding[0]?.id || "");
          setDropId((current) => current || next.drops[next.drops.length - 1]?.id || "");
        })
        .catch((failure: Error) => !quiet && setFailed(failure.message)),
    [id],
  );

  useEffect(() => {
    void load(false);
    const poll = setInterval(() => void load(true), 15000);
    return () => clearInterval(poll);
  }, [load]);

  useEffect(() => {
    if (!rider) return;
    setPhone((current) => current || rider.phone.replace(/^\+?91/, "").slice(-10));
    setEmail((current) => current || rider.email || "");
    api<{ balance: number }>("/wallet")
      .then((wallet) => setBalance(wallet.balance))
      .catch(() => setBalance(0));
  }, [rider]);

  // A seat someone else took while the traveller was choosing drops out of the selection.
  useEffect(() => {
    if (!trip || stage === "pay") return;
    const gone = selected.filter((seatId) => {
      const seat = trip.seats.find((item) => item.id === seatId);
      return !seat || seat.state === "booked" || seat.state === "bookedFemale";
    });
    if (gone.length) {
      setSelected((list) => list.filter((seatId) => !gone.includes(seatId)));
      setNote({ tone: "info", text: `Seat ${gone.join(", ")} was just booked by another traveller. Pick another seat.` });
    }
  }, [trip, selected, stage]);

  const seats = useMemo(() => (trip ? selected.map((seatId) => trip.seats.find((seat) => seat.id === seatId)).filter((seat): seat is Seat => Boolean(seat)) : []), [trip, selected]);
  const fare = seats.reduce((sum, seat) => sum + seat.price, 0);
  const estimate = useMemo(() => {
    const secure = secured ? SECURE_FEE * seats.length : 0;
    const gst = Math.round(fare * 0.05);
    const before = fare + secure + gst;
    const cashUsed = useCash ? Math.min(balance, Math.round(before * 0.2)) : 0;
    return { secure, gst, cashUsed, total: before - cashUsed };
  }, [fare, secured, seats.length, useCash, balance]);

  const pick = (seat: Seat) => {
    if (stage !== "seats") return;
    if (seat.state === "booked" || seat.state === "bookedFemale") {
      setNote({ tone: "info", text: `Seat ${seat.label} is already booked${seat.state === "bookedFemale" ? " by a woman traveller" : ""}. Pick a seat with a price on it.` });
      return;
    }
    if (selected.includes(seat.id)) {
      setSelected(selected.filter((item) => item !== seat.id));
      setNote(null);
      return;
    }
    if (selected.length >= MAX_SEATS) {
      setNote({ tone: "info", text: "You can book up to 4 seats at a time." });
      return;
    }
    setSelected([...selected, seat.id]);
    setTravellers((current) => (current[seat.id] ? current : { ...current, [seat.id]: { name: "", age: "", gender: seat.state === "female" ? "Female" : "Male" } }));
    setNote(seat.state === "female" ? { tone: "women", text: `Seat ${seat.label} is next to a woman traveller, so it is reserved for a woman.` } : null);
  };

  const patch = (seatId: string, change: Partial<Traveller>) => setTravellers((current) => ({ ...current, [seatId]: { ...current[seatId], ...change } }));

  const toDetails = async () => {
    setError("");
    const me = rider ?? (await login());
    if (!me) return;
    setTravellers((current) => {
      const first = selected[0];
      if (first && !current[first]?.name && me.name) return { ...current, [first]: { ...current[first], name: me.name } };
      return current;
    });
    setStage("details");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const detailsProblem = () => {
    for (const seat of seats) {
      const person = travellers[seat.id];
      if (!person || person.name.trim().length < 2) return `Enter the traveller's name for seat ${seat.label}.`;
      const age = Number(person.age);
      if (!Number.isInteger(age) || age < 1 || age > 99) return `Check the age for seat ${seat.label}.`;
      if (seat.state === "female" && person.gender !== "Female") return `Seat ${seat.label} is for a woman traveller.`;
    }
    if (!/^[6-9]\d{9}$/.test(phone)) return "Enter a valid 10-digit mobile number for trip updates.";
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return "Check the email format.";
    return "";
  };

  const holdSeats = async () => {
    const problem = detailsProblem();
    if (problem) {
      setError(problem);
      return;
    }
    if (!(rider ?? (await login()))) return;
    setBusy("hold");
    setError("");
    try {
      const { booking } = await api<{ booking: Booking }>("/seats/bookings", {
        body: {
          tripId: id,
          travellers: seats.map((seat) => ({ seatId: seat.id, name: travellers[seat.id].name.trim(), age: Number(travellers[seat.id].age), gender: travellers[seat.id].gender })),
          boardingId,
          dropId,
          phone,
          email,
          secured,
          coupon: coupon.trim(),
          useCash,
        },
      });
      setHold({ booking, payable: booking.payable });
      setStage("pay");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (failure) {
      setError((failure as Error).message);
      void load(true);
    } finally {
      setBusy("");
    }
  };

  const pay = async (method: "online" | "wallet") => {
    if (!hold) return;
    const popup = method === "online" ? openPayWindow() : null;
    setBusy(method);
    setError("");
    try {
      const result = await api<{ status: "confirmed" | "payment_required"; booking?: Booking; payment?: { intentId: string; checkoutUrl: string } }>(`/seats/bookings/${hold.booking.id}/pay`, { body: { method } });
      if (result.status === "confirmed") {
        popup?.close();
        router.push(`/booking/${hold.booking.id}?new=1`);
        return;
      }
      await payOnline(result.payment!.checkoutUrl, result.payment!.intentId, popup);
      const { booking } = await api<{ booking: Booking }>(`/seats/bookings/${hold.booking.id}`);
      if (booking.status === "Upcoming") {
        router.push(`/booking/${booking.id}?new=1`);
        return;
      }
      setError("The payment did not complete. Your seats stay held until the timer ends, so you can try again.");
    } catch (failure) {
      popup?.close();
      setError((failure as Error).message);
    } finally {
      setBusy("");
    }
  };

  const expired = useCallback(() => {
    setHold(null);
    setStage("seats");
    setSelected([]);
    setError("");
    setNote({ tone: "info", text: "Your seats were held for 10 minutes and have been released. Pick them again." });
    void load(true);
  }, [load]);

  if (failed) {
    return (
      <div className="mx-auto max-w-xl px-5 py-24 text-center">
        <AlertCircle size={40} className="mx-auto text-danger" />
        <h1 className="display mt-5 text-4xl">This trip is not available</h1>
        <p className="mt-3 text-cream/60">{failed}</p>
        <Link href="/book" className="btn mt-8">
          Search other cars
        </Link>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 lg:grid-cols-[1fr_400px] lg:px-8">
        <div className="space-y-4">
          <div className="skeleton h-10 w-2/3" />
          <div className="skeleton h-5 w-1/2" />
          <div className="skeleton mx-auto mt-8 h-[440px] w-[300px] rounded-[52px]" />
        </div>
        <div className="skeleton h-96 rounded-3xl" />
      </div>
    );
  }

  const boarding = trip.boarding.find((stop) => stop.id === boardingId);
  const drop = trip.drops.find((stop) => stop.id === dropId);
  const quote = hold?.booking;
  const closed = trip.status !== "scheduled" && stage !== "pay";

  return (
    <div className="mx-auto max-w-7xl px-5 pb-28 pt-8 lg:px-8 lg:pb-8">
      <Link href={`/search?from=${trip.fromId}&to=${trip.toId}&date=${trip.date}`} className="inline-flex items-center gap-2 text-sm text-cream/60 hover:text-gold">
        <ArrowLeft size={16} /> All cars on this route
      </Link>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="kicker">
            {dayLabel(trip.date)} · {trip.code}
          </p>
          <h1 className="display mt-2 text-4xl sm:text-5xl">
            {cityName(trip.fromId)} <span className="text-gold">→</span> {cityName(trip.toId)}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-cream/65">
            <span className="font-semibold text-cream">{trip.operator}</span>
            {trip.assured ? (
              <span className="flex items-center gap-1 text-gold">
                <BadgeCheck size={15} /> Assured
              </span>
            ) : null}
            <span className="flex items-center gap-1">
              <Star size={14} className="text-gold" fill="currentColor" /> {trip.rating.toFixed(1)}
            </span>
            <span>
              {trip.car} · {trip.layoutTitle ?? trip.carClass} · {trip.ac ? "AC" : "Non-AC"}
            </span>
          </div>
        </div>
        <div className="card flex items-center gap-5 px-6 py-4">
          <div>
            <p className="text-2xl font-semibold">{clock(trip.departAt)}</p>
            <p className="text-xs text-cream/50">Departs</p>
          </div>
          <span className="text-xs text-cream/50">{duration(trip.durationMin)}</span>
          <div className="text-right">
            <p className="text-2xl font-semibold">{clock(trip.arriveAt)}</p>
            <p className="text-xs text-cream/50">Arrives</p>
          </div>
        </div>
      </div>

      <ol className="mt-8 flex gap-2 text-xs sm:text-sm">
        {(["seats", "details", "pay"] as const).map((key, index) => {
          const done = ["seats", "details", "pay"].indexOf(stage) > index;
          return (
            <li key={key} className={`flex flex-1 items-center gap-2 rounded-2xl border px-4 py-3 ${stage === key ? "border-gold bg-gold/10 text-cream" : done ? "border-gold/30 text-gold" : "border-gold/10 text-cream/40"}`}>
              {done ? <CheckCircle2 size={16} /> : <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-[10px]">{index + 1}</span>}
              {key === "seats" ? "Seats and stops" : key === "details" ? "Traveller details" : "Payment"}
            </li>
          );
        })}
      </ol>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0">
          {stage === "seats" ? (
            <div className="grid gap-8 xl:grid-cols-[auto_1fr]">
              <div className="card p-6 sm:p-8">
                <SeatMap seats={trip.seats} selected={selected} onPick={pick} />
                <div className="mt-6">
                  <SeatLegend />
                  {trip.seats.some((seat) => seat.chair) ? (
                    <div className="mt-2">
                      <CaptainSeatNote />
                    </div>
                  ) : null}
                </div>
                {note ? (
                  <p className={`mx-auto mt-5 flex max-w-[320px] gap-2 rounded-2xl border p-3 text-sm ${note.tone === "women" ? "border-rose/40 bg-rose/10 text-rose" : "border-gold/25 bg-gold/5 text-cream/80"}`}>
                    <Info size={16} className="mt-0.5 shrink-0" /> {note.text}
                  </p>
                ) : null}
              </div>
              <div className="card space-y-8 p-6">
                <StopPicker title="Boarding point" stops={trip.boarding} value={boardingId} onChange={setBoardingId} icon={<Navigation size={16} className="text-gold" />} />
                <StopPicker title="Drop point" stops={trip.drops} value={dropId} onChange={setDropId} icon={<MapPin size={16} className="text-rose" />} />
                {trip.amenities.length ? (
                  <div>
                    <p className="text-sm font-semibold">In this car</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {trip.amenities.map((item) => (
                        <span key={item} className="rounded-full border border-gold/15 px-3 py-1 text-xs text-cream/70">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : stage === "details" ? (
            <div className="space-y-6">
              {seats.map((seat, index) => {
                const person = travellers[seat.id] ?? { name: "", age: "", gender: "Male" as Gender };
                const locked = seat.state === "female";
                return (
                  <div key={seat.id} className="card p-6">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold">Traveller {index + 1}</p>
                      <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${locked ? "bg-rose/15 text-rose" : "bg-gold/10 text-gold"}`}>
                        Seat {seat.label}
                        {locked ? " · Women only" : ""}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_110px_auto]">
                      <input className="field" placeholder="Full name" value={person.name} onChange={(event) => patch(seat.id, { name: event.target.value })} maxLength={60} />
                      <input className="field" placeholder="Age" inputMode="numeric" value={person.age} onChange={(event) => patch(seat.id, { age: event.target.value.replace(/\D/g, "").slice(0, 2) })} />
                      <div className="flex gap-2">
                        {(["Male", "Female"] as Gender[]).map((gender) => (
                          <button key={gender} type="button" disabled={locked && gender === "Male"} onClick={() => patch(seat.id, { gender })} className="chip px-4 disabled:opacity-30" data-on={person.gender === gender}>
                            {gender}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="card p-6">
                <p className="font-semibold">Contact for this trip</p>
                <p className="mt-1 text-sm text-cream/55">Your ticket, captain details and live tracking link go here.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-[0.95rem] border border-gold/20 bg-night pl-4">
                    <span className="text-cream/50">+91</span>
                    <input className="w-full bg-transparent py-3 pr-4 outline-none" inputMode="numeric" placeholder="Mobile number" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} />
                  </label>
                  <input className="field" type="email" placeholder="Email (optional)" value={email} onChange={(event) => setEmail(event.target.value)} />
                </div>
              </div>
              <button type="button" onClick={() => setSecured(!secured)} className={`card flex w-full items-start gap-4 p-6 text-left transition ${secured ? "border-gold" : ""}`}>
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${secured ? "border-gold bg-gold text-night" : "border-gold/40"}`}>{secured ? <CheckCircle2 size={16} /> : null}</span>
                <span>
                  <span className="flex items-center gap-2 font-semibold">
                    <ShieldCheck size={18} className="text-gold" /> Secure your trip · {inr(SECURE_FEE)} per seat
                  </span>
                  <span className="mt-1 block text-sm text-cream/60">Travel insurance up to ₹5 lakh, free cancellation up to 6 hours before, and 24/7 priority support.</span>
                </span>
              </button>
              <div className="card grid gap-4 p-6 sm:grid-cols-2">
                <div>
                  <p className="font-semibold">Offer code</p>
                  <input className="field mt-3 uppercase" placeholder="ROVEYAFIRST" value={coupon} onChange={(event) => setCoupon(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20))} />
                  <p className="mt-2 text-xs text-cream/45">Checked when we hold your seats.</p>
                </div>
                <div>
                  <p className="font-semibold">ROVEYA Cash</p>
                  <label className={`mt-3 flex items-center gap-3 rounded-[0.95rem] border p-3.5 ${balance ? "cursor-pointer border-gold/20" : "border-gold/10 opacity-50"}`}>
                    <input type="checkbox" disabled={!balance} checked={useCash} onChange={(event) => setUseCash(event.target.checked)} className="h-4 w-4 accent-[#D6A000]" />
                    <span className="text-sm">Use up to 20% · balance {inr(balance)}</span>
                  </label>
                </div>
              </div>
            </div>
          ) : quote ? (
            <div className="card p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="kicker">Seats held</p>
                  <p className="mt-2 text-2xl font-semibold">Complete your payment</p>
                </div>
                {quote.holdUntil ? (
                  <p className="flex items-center gap-2 rounded-2xl border border-gold/25 px-4 py-2 text-sm">
                    <Clock3 size={16} className="text-gold" /> Held for <Countdown until={quote.holdUntil} onEnd={expired} />
                  </p>
                ) : null}
              </div>
              <div className="mt-6 space-y-3">
                <button type="button" disabled={Boolean(busy)} onClick={() => void pay(hold!.payable === 0 ? "wallet" : "online")} className="btn w-full py-4 text-base">
                  {busy === "online" ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={18} />}
                  {hold!.payable === 0 ? "Confirm booking" : busy === "online" ? "Waiting for payment…" : `Pay ${inr(hold!.payable)} · UPI, card or net banking`}
                </button>
                {hold!.payable > 0 && balance - quote.cashUsed >= hold!.payable ? (
                  <button type="button" disabled={Boolean(busy)} onClick={() => void pay("wallet")} className="btn-ghost w-full py-4">
                    {busy === "wallet" ? <Loader2 size={18} className="animate-spin" /> : <Wallet size={18} className="text-gold" />}
                    Pay {inr(hold!.payable)} from ROVEYA Cash
                  </button>
                ) : null}
              </div>
              {busy === "online" ? <p className="mt-4 text-center text-sm text-cream/60">Finish the payment in the window that opened. This page updates by itself.</p> : null}
              <p className="mt-6 flex items-center justify-center gap-2 text-xs text-cream/45">
                <ShieldCheck size={14} /> Payments by Razorpay. ROVEYA never sees your card or UPI PIN.
              </p>
            </div>
          ) : null}
          {error ? (
            <p className="mt-5 flex gap-2 rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
              <AlertCircle size={18} className="shrink-0" /> {error}
            </p>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card overflow-hidden">
            <div className="border-b border-gold/10 bg-mist/60 p-6">
              <p className="flex items-center gap-2 font-semibold">
                <Ticket size={18} className="text-gold" /> Trip summary
              </p>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex gap-3">
                  <Navigation size={16} className="mt-0.5 shrink-0 text-gold" />
                  <span className="min-w-0 flex-1">{boarding?.name}</span>
                  <span className="font-semibold">{boarding ? clock(boarding.time) : ""}</span>
                </div>
                <div className="flex gap-3">
                  <MapPin size={16} className="mt-0.5 shrink-0 text-rose" />
                  <span className="min-w-0 flex-1">{drop?.name}</span>
                  <span className="font-semibold">{drop ? clock(drop.time) : ""}</span>
                </div>
              </div>
            </div>
            <div className="space-y-3 p-6">
              <div className="flex justify-between text-sm">
                <span className="text-cream/60">Seats</span>
                <span className="font-semibold">{seats.length ? seats.map((seat) => seat.label).join(", ") : "None yet"}</span>
              </div>
              {quote ? (
                <>
                  <Line label="Seat fare" value={inr(quote.fare)} />
                  <Line label="GST (5%)" value={inr(quote.gst)} />
                  {quote.secure ? <Line label="Trip security" value={inr(quote.secure)} /> : null}
                  {quote.discount ? <Line label="Offer" value={`−${inr(quote.discount)}`} tone="good" /> : null}
                  {quote.cashUsed ? <Line label="ROVEYA Cash" value={`−${inr(quote.cashUsed)}`} tone="good" /> : null}
                  <div className="gold-line my-2" />
                  <div className="flex items-end justify-between">
                    <span className="text-sm text-cream/60">To pay</span>
                    <span className="text-3xl font-bold text-gold">{inr(quote.payable)}</span>
                  </div>
                </>
              ) : seats.length ? (
                <>
                  <Line label="Seat fare" value={inr(fare)} />
                  <Line label="GST (5%)" value={inr(estimate.gst)} />
                  {estimate.secure ? <Line label="Trip security" value={inr(estimate.secure)} /> : null}
                  {estimate.cashUsed ? <Line label="ROVEYA Cash" value={`−${inr(estimate.cashUsed)}`} tone="good" /> : null}
                  <div className="gold-line my-2" />
                  <div className="flex items-end justify-between">
                    <span className="text-sm text-cream/60">Total</span>
                    <span className="text-3xl font-bold text-gold">{inr(estimate.total)}</span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-cream/50">Pick seats on the car map. Front seats cost a little more, back seats a little less.</p>
              )}

              {closed ? (
                <p className="rounded-2xl border border-danger/30 p-3 text-sm text-danger">Booking has closed for this trip.</p>
              ) : stage === "seats" ? (
                <button type="button" disabled={!seats.length || !boardingId || !dropId} onClick={() => void toDetails()} className="btn mt-3 w-full">
                  {rider ? "Continue" : "Log in and continue"}
                </button>
              ) : stage === "details" ? (
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => setStage("seats")} className="btn-ghost px-4">
                    <ArrowLeft size={16} />
                  </button>
                  <button type="button" disabled={busy === "hold"} onClick={() => void holdSeats()} className="btn flex-1">
                    {busy === "hold" ? <Loader2 size={18} className="animate-spin" /> : null}
                    Hold seats and pay
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <p className="mt-4 px-2 text-xs leading-5 text-cream/45">
            Free cancellation slabs apply. See the{" "}
            <Link href="/terms" className="text-gold">
              cancellation policy
            </Link>
            .
          </p>
        </aside>
      </div>

      {seats.length && stage !== "pay" && !closed ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gold/20 bg-inkwell/95 px-5 py-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-xl items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-cream/55">Seat {seats.map((seat) => seat.label).join(", ")}</p>
              <p className="text-xl font-bold text-gold">{inr(estimate.total)}</p>
            </div>
            {stage === "seats" ? (
              <button type="button" disabled={!boardingId || !dropId} onClick={() => void toDetails()} className="btn px-6">
                {rider ? "Continue" : "Log in and continue"}
              </button>
            ) : (
              <button type="button" disabled={busy === "hold"} onClick={() => void holdSeats()} className="btn px-6">
                {busy === "hold" ? <Loader2 size={18} className="animate-spin" /> : null} Hold and pay
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
