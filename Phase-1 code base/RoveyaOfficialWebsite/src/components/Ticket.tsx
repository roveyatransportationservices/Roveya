"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, CarFront, CheckCircle2, Headset, Loader2, MapPin, MapPinned, Navigation, Phone, Printer, Star, X } from "lucide-react";
import { api } from "@/lib/api";
import { DESK_PHONE, DESK_TEL, cityName, clock, dayLabel, inr } from "@/lib/format";
import { CANCELLATION_SLABS } from "@/lib/rules";
import { formatInrPaise } from "@/lib/refundPolicy";
import type { Booking } from "@/lib/types";
import { useAuth } from "./Auth";

type CallResult = { mode: "bridged"; message: string } | { mode: "desk"; deskPhone: string; message: string } | { mode: "direct"; phone: string; message: string };

const tone: Record<Booking["status"], string> = {
  Upcoming: "bg-success/15 text-success",
  Completed: "bg-gold/15 text-gold",
  Cancelled: "bg-danger/15 text-danger",
  Pending: "bg-cream/10 text-cream/70",
};

function Row({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-cream/60">{label}</span>
      <span className={good ? "text-success" : ""}>{value}</span>
    </div>
  );
}

export function Ticket({ id, fresh }: { id: string; fresh: boolean }) {
  const { rider, ready, login } = useAuth();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"" | "track" | "call" | "cancel">("");
  const [asking, setAsking] = useState(false);

  const load = useCallback(
    () =>
      api<{ booking: Booking }>(`/seats/bookings/${id}`)
        .then(({ booking: next }) => setBooking(next))
        .catch((failure: Error) => setError(failure.message)),
    [id],
  );

  useEffect(() => {
    if (ready && rider) void load();
  }, [ready, rider, load]);

  const track = async () => {
    const tab = window.open("about:blank", "_blank");
    setBusy("track");
    setNotice("");
    try {
      const result = await api<{ shareUrl: string }>(`/seats/bookings/${id}/track`);
      if (tab) tab.location.href = result.shareUrl;
      else window.location.assign(result.shareUrl);
    } catch (failure) {
      tab?.close();
      setNotice((failure as Error).message);
    } finally {
      setBusy("");
    }
  };

  const call = async () => {
    setBusy("call");
    setNotice("");
    try {
      const result = await api<CallResult>("/calls/connect?app=rider", { body: { bookingId: id } });
      setNotice(result.message);
      if (result.mode === "direct") window.location.href = `tel:${result.phone}`;
      if (result.mode === "desk") window.location.href = `tel:${result.deskPhone.replace(/\s/g, "")}`;
    } catch (failure) {
      setNotice((failure as Error).message);
    } finally {
      setBusy("");
    }
  };

  const cancel = async () => {
    setBusy("cancel");
    setNotice("");
    try {
      const result = await api<{ refund: number; booking: Booking }>(`/seats/bookings/${id}/cancel`, { method: "POST" });
      setBooking(result.booking);
      setAsking(false);
      setNotice(result.refund ? `Booking cancelled. The stored refund is ${formatInrPaise(Math.round(result.refund * 100))}.` : "Booking cancelled. The stored refund is ₹0.");
    } catch (failure) {
      setNotice((failure as Error).message);
    } finally {
      setBusy("");
    }
  };

  if (ready && !rider) {
    return (
      <div className="mx-auto max-w-lg px-5 py-24 text-center">
        <h1 className="display text-4xl">Log in to see this ticket</h1>
        <p className="mt-3 text-cream/60">Use the mobile number you booked with.</p>
        <button type="button" className="btn mt-8" onClick={() => void login()}>
          Log in
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-5 py-24 text-center">
        <AlertCircle size={40} className="mx-auto text-danger" />
        <h1 className="display mt-5 text-4xl">Ticket not found</h1>
        <p className="mt-3 text-cream/60">{error}</p>
        <Link href="/bookings" className="btn mt-8">
          My bookings
        </Link>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="mx-auto max-w-5xl space-y-5 px-5 py-10">
        <div className="skeleton h-10 w-1/2" />
        <div className="skeleton h-72 rounded-3xl" />
        <div className="skeleton h-48 rounded-3xl" />
      </div>
    );
  }

  const trip = booking.trip;
  const upcoming = booking.status === "Upcoming";

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 print:py-0">
      <Link href="/bookings" className="inline-flex items-center gap-2 text-sm text-cream/60 hover:text-gold print:hidden">
        <ArrowLeft size={16} /> My bookings
      </Link>

      {fresh && upcoming ? (
        <div className="rise mt-6 flex items-center gap-4 rounded-3xl border border-success/30 bg-success/10 p-5 print:hidden">
          <CheckCircle2 size={32} className="shrink-0 text-success" />
          <div>
            <p className="text-lg font-semibold">Your seats are booked</p>
            <p className="text-sm text-cream/70">We sent the ticket to +91 {booking.phone}. Captain details arrive 2 hours before departure.</p>
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="card overflow-hidden">
          <div className="relative bg-gradient-to-br from-cherry via-plum to-inkwell p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="kicker">PNR {booking.pnr}</p>
                <h1 className="display mt-3 text-4xl sm:text-5xl">
                  {cityName(trip.fromId)} <span className="text-gold">→</span> {cityName(trip.toId)}
                </h1>
                <p className="mt-2 text-sm text-cream/70">
                  {dayLabel(trip.date)} · {trip.code}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone[booking.status]}`}>{booking.status}</span>
            </div>
          </div>
          <div className="relative">
            <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-night" />
            <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-night" />
            <div className="border-t border-dashed border-gold/25" />
          </div>
          <div className="grid gap-6 p-6 sm:grid-cols-2 sm:p-8">
            <div className="flex gap-3">
              <Navigation size={18} className="mt-1 shrink-0 text-gold" />
              <div>
                <p className="text-xs text-cream/50">Boarding · {clock(booking.boarding.time)}</p>
                <p className="mt-1 font-semibold">{booking.boarding.name}</p>
                <p className="text-sm text-cream/55">{booking.boarding.landmark}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <MapPin size={18} className="mt-1 shrink-0 text-rose" />
              <div>
                <p className="text-xs text-cream/50">Drop · {clock(booking.drop.time)}</p>
                <p className="mt-1 font-semibold">{booking.drop.name}</p>
                <p className="text-sm text-cream/55">{booking.drop.landmark}</p>
              </div>
            </div>
          </div>
          <div className="border-t border-gold/10 p-6 sm:p-8">
            <p className="text-sm font-semibold">Travellers</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {booking.travellers.map((person) => {
                const seat = booking.seats.find((item) => item.id === person.seatId);
                return (
                  <div key={person.seatId} className="flex items-center justify-between rounded-2xl border border-gold/15 px-4 py-3">
                    <div>
                      <p className="font-medium">{person.name}</p>
                      <p className="text-xs text-cream/50">
                        {person.gender}, {person.age}
                      </p>
                    </div>
                    <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${person.gender === "Female" ? "bg-rose/15 text-rose" : "bg-gold/10 text-gold"}`}>Seat {seat?.label ?? person.seatId}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="border-t border-gold/10 p-6 sm:p-8">
            <p className="text-sm font-semibold">Your car</p>
            {booking.captain ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/10 text-gold">
                    <CarFront size={22} />
                  </span>
                  <div>
                    <p className="font-semibold">
                      {booking.captain.car} · <span className="tracking-wider text-gold">{booking.captain.plate}</span>
                    </p>
                    <p className="flex items-center gap-1 text-sm text-cream/60">
                      Captain {booking.captain.name} · <Star size={13} className="text-gold" fill="currentColor" /> {booking.captain.rating.toFixed(1)}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-cream/60">
                {trip.car} · {trip.carClass} by {trip.operator}. {upcoming ? "The car number and captain name arrive 2 hours before departure." : ""}
              </p>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          {upcoming ? (
            <div className="card space-y-3 p-5 print:hidden">
              <button type="button" disabled={Boolean(busy)} onClick={() => void track()} className="btn w-full">
                {busy === "track" ? <Loader2 size={18} className="animate-spin" /> : <MapPinned size={18} />} Track car live
              </button>
              <button type="button" disabled={Boolean(busy)} onClick={() => void call()} className="btn-ghost w-full">
                {busy === "call" ? <Loader2 size={18} className="animate-spin" /> : <Phone size={18} className="text-gold" />} Call captain
              </button>
              <button type="button" onClick={() => window.print()} className="btn-ghost w-full">
                <Printer size={18} className="text-gold" /> Print ticket
              </button>
              {notice ? <p className="rounded-2xl border border-gold/20 bg-gold/5 p-3 text-sm text-cream/80">{notice}</p> : null}
            </div>
          ) : notice ? (
            <p className="card p-4 text-sm text-cream/80">{notice}</p>
          ) : null}

          <div className="card space-y-3 p-5">
            <p className="font-semibold">Fare</p>
            <Row label="Seat fare" value={inr(booking.fare)} />
            <Row label="GST" value={inr(booking.gst)} />
            {booking.secure ? <Row label="Trip security" value={inr(booking.secure)} /> : null}
            {booking.discount ? <Row label="Offer" value={`−${inr(booking.discount)}`} good /> : null}
            {booking.cashUsed ? <Row label="ROVEYA Cash" value={`−${inr(booking.cashUsed)}`} good /> : null}
            <div className="gold-line" />
            <div className="flex justify-between">
              <span className="text-sm text-cream/60">Paid{booking.paidWith ? ` · ${booking.paidWith}` : ""}</span>
              <span className="text-xl font-bold text-gold">{inr(booking.total)}</span>
            </div>
            {booking.refund !== undefined ? <Row label="Refunded to ROVEYA Cash" value={inr(booking.refund)} good /> : null}
          </div>

          {upcoming ? (
            <div className="card p-5 print:hidden">
              <p className="font-semibold">Cancel booking</p>
              {booking.refundQuote ? (
                <p className="mt-1 text-sm text-cream/60">{booking.refundQuote.note ?? `Estimated refund ${formatInrPaise(booking.refundQuote.refundPaise ?? Math.round(booking.refundQuote.amount * 100))} (${booking.refundQuote.percent}%). The stored refund can differ if you cross a time band before confirming.`}</p>
              ) : (
                <p className="mt-1 text-sm text-cream/60">{booking.refundNote ?? "A refund estimate is not available. Cancelling does not let this page choose an amount. The server calculates it, and the result shown afterwards is the stored refund."}</p>
              )}
              {asking ? (
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={() => setAsking(false)} className="btn-ghost flex-1 px-3">
                    Keep it
                  </button>
                  <button type="button" disabled={busy === "cancel"} onClick={() => void cancel()} className="btn flex-1 bg-danger px-3 hover:bg-danger/90">
                    {busy === "cancel" ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />} Cancel
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setAsking(true)} className="mt-4 text-sm font-medium text-danger">
                  Cancel this booking
                </button>
              )}
              <details className="mt-4 text-xs text-cream/50">
                <summary className="cursor-pointer">Refund slabs</summary>
                <ul className="mt-2 space-y-1">
                  {CANCELLATION_SLABS.map((slab) => (
                    <li key={slab.label} className="flex justify-between">
                      <span>{slab.label}</span>
                      <span>{slab.refund}%</span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ) : null}

          <div className="card flex items-center gap-3 p-5 print:hidden">
            <Headset size={22} className="text-gold" />
            <div className="text-sm">
              <p className="font-semibold">Need help with this trip?</p>
              <p className="text-cream/60">
                <Link href={`/help?pnr=${booking.pnr}`} className="text-gold">
                  Chat with us
                </Link>{" "}
                or call{" "}
                <a href={DESK_TEL} className="text-gold">
                  {DESK_PHONE}
                </a>
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
