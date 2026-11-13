"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpDown, CalendarDays, MapPin, Navigation, Search } from "lucide-react";
import { dayParts, shiftDay, todayIso } from "@/lib/format";
import { CITIES } from "@/lib/rules";

function CityField({ label, value, onChange, exclude, icon }: { label: string; value: string; onChange: (id: string) => void; exclude: string; icon: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const current = CITIES.find((city) => city.id === value);
  const needle = query.trim().toLowerCase();
  const shown = CITIES.filter((city) => city.id !== exclude && (!needle || city.name.toLowerCase().includes(needle) || city.state.toLowerCase().includes(needle))).slice(0, 8);

  useEffect(() => {
    const close = (event: MouseEvent) => !box.current?.contains(event.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={box} className="relative">
      <label className="flex items-center gap-3 px-5 py-4">
        {icon}
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-cream/50">{label}</span>
          <input
            value={open ? query : (current?.name ?? "")}
            onFocus={() => {
              setOpen(true);
              setQuery("");
            }}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Type a city"
            className="w-full bg-transparent text-lg font-semibold outline-none placeholder:font-normal placeholder:text-cream/35"
            aria-label={label}
          />
        </span>
      </label>
      {open ? (
        <ul className="card absolute left-2 right-2 top-full z-30 mt-1 max-h-80 overflow-y-auto p-2 shadow-2xl">
          {shown.length ? (
            shown.map((city) => (
              <li key={city.id}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(city.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left hover:bg-mist"
                >
                  <span className="font-medium">{city.name}</span>
                  <span className="text-xs text-cream/45">{city.state}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-3 text-sm text-cream/55">No ROVEYA cars from there yet.</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

export function SearchBox({ initial }: { initial?: { from?: string; to?: string; date?: string; women?: boolean } }) {
  const router = useRouter();
  const today = todayIso();
  const [from, setFrom] = useState(initial?.from ?? "hyd");
  const [to, setTo] = useState(initial?.to && initial.to !== (initial?.from ?? "hyd") ? initial.to : (initial?.from ?? "hyd") === "vja" ? "hyd" : "vja");
  const [date, setDate] = useState(initial?.date && initial.date >= today ? initial.date : today);
  const [women, setWomen] = useState(Boolean(initial?.women));
  const strip = useMemo(() => Array.from({ length: 6 }, (_, index) => shiftDay(today, index)), [today]);

  const go = () => router.push(`/search?from=${from}&to=${to}&date=${date}${women ? "&women=1" : ""}`);

  return (
    <form
      className="card relative overflow-visible shadow-[0_30px_80px_rgba(0,0,0,0.45)]"
      onSubmit={(event) => {
        event.preventDefault();
        go();
      }}
    >
      <div className="grid lg:grid-cols-[1fr_auto_1fr_1.25fr_auto] lg:items-center">
        <CityField label="Leaving from" value={from} onChange={setFrom} exclude={to} icon={<Navigation size={20} className="shrink-0 text-gold" />} />
        <button
          type="button"
          aria-label="Swap cities"
          onClick={() => {
            setFrom(to);
            setTo(from);
          }}
          className="absolute right-5 top-[66px] z-10 flex h-10 w-10 items-center justify-center rounded-full border border-gold/30 bg-night text-gold transition hover:border-gold lg:static lg:mx-1"
        >
          <ArrowUpDown size={16} className="lg:rotate-90" />
        </button>
        <div className="border-t border-gold/10 lg:border-l lg:border-t-0">
          <CityField label="Going to" value={to} onChange={setTo} exclude={from} icon={<MapPin size={20} className="shrink-0 text-rose" />} />
        </div>
        <div className="border-t border-gold/10 px-5 py-4 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs text-cream/50">
              <CalendarDays size={14} className="text-gold" /> Travel date
            </span>
            <input type="date" value={date} min={today} max={shiftDay(today, 30)} onChange={(event) => event.target.value && setDate(event.target.value)} className="rounded-lg bg-transparent text-xs text-gold outline-none [color-scheme:dark]" aria-label="Pick another date" />
          </div>
          <div className="mt-2 flex gap-1.5">
            {strip.map((iso, index) => {
              const parts = dayParts(iso);
              const on = iso === date;
              return (
                <button key={iso} type="button" onClick={() => setDate(iso)} className={`flex-1 rounded-xl border px-1 py-1.5 text-center transition ${on ? "border-gold bg-gold text-night" : "border-gold/15 hover:border-gold/50"}`}>
                  <span className={`block text-[10px] ${on ? "text-night/70" : "text-cream/45"}`}>{index === 0 ? "Today" : parts.day}</span>
                  <span className="block text-sm font-semibold">{parts.date}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="p-4 lg:pl-2">
          <button className="btn h-full w-full px-7 py-4 text-base lg:min-h-[72px]">
            <Search size={18} /> Search cars
          </button>
        </div>
      </div>
      <div className="flex items-center gap-4 border-t border-gold/10 px-5 py-3.5 lg:px-6">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose/15 text-base text-rose">♀</span>
        <div className="min-w-0 flex-1 leading-tight">
          <label htmlFor="women-only" className="block cursor-pointer text-sm font-medium">
            Booking for women
          </label>
          <Link href="/safety#women" className="mt-1 inline-block text-xs text-rose underline-offset-4 hover:underline">
            Know more
          </Link>
        </div>
        <label className="relative inline-flex shrink-0 cursor-pointer items-center">
          <input id="women-only" type="checkbox" checked={women} onChange={(event) => setWomen(event.target.checked)} className="peer sr-only" />
          <span className="h-6 w-11 rounded-full bg-mist ring-1 ring-cream/15 transition peer-checked:bg-rose peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-gold" />
          <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-cream shadow transition peer-checked:translate-x-5" />
        </label>
      </div>
    </form>
  );
}
