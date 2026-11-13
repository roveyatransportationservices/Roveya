"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, Car, ChevronLeft, ChevronRight, Moon, RefreshCw, SlidersHorizontal, Star, Sun, Sunrise, Sunset, Users } from "lucide-react";
import { api } from "@/lib/api";
import { sampleTrips } from "@/lib/sample";
import { cityName, clock, dayLabel, duration, inr, shiftDay, todayIso } from "@/lib/format";
import type { Trip } from "@/lib/types";
import { SearchBox } from "./SearchBox";

type Sort = "early" | "cheap" | "rating" | "fast";
const slots = [
  { key: "morning", label: "Before 12 PM", icon: Sunrise, range: [0, 12] },
  { key: "afternoon", label: "12 PM to 5 PM", icon: Sun, range: [12, 17] },
  { key: "evening", label: "5 PM to 9 PM", icon: Sunset, range: [17, 21] },
  { key: "night", label: "After 9 PM", icon: Moon, range: [21, 24] },
] as const;

export function Results({ from, to, date, women: womenFirst = false }: { from: string; to: string; date: string; women?: boolean }) {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [sort, setSort] = useState<Sort>("early");
  const [slot, setSlot] = useState<string | null>(null);
  const [classes, setClasses] = useState<string[]>([]);
  const [women, setWomen] = useState(womenFirst);
  const [boarding, setBoarding] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const load = () => {
    setTrips(null);
    setError("");
    api<{ trips: Trip[] }>(`/seats/search?from=${from}&to=${to}&date=${date}`, { auth: false })
      .then((result) => setTrips(result.trips))
      .catch((failure: Error) => {
        setError(failure.message);
        setTrips([]);
      });
  };

  useEffect(load, [from, to, date]);

  const shown = useMemo(() => {
    const list = (trips ?? [])
      .filter((trip) => !classes.length || classes.includes(trip.carClass))
      .filter((trip) => !women || trip.womenFriendly)
      .filter((trip) => !boarding || trip.boarding.some((stop) => stop.name === boarding))
      .filter((trip) => {
        if (!slot) return true;
        const hour = Number(trip.departAt.slice(0, 2));
        const range = slots.find((item) => item.key === slot)!.range;
        return hour >= range[0] && hour < range[1];
      });
    return list.sort((a, b) => (sort === "cheap" ? a.fare - b.fare : sort === "rating" ? b.rating - a.rating : sort === "fast" ? a.durationMin - b.durationMin : a.departAt.localeCompare(b.departAt)));
  }, [trips, classes, women, boarding, slot, sort]);

  const carClasses = [...new Set((trips ?? []).map((trip) => trip.carClass))];
  const points = [...new Set((trips ?? []).flatMap((trip) => trip.boarding.map((stop) => stop.name)))];
  const go = (next: string) => router.push(`/search?from=${from}&to=${to}&date=${next}`);
  const toggle = (value: string) => setClasses((list) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]));

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">{dayLabel(date)}</p>
          <h1 className="display mt-2 text-4xl sm:text-5xl">
            {cityName(from)} <span className="text-gold">→</span> {cityName(to)}
          </h1>
          <p className="mt-2 text-sm text-cream/60">{trips === null ? "Finding cars…" : `${trips.length} car${trips.length === 1 ? "" : "s"}${trips.length ? ` · seats from ${inr(Math.min(...trips.map((trip) => trip.fare)))}` : ""}`}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" disabled={date <= todayIso()} onClick={() => go(shiftDay(date, -1))} className="btn-ghost px-3 py-2.5 disabled:opacity-30" aria-label="Previous day">
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-36 text-center text-sm font-semibold">{dayLabel(date)}</span>
          <button type="button" onClick={() => go(shiftDay(date, 1))} className="btn-ghost px-3 py-2.5" aria-label="Next day">
            <ChevronRight size={18} />
          </button>
          <button type="button" onClick={() => setEditing(!editing)} className="btn-ghost ml-2 px-4 py-2.5 text-sm">
            Change search
          </button>
          <button type="button" onClick={() => setFiltersOpen(!filtersOpen)} className="btn-ghost px-3 py-2.5 lg:hidden" aria-label="Filters" aria-expanded={filtersOpen}>
            <SlidersHorizontal size={18} />
          </button>
        </div>
      </div>
      {editing ? (
        <div className="mt-6">
          <SearchBox initial={{ from, to, date, women }} />
        </div>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[280px_1fr]">
        <aside className={`space-y-6 lg:sticky lg:top-24 lg:block lg:self-start ${filtersOpen ? "" : "hidden"}`}>
          <div className="card p-5">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <SlidersHorizontal size={16} className="text-gold" /> Sort
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(
                [
                  ["early", "Earliest"],
                  ["cheap", "Lowest fare"],
                  ["rating", "Top rated"],
                  ["fast", "Fastest"],
                ] as [Sort, string][]
              ).map(([key, label]) => (
                <button key={key} type="button" className="chip" data-on={sort === key} onClick={() => setSort(key)}>
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-6 text-sm font-semibold">Departure</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {slots.map((item) => (
                <button key={item.key} type="button" onClick={() => setSlot(slot === item.key ? null : item.key)} className={`flex flex-col items-center gap-1 rounded-2xl border p-3 text-xs transition ${slot === item.key ? "border-gold bg-gold text-night" : "border-gold/20 hover:border-gold/50"}`}>
                  <item.icon size={18} />
                  {item.label}
                </button>
              ))}
            </div>
            {carClasses.length > 1 ? (
              <>
                <p className="mt-6 text-sm font-semibold">Car type</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {carClasses.map((value) => (
                    <button key={value} type="button" className="chip" data-on={classes.includes(value)} onClick={() => toggle(value)}>
                      {value}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            {points.length > 1 ? (
              <>
                <p className="mt-6 text-sm font-semibold">Boarding point</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {points.map((value) => (
                    <button key={value} type="button" className="chip" data-on={boarding === value} onClick={() => setBoarding(boarding === value ? null : value)}>
                      {value}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            <label className="mt-6 flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-rose/30 bg-rose/5 p-3 text-sm">
              Women-friendly cars
              <input type="checkbox" checked={women} onChange={(event) => setWomen(event.target.checked)} className="h-4 w-4 accent-[#E58AA8]" />
            </label>
          </div>
        </aside>

        <section className="space-y-4">
          {trips === null ? (
            [0, 1, 2, 3].map((index) => (
              <div key={index} className="card space-y-4 p-6">
                <div className="skeleton h-5 w-1/3" />
                <div className="skeleton h-8 w-2/3" />
                <div className="skeleton h-4 w-1/2" />
              </div>
            ))
          ) : error ? (
            <div className="card p-10 text-center">
              <p className="text-lg font-semibold">Cars could not load</p>
              <p className="mt-2 text-sm text-cream/60">{error}</p>
              <button type="button" className="btn mt-6" onClick={load}>
                <RefreshCw size={16} /> Try again
              </button>
            </div>
          ) : shown.length ? (
            shown.map((trip) => <TripCard key={trip.id} trip={trip} />)
          ) : (
            <div className="card p-10 text-center">
              <Car size={36} className="mx-auto text-gold" />
              <p className="mt-4 text-lg font-semibold">{trips.length ? "No car matches these filters" : date === todayIso() ? "No more cars today" : "No cars on this date yet"}</p>
              <p className="mt-2 text-sm text-cream/60">{trips.length ? "Clear a filter to see more cars." : "Captains publish trips up to 30 days ahead. Try the next day."}</p>
              {trips.length ? null : (
                <button type="button" className="btn mt-6" onClick={() => go(shiftDay(date, 1))}>
                  See {dayLabel(shiftDay(date, 1))} <ChevronRight size={16} />
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function TripCard({ trip }: { trip: Trip }) {
  const last = trip.drops[trip.drops.length - 1];
  return (
    <Link href={`/trip/${trip.id}`} className="card block overflow-hidden transition hover:-translate-y-0.5 hover:border-gold/60">
      <div className="grid gap-6 p-6 md:grid-cols-[1.2fr_1.6fr_auto] md:items-center">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-lg font-semibold">{trip.operator}</p>
            {trip.assured ? (
              <span className="flex items-center gap-1 rounded-md bg-gold px-1.5 py-0.5 text-[10px] font-semibold text-night">
                <BadgeCheck size={12} /> Assured
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-cream/60">
            {trip.car} · {trip.layoutTitle ?? trip.carClass} · {trip.ac ? "AC" : "Non-AC"}
          </p>
          <div className="mt-3 flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 rounded-md bg-gold/90 px-1.5 py-0.5 font-semibold text-night">
              <Star size={11} fill="currentColor" /> {trip.rating.toFixed(1)}
            </span>
            <span className="flex items-center gap-1 text-cream/55">
              <Users size={12} /> {trip.reviews} ratings
            </span>
            {trip.womenFriendly ? <span className="rounded-md border border-rose/40 px-1.5 py-0.5 text-rose">Women friendly</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div>
            <p className="text-2xl font-semibold">{clock(trip.departAt)}</p>
            <p className="max-w-36 truncate text-xs text-cream/55">{trip.boarding[0]?.name}</p>
          </div>
          <div className="flex flex-1 items-center gap-2 text-xs text-cream/55">
            <span className="h-px flex-1 bg-gold/30" />
            {duration(trip.durationMin)}
            <span className="h-px flex-1 bg-gold/30" />
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold">
              {clock(trip.arriveAt)}
              {last?.dayOffset ? <sup className="ml-0.5 text-xs text-gold">+1</sup> : null}
            </p>
            <p className="max-w-36 truncate text-xs text-cream/55">{last?.name}</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-6 md:flex-col md:items-end">
          <div className="text-right">
            <p className="text-xs text-cream/50">Seats from</p>
            <p className="text-3xl font-bold text-gold">{inr(trip.fare)}</p>
          </div>
          <span className="btn px-5 py-2.5 text-sm">Select seats</span>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-gold/10 bg-mist/60 px-6 py-3 text-xs">
        <span className={trip.seatsLeft <= 2 ? "text-danger" : "text-success"}>{trip.seatsLeft === 0 ? "Sold out" : `${trip.seatsLeft} seat${trip.seatsLeft > 1 ? "s" : ""} left`} · {trip.seats.length} in car</span>
        <span className="text-cream/55">{trip.amenities.slice(0, 3).join(" · ")}</span>
      </div>
    </Link>
  );
}
