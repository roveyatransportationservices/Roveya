"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin, Search } from "lucide-react";
import { Empty, Panel, Spinner } from "@/components/ui";
import { api } from "@/lib/client";
import { rs, when } from "@/lib/format";
import { serviceOfVehicle } from "@/lib/services";

export type Place = { name: string; address?: string; latitude: number; longitude: number };
export type Passenger = { user_id: string; name: string; phone: string; email: string | null; status: string | null; walletPaise: number; openRide: { id: string; code: string; vehicle: string; status: string; service: string } | null };
export type Activity = { id: number; admin_email: string | null; action: string; detail: Record<string, unknown>; at: string };

const ACTIONS: Record<string, string> = {
  "ride.create": "Booked by the desk",
  "ride.update": "Details changed",
  "ride.assign": "Captain assigned by the desk",
  "ride.cancel": "Cancelled",
  "ride.collect": "Cash marked collected",
  "ride.refund": "Refunded to wallet",
  "booking.create": "Booked by the desk",
  "booking.update": "Details changed",
  "booking.cancel": "Cancelled by the desk. The money collected is refunded",
  "booking.board": "Marked boarded",
};

// What the team did to this booking, from the audit log.
export function ActivityPanel({ entries, className = "" }: { entries: Activity[]; className?: string }) {
  return (
    <Panel title="Team activity" pad={false} className={className}>
      {entries.length ? (
        <ul className="divide-y divide-line">
          {entries.map((entry) => {
            const reason = typeof entry.detail?.reason === "string" ? entry.detail.reason : null;
            const captain = typeof entry.detail?.captain === "string" ? entry.detail.captain : null;
            const after = entry.detail?.after && typeof entry.detail.after === "object" ? Object.keys(entry.detail.after as object) : [];
            return (
              <li key={entry.id} className="px-5 py-3 text-[13px]">
                <p className="flex items-center justify-between gap-3">
                  <span className="font-medium">{ACTIONS[entry.action] ?? entry.action}</span>
                  <span className="text-[11px] muted">{when(entry.at)}</span>
                </p>
                <p className="text-[11px] muted">
                  {entry.admin_email ?? "System"}
                  {captain ? ` · ${captain}` : ""}
                  {after.length ? ` · changed ${after.map((key) => key.replace(/_/g, " ")).join(", ")}` : ""}
                  {reason ? ` · “${reason}”` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="p-5">
          <Empty text="No one on the team has touched this booking." />
        </div>
      )}
    </Panel>
  );
}

// 10-digit phone field that shows who the passenger is as soon as the number is complete.
export function PassengerField({ phone, setPhone, onPassenger }: { phone: string; setPhone: (value: string) => void; onPassenger: (passenger: Passenger | null) => void }) {
  const [state, setState] = useState<{ loading: boolean; passenger: Passenger | null; checked: string }>({ loading: false, passenger: null, checked: "" });
  useEffect(() => {
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setState({ loading: false, passenger: null, checked: "" });
      onPassenger(null);
      return;
    }
    let live = true;
    setState((current) => ({ ...current, loading: true }));
    api<{ passenger: Passenger | null }>(`/desk?phone=${phone}`)
      .then(({ passenger }) => {
        if (!live) return;
        setState({ loading: false, passenger, checked: phone });
        onPassenger(passenger);
      })
      .catch(() => live && setState({ loading: false, passenger: null, checked: phone }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);
  const p = state.passenger;
  return (
    <label className="block">
      <span className="label">Passenger mobile</span>
      <input className="input" inputMode="numeric" maxLength={10} placeholder="10-digit number they signed up with" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, ""))} />
      <span className="mt-1 block min-h-4 text-[11px]">
        {state.loading ? (
          <span className="muted">Looking up…</span>
        ) : p ? (
          <span>
            <span className="text-success">{p.name}</span>
            <span className="muted"> · ROVEYA Cash {rs(p.walletPaise)}</span>
            {p.status && p.status !== "active" ? <span className="text-danger"> · account blocked</span> : null}
            {p.openRide ? (
              <span className="text-amber">
                {" "}
                · on {p.openRide.service}{" "}
                <Link href={`/bookings/${serviceOfVehicle(p.openRide.vehicle)}/${p.openRide.id}`} className="underline">
                  {p.openRide.code}
                </Link>
              </span>
            ) : null}
          </span>
        ) : state.checked ? (
          <span className="text-danger">No passenger with this number. Ask them to sign in to the ROVEYA app once.</span>
        ) : null}
      </span>
    </label>
  );
}

// Search box for a pickup or drop. Typing "17.43, 78.44" uses that exact point.
export function PlaceField({ label, value, onChange }: { label: string; value: Place | null; onChange: (place: Place | null) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Place[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (value || q.trim().length < 3) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => {
      setBusy(true);
      api<{ places: Place[]; note?: string }>(`/places?q=${encodeURIComponent(q.trim())}`)
        .then((result) => {
          setHits(result.places);
          setNote(result.note ?? (result.places.length ? "" : "No match. Try a landmark or area name."));
        })
        .catch((failure: Error) => setNote(failure.message))
        .finally(() => setBusy(false));
    }, 450);
    return () => clearTimeout(timer);
  }, [q, value]);

  if (value)
    return (
      <div>
        <span className="label">{label}</span>
        <div className="flex items-start justify-between gap-3 rounded-lg border border-line px-3 py-2 text-[13px]">
          <span>
            <MapPin size={13} className="mr-1 inline text-gold" />
            {value.name}
            {value.address ? <span className="block text-[11px] muted">{value.address}</span> : null}
          </span>
          <button
            type="button"
            className="text-[11px] text-sky hover:underline"
            onClick={() => {
              onChange(null);
              setQ("");
            }}
          >
            Change
          </button>
        </div>
      </div>
    );
  return (
    <div className="relative">
      <span className="label">{label}</span>
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 muted" />
        <input className="input pl-8" placeholder="Area, landmark or 17.4375, 78.4483" value={q} onChange={(event) => setQ(event.target.value)} />
        {busy ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <Spinner size={12} />
          </span>
        ) : null}
      </div>
      {hits.length ? (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-line bg-panel shadow-xl">
          {hits.map((hit) => (
            <li key={`${hit.latitude},${hit.longitude}`}>
              <button type="button" className="block w-full px-3 py-2 text-left text-[13px] hover:bg-mist" onClick={() => onChange(hit)}>
                {hit.name}
                <span className="block truncate text-[11px] muted">{hit.address}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : note && q.trim().length >= 3 && !busy ? (
        <span className="mt-1 block text-[11px] muted">{note}</span>
      ) : null}
    </div>
  );
}
