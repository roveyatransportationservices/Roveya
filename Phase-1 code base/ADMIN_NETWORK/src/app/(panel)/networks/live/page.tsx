"use client";

import Link from "next/link";
import { AlertTriangle, ExternalLink, MapPin, Navigation } from "lucide-react";
import { AssignButton, CallButton } from "@/components/actions";
import { PageHead } from "@/components/Shell";
import { Badge, Empty, Failure, Loading, Panel } from "@/components/ui";
import { useData } from "@/lib/client";
import { ago, label, route, timeOnly, when } from "@/lib/format";

type LiveTrip = {
  id: string;
  code: string;
  status: string;
  from_city: string;
  to_city: string;
  depart_at: string;
  arrive_at: string;
  started_at: string | null;
  captain: { user_id: string; name: string; phone: string; captain_code: string } | null;
  car: { make_model: string; plate: string } | null;
  position: { latitude: number; longitude: number; speed_kmh: number; moved_at: string; updated_at: string } | null;
  stale: boolean;
  seats: { booked: number; boarded: number };
  alerts: { id: string; code: string; kind: string; status: string }[];
  trackUrl: string | null;
};

export default function LivePage() {
  const { data, error, loading, reload } = useData<{ trips: LiveTrip[] }>("/live", 20000);
  const moving = (data?.trips ?? []).filter((trip) => trip.status === "on_trip");
  const leaving = (data?.trips ?? []).filter((trip) => trip.status === "scheduled");

  const card = (trip: LiveTrip) => (
    <Panel key={trip.id} className={trip.alerts.length ? "border-danger/50" : ""}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href={`/trips/${trip.id}`} className="font-semibold text-gold hover:underline">
            {trip.code}
          </Link>
          <p className="text-[13px]">{route(trip.from_city, trip.to_city)}</p>
          <p className="text-[11px] muted">
            {trip.status === "on_trip" ? `Left ${timeOnly(trip.started_at)} · due ${timeOnly(trip.arrive_at)}` : `Departs ${when(trip.depart_at)}`}
          </p>
        </div>
        <Badge value={trip.status}>{trip.status === "on_trip" ? "On the road" : "Leaving soon"}</Badge>
      </div>
      {trip.alerts.length ? (
        <div className="mt-3 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] text-danger">
          <AlertTriangle size={13} className="mr-1 inline" />
          {trip.alerts.map((alert) => `${alert.code} ${label(alert.kind)}`).join(" · ")} · handled on the Support Desk
        </div>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
        <div>
          <p className="muted">Captain</p>
          <p className="font-medium">{trip.captain?.name ?? "—"}</p>
          <p className="muted">{trip.car ? `${trip.car.make_model} · ${trip.car.plate}` : ""}</p>
        </div>
        <div>
          <p className="muted">Travellers</p>
          <p className="font-medium">
            {trip.seats.boarded}/{trip.seats.booked} boarded
          </p>
        </div>
      </div>
      <div className="mt-3 rounded bg-night px-3 py-2 text-[12px]">
        {trip.position ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={trip.stale ? "text-amber" : "text-success"}>
              <Navigation size={12} className="mr-1 inline" />
              {Math.round(trip.position.speed_kmh)} km/h · updated {ago(trip.position.updated_at)}
              {trip.stale ? " (no signal)" : ""}
            </span>
            <a className="inline-flex items-center gap-1 text-sky hover:underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${trip.position.latitude}&mlon=${trip.position.longitude}#map=14/${trip.position.latitude}/${trip.position.longitude}`}>
              <MapPin size={12} /> Map
            </a>
          </div>
        ) : (
          <span className="muted">{trip.status === "on_trip" ? "No location from the captain app yet." : "Tracking starts when the captain starts the trip."}</span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {trip.captain ? <CallButton phone={trip.captain.phone} name={trip.captain.name} kind="Captain" entity="trip" entityId={trip.id} compact /> : null}
        {trip.trackUrl ? (
          <a href={trip.trackUrl} target="_blank" rel="noreferrer" className="btn px-2 py-1 text-[11px]">
            <ExternalLink size={12} /> Family link
          </a>
        ) : null}
        <AssignButton title={`Check on ${trip.code} · ${route(trip.from_city, trip.to_city)}`} entity="trip" entityId={trip.id} link={`/trips/${trip.id}`} compact />
      </div>
    </Panel>
  );

  return (
    <>
      <Link href="/networks" className="mb-3 inline-flex items-center gap-1.5 text-xs muted hover:text-gold">
        ← Carpool Networks
      </Link>
      <PageHead title="Carpool on the road" sub="Carpool Travels cars on the road and leaving in the next 3 hours. Refreshes every 20 seconds." />
      {error ? (
        <Failure text={error} retry={reload} />
      ) : loading || !data ? (
        <Loading rows={6} />
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="panel-title mb-3">On the road ({moving.length})</h2>
            {moving.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{moving.map(card)}</div> : <Panel><Empty text="No car is on a trip right now." /></Panel>}
          </section>
          <section>
            <h2 className="panel-title mb-3">Leaving soon ({leaving.length})</h2>
            {leaving.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{leaving.map(card)}</div> : <Panel><Empty text="No departures in the next 3 hours." /></Panel>}
          </section>
        </div>
      )}
    </>
  );
}
