"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bike, IdCard, Search, ShieldAlert, Star, Ticket, UserRound, Wallet } from "lucide-react";
import { PageHead } from "@/components/Shell";
import { Badge, Empty, Failure, Loading, Panel } from "@/components/ui";
import { api } from "@/lib/client";
import { ago, when } from "@/lib/format";
import { SERVICE_INFO, type ServiceKey } from "@/lib/services";

type Ride = { code: string; service: string; status: string; fare: number; payment: string; paymentStatus: string; from: string; to: string; at: string; cancelReason: string | null; with: string | null };
type Profile = {
  role: "rider" | "vado";
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  statusNote: string | null;
  joined: string;
  code: string | null;
  detail: { service: ServiceKey; city: string | null; vehicle: string | null; rating: number; approved: string | null } | null;
  totals: { rides: number; bookings: number };
  wallet: number | null;
  tickets: { id: string; code: string; topic: string; status: string; priority: string; created_at: string }[];
  sos: { id: string; code: string; kind: string; status: string; created_at: string }[];
  rides: Ride[];
  bookings: { pnr: string; status: string; total: number; paidWith: string | null; refund: number; seats: number; trip: string | null; route: string | null; departs: string | null; at: string }[];
  payments: { purpose: string; amount: number; status: string; at: string }[];
  carpoolTrips: { code: string; route: string; departs: string; status: string; seatsBooked: number }[];
};
type Result = { query: string; kind: string; profiles: Profile[]; focus: { label: string; lines: [string, string][] } | null };

const inr = (value: number) => `₹${value.toLocaleString("en-IN")}`;
const isTime = (value: string) => /^\d{4}-\d{2}-\d{2}T/.test(value);

