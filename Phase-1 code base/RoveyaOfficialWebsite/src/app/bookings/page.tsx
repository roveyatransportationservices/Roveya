"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, RefreshCw, Ticket } from "lucide-react";
import { useAuth } from "@/components/Auth";
import { api } from "@/lib/api";
import { cityName, clock, dayLabel, inr } from "@/lib/format";
import type { Booking } from "@/lib/types";

const tabs = ["Upcoming", "Completed", "Cancelled"] as const;

export default function BookingsPage() {
  const { rider, ready, login } = useAuth();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<(typeof tabs)[number]>("Upcoming");

  const load = () => {
    setBookings(null);
    setError("");
    api<{ bookings: Booking[] }>("/seats/bookings")
      .then((result) => setBookings(result.bookings))
      .catch((failure: Error) => {
        setError(failure.message);
        setBookings([]);
      });
  };

  useEffect(() => {
    if (ready && rider) load();
  }, [ready, rider]);

  const shown = (bookings ?? []).filter((item) => item.status === tab);

  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <p className="kicker">Your journeys</p>
      <h1 className="display mt-3 text-5xl">My bookings</h1>

      {ready && !rider ? (
        <div className="card mt-10 p-10 text-center">
          <Ticket size={36} className="mx-auto text-gold" />
          <p className="mt-4 text-lg font-semibold">Log in to see your bookings</p>
          <p className="mt-2 text-sm text-cream/60">Bookings from the ROVEYA app and this website show up together.</p>
          <button type="button" className="btn mt-6" onClick={() => void login()}>
            Log in
          </button>
        </div>
      ) : (
        <>
          <div className="mt-8 flex gap-2">
            {tabs.map((item) => (
              <button key={item} type="button" className="chip" data-on={tab === item} onClick={() => setTab(item)}>
                {item}
                {bookings ? ` · ${bookings.filter((booking) => booking.status === item).length}` : ""}
              </button>
            ))}
          </div>
          <div className="mt-6 space-y-4">
            {bookings === null ? (
              [0, 1, 2].map((index) => <div key={index} className="skeleton h-32 rounded-3xl" />)
            ) : error ? (
              <div className="card p-10 text-center">
                <p className="font-semibold">Bookings could not load</p>
                <p className="mt-2 text-sm text-cream/60">{error}</p>
                <button type="button" className="btn mt-6" onClick={load}>
                  <RefreshCw size={16} /> Try again
                </button>
              </div>
            ) : shown.length ? (
              shown.map((booking) => (
                <Link key={booking.id} href={`/booking/${booking.id}`} className="card flex items-center gap-5 p-6 transition hover:border-gold/60">
                  <div className="hidden h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-gold/10 text-gold sm:flex">
                    <span className="text-xl font-bold">{Number(booking.trip.date.slice(8))}</span>
                    <span className="text-[10px] uppercase">{dayLabel(booking.trip.date).split(" ").pop()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-semibold">
                      {cityName(booking.trip.fromId)} → {cityName(booking.trip.toId)}
                    </p>
                    <p className="mt-1 text-sm text-cream/60">
                      {dayLabel(booking.trip.date)} · {clock(booking.boarding.time)} · Seat {booking.seats.map((seat) => seat.label).join(", ")}
                    </p>
                    <p className="mt-1 text-xs text-cream/45">PNR {booking.pnr}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-gold">{inr(booking.total)}</p>
                    <ChevronRight size={18} className="ml-auto mt-1 text-cream/40" />
                  </div>
                </Link>
              ))
            ) : (
              <div className="card p-10 text-center">
                <Ticket size={36} className="mx-auto text-gold" />
                <p className="mt-4 text-lg font-semibold">No {tab.toLowerCase()} trips</p>
                {tab === "Upcoming" ? (
                  <Link href="/book" className="btn mt-6">
                    Book a seat
                  </Link>
                ) : null}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