// The desk's read-only view of a rider or Vado, found by mobile number or any ROVEYA code.
export function DeskLookup() {
  const router = useRouter();
  const params = useSearchParams();
  const asked = params.get("q") ?? "";
  const rider = params.get("rider");
  const vado = params.get("vado");
  const [text, setText] = useState(asked);
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = rider ? `rider=${rider}` : vado ? `vado=${vado}` : asked ? `q=${encodeURIComponent(asked)}` : "";
    if (!query) {
      setData(null);
      return;
    }
    setLoading(true);
    setError("");
    api<Result>(`/desk/lookup?${query}`)
      .then(setData)
      .catch((failure: Error) => (setData(null), setError(failure.message)))
      .finally(() => setLoading(false));
  }, [asked, rider, vado]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (text.trim()) router.push(`/desk/lookup?q=${encodeURIComponent(text.trim())}`);
  };

  return (
    <>
      <PageHead title="Look up" sub="Find a rider or Vado by mobile number, ride code (RV-), carpool trip (RVT-), PNR (RVY), Vado code (RC) or ticket (ST-). Read-only, and every lookup is recorded." />
      <form onSubmit={submit} className="mb-5 flex max-w-2xl gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-md border border-line bg-panel px-3">
          <Search size={15} className="muted" />
          <input autoFocus className="w-full bg-transparent py-2.5 text-sm outline-none" value={text} onChange={(event) => setText(event.target.value)} placeholder="9000011102 · RV-10003 · RVT-50002 · RVY482100 · RC100004 · ST-1002" />
        </label>
        <button className="btn btn-gold" disabled={text.trim().length < 4}>
          Look up
        </button>
      </form>
      {error ? <Failure text={error} /> : null}
      {loading ? <Loading rows={6} /> : null}
      {!loading && data ? (
        data.profiles.length || data.focus ? (
          <div className="space-y-5">
            {data.focus ? (
              <Panel title={data.focus.label}>
                <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-[140px_1fr]">
                  {data.focus.lines.map(([label, value]) => (
                    <div key={label} className="contents">
                      <dt className="muted">{label}</dt>
                      <dd>{isTime(value) ? `${when(value)} · ${ago(value)}` : value}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
            ) : null}
            {data.profiles.map((profile) => (
              <PersonCard key={`${profile.role}-${profile.id}`} profile={profile} />
            ))}
          </div>
        ) : (
          <Panel>
            <Empty text={`Nothing found for "${data.query}". Check the number or code.`} />
          </Panel>
        )
      ) : null}
      {!loading && !data && !error ? (
        <Panel>
          <Empty text="Type a mobile number or a code above. Names in support tickets and SOS alerts also open here." />
        </Panel>
      ) : null}
    </>
  );
}

function PersonCard({ profile }: { profile: Profile }) {
  const vado = profile.role === "vado";
  return (
    <Panel
      title={
        <span className="flex flex-wrap items-center gap-2">
          {vado ? <IdCard size={16} className="text-gold" /> : <UserRound size={16} className="text-gold" />}
          <span>{profile.name}</span>
          <span className="text-[11px] font-normal muted">{vado ? `Vado · ${profile.code}` : "Rider"}</span>
          <Badge value={profile.status} />
        </span>
      }
    >
      <div className="grid gap-4 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Mobile" value={<a className="text-gold" href={`tel:+91${profile.phone}`}>+91 {profile.phone}</a>} />
        <Fact label="Joined" value={`${when(profile.joined)} · ${ago(profile.joined)}`} />
        <Fact label={vado ? "Completed rides" : "Rides · carpool bookings"} value={vado ? `${profile.totals.rides} rides · ${profile.totals.bookings} carpool bookings` : `${profile.totals.rides} · ${profile.totals.bookings}`} />
        <Fact label={vado ? "Wallet (earnings)" : "ROVEYA Cash"} value={<span className="flex items-center gap-1.5"><Wallet size={13} className="text-gold" />{profile.wallet === null ? "—" : inr(profile.wallet)}</span>} />
        {profile.detail ? (
          <>
            <Fact label="Service" value={SERVICE_INFO[profile.detail.service].name} />
            <Fact label="City" value={profile.detail.city ?? "—"} />
            <Fact label="Vehicle" value={profile.detail.vehicle ?? "—"} />
            <Fact label="Rating" value={<span className="flex items-center gap-1"><Star size={13} className="fill-current text-gold" />{profile.detail.rating.toFixed(1)}</span>} />
          </>
        ) : null}
        {profile.email ? <Fact label="Email" value={profile.email} /> : null}
        {profile.statusNote ? <Fact label="Status note" value={profile.statusNote} /> : null}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Section title={vado ? "Latest city rides as Vado" : "Latest city rides"} icon={<Bike size={14} />} empty="No bike, auto or taxi rides.">
          {profile.rides.map((ride) => (
            <li key={ride.code} className="py-2">
              <p className="flex flex-wrap justify-between gap-2">
                <span className="font-semibold">{ride.code} <span className="font-normal muted">· {ride.service}</span></span>
                <span>{inr(ride.fare)} <span className="muted">· {ride.payment} {ride.paymentStatus}</span></span>
              </p>
              <p className="text-[11px] muted">
                {ride.from} → {ride.to} · {ride.with ? `${vado ? "Rider" : "Vado"} ${ride.with} · ` : ""}
                <span className={ride.status === "completed" ? "text-success" : ride.status === "cancelled" ? "text-danger" : ""}>{ride.status}</span> · {ago(ride.at)}
                {ride.cancelReason ? ` · ${ride.cancelReason}` : ""}
              </p>
            </li>
          ))}
        </Section>
        {vado ? (
          <Section title="Latest carpool trips" icon={<Ticket size={14} />} empty="No carpool trips.">
            {profile.carpoolTrips.map((trip) => (
              <li key={trip.code} className="py-2">
                <p className="flex flex-wrap justify-between gap-2">
                  <Link className="font-semibold text-sky hover:underline" href={`/desk/lookup?q=${trip.code}`}>{trip.code}</Link>
                  <span>{trip.seatsBooked} seats booked</span>
                </p>
                <p className="text-[11px] muted">{trip.route} · {when(trip.departs)} · {trip.status}</p>
              </li>
            ))}
          </Section>
        ) : (
          <Section title="Latest carpool bookings" icon={<Ticket size={14} />} empty="No carpool bookings.">
            {profile.bookings.map((booking) => (
              <li key={booking.pnr} className="py-2">
                <p className="flex flex-wrap justify-between gap-2">
                  <Link className="font-semibold text-sky hover:underline" href={`/desk/lookup?q=${booking.pnr}`}>{booking.pnr}</Link>
                  <span>{inr(booking.total)}{booking.paidWith ? <span className="muted"> · {booking.paidWith}</span> : null}{booking.refund ? <span className="text-amber"> · refunded {inr(booking.refund)}</span> : null}</span>
                </p>
                <p className="text-[11px] muted">{booking.route ?? "—"} · {booking.seats} seat{booking.seats === 1 ? "" : "s"} · {booking.status} · {booking.departs ? when(booking.departs) : ago(booking.at)}</p>
              </li>
            ))}
          </Section>
        )}
        <Section title="Support tickets" icon={<Ticket size={14} />} empty="No support tickets.">
          {profile.tickets.map((ticket) => (
            <li key={ticket.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span><Link className="font-semibold text-sky hover:underline" href={`/support?ticket=${ticket.id}`}>{ticket.code}</Link> <span className="muted">· {ticket.topic}</span></span>
              <span className="text-[11px]"><Badge value={ticket.status} /> <span className="muted">{ago(ticket.created_at)}</span></span>
            </li>
          ))}
        </Section>
        <Section title="Safety alerts" icon={<ShieldAlert size={14} />} empty="No SOS or safety alerts.">
          {profile.sos.map((item) => (
            <li key={item.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span className={item.kind === "sos" ? "font-semibold text-danger" : "font-semibold"}>{item.code}</span>
              <span className="text-[11px]"><Badge value={item.status} /> <span className="muted">{ago(item.created_at)}</span></span>
            </li>
          ))}
        </Section>
        {!vado && profile.payments.length ? (
          <Section title="Latest payments" icon={<Wallet size={14} />} empty="">
            {profile.payments.map((payment, index) => (
              <li key={index} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{payment.purpose.replace(/_/g, " ")} <span className="muted">· {ago(payment.at)}</span></span>
                <span>{inr(payment.amount)} <span className={payment.status === "paid" || payment.status === "captured" ? "text-success" : payment.status === "failed" ? "text-danger" : "muted"}>· {payment.status}</span></span>
              </li>
            ))}
          </Section>
        ) : null}
      </div>
    </Panel>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] muted">{label}</p>
      <div className="mt-0.5 truncate">{value}</div>
    </div>
  );
}

function Section({ title, icon, empty, children }: { title: string; icon: React.ReactNode; empty: string; children: React.ReactNode[] }) {
  return (
    <div className="rounded-md border border-line p-3">
      <p className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gold">
        {icon} {title}
      </p>
      {children.length ? <ul className="divide-y divide-line text-[13px]">{children}</ul> : <p className="py-2 text-[12px] muted">{empty}</p>}
    </div>
  );
}
