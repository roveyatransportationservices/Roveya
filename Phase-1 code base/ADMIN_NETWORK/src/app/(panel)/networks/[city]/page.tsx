"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarClock, Pencil, Trash2 } from "lucide-react";
import { CHART, LineChart, Progress } from "@/components/charts";
import { Chips } from "@/components/list";
import { CityStatus, count, DemandTable, perDay, PERIODS, RouteTable, STATUS_TEXT, type DemandGap, type NetworkCity, type NetworkRoute } from "@/components/networks";
import { PageHead, useAdmin } from "@/components/Shell";
import { Badge, Empty, Failure, Field, Loading, Modal, Panel, Row, Spinner, Stat, useAction, useFeedback } from "@/components/ui";
import { api, useData } from "@/lib/client";
import { dateOnly, num, pct, route, rs, shortDay, when } from "@/lib/format";

type Detail = {
  days: number;
  city: NetworkCity;
  team: { id: string; name: string }[];
  series: { labels: string[]; departures: number[]; arrivals: number[]; seats: number[]; searches: number[]; unmet: number[] };
  routes: NetworkRoute[];
  gaps: DemandGap[];
  upcoming: { id: string; code: string; from_city: string; to_city: string; depart_at: string; seats_total: number; seats_booked: number }[];
  points: { name: string; kind: "Boarding" | "Drop"; seats: number }[];
  vehicles: { car_id: string; make_model?: string; plate?: string; car_class?: string; captain_id?: string; captain_name?: string; captain_code?: string; trips: number }[];
  captainsBased: { user_id: string; name: string; captain_code: string; phone: string; rating: number }[];
  topVado: { user_id: string; name: string; phone: string; seats: number }[];
};

export default function CityNetworkPage({ params }: { params: Promise<{ city: string }> }) {
  const { city: id } = use(params);
  const [days, setDays] = useState("30");
  const { data, error, loading, reload } = useData<Detail>(`/networks/${id}?days=${days}`, 60000);
  const { can } = useAdmin();
  const { ask } = useFeedback();
  const { busy, run } = useAction();
  const [editing, setEditing] = useState(false);
  // "Plan" on the networks page opens the editor straight away.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("plan") === "1") setEditing(true);
  }, []);

  if (error) return <Failure text={error} retry={reload} />;
  if (loading || !data) return <Loading rows={10} />;
  const c = data.city;
  const plan = c.plan;
  const target = plan?.target_captains ?? 0;

  const clear = async () => {
    const yes = await ask({ title: `Remove ${c.name} from the launch planner?`, body: "The plan is removed. The city still shows in the network if trips run there.", confirm: "Remove plan", danger: true });
    if (!yes) return;
    const done = await run("clear", () => api<Detail>(`/networks/${id}`, { method: "DELETE" }), "Plan removed.");
    if (done) reload();
  };

  return (
    <>
      <Link href="/networks" className="mb-3 inline-flex items-center gap-1.5 text-xs muted hover:text-gold">
        <ArrowLeft size={14} /> Carpool Networks
      </Link>
      <PageHead
        title={`${c.name} network`}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            {c.state} · {c.since ? `in the network since ${dateOnly(c.since)}` : "no trips yet"} <CityStatus city={c} />
          </span>
        }
        actions={
          can("trips.manage") ? (
            <>
              <button type="button" className="btn btn-gold" onClick={() => setEditing(true)}>
                {plan ? <Pencil size={14} /> : <CalendarClock size={14} />} {plan ? "Edit launch plan" : "Add to launch planner"}
              </button>
              {plan ? (
                <button type="button" className="btn btn-danger" disabled={Boolean(busy)} onClick={() => void clear()}>
                  {busy === "clear" ? <Spinner /> : <Trash2 size={14} />} Remove plan
                </button>
              ) : null}
            </>
          ) : null
        }
      />

      {plan ? (
        <Panel title="Launch plan" className="mb-5">
          <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-4">
            <Row label="Status" value={<Badge value={plan.status}>{STATUS_TEXT[plan.status] ?? plan.status}</Badge>} />
            <Row label="Launch date" value={dateOnly(plan.launch_date)} />
            <Row label="Owner" value={plan.owner ?? "—"} />
            <Row label="Updated" value={when(plan.updated_at)} />
          </div>
          <div className="mt-3">
            <p className="mb-1 text-[12px]">
              Captains based here: <span className="font-semibold">{c.captainsBased}</span>
              {target ? ` of ${target} wanted` : ""}
            </p>
            {target ? <Progress value={Math.min(1, c.captainsBased / target)} color="#E8A15C" /> : null}
          </div>
          {plan.note ? <p className="mt-3 text-[13px] text-cream/80">{plan.note}</p> : null}
        </Panel>
      ) : null}
      <div className="mb-4">
        <Chips value={days} onChange={setDays} options={PERIODS} />
      </div>

      <Panel className="mb-5">
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4 lg:grid-cols-8">
          <Stat label="Routes" value={num(c.routes)} />
          <Stat label="Vehicles" value={num(c.vehicles)} sub={c.captainsBased ? `${count(c.captainsBased, "captain")} based here` : `ran in ${data.days} days`} />
          <Stat label="Riders" value={num(c.vado)} sub="passengers who booked" />
          <Stat label="Trips a day" value={perDay(c.tripsPerDay)} sub={`${c.departures} out · ${c.arrivals} in`} />
          <Stat label="Seats booked from" value={num(c.seatsFrom)} tone="text-gold" />
          <Stat label="Seats booked into" value={num(c.seatsTo)} />
          <Stat label="Fill from here" value={pct(c.fill)} tone="text-success" />
          <Stat label="ROVEYA earns" value={rs(c.profitPaise)} sub="on trips from here" tone="text-gold" />
        </div>
      </Panel>

      <Panel title={`Day by day · last ${data.days} days`} className="mb-5">
        <LineChart
          labels={data.series.labels.map(shortDay)}
          series={[
            { name: "Trips out", values: data.series.departures, color: CHART.gold, fill: true },
            { name: "Trips in", values: data.series.arrivals, color: CHART.sky },
            { name: "Seats booked from", values: data.series.seats, color: CHART.green },
            { name: "Searches from here", values: data.series.searches, color: CHART.lilac },
            { name: "Found no trip", values: data.series.unmet, color: CHART.rose },
          ]}
        />
      </Panel>

      <div className="mb-5">
        <RouteTable routes={data.routes} days={data.days} title={`Routes from and to ${c.name}`} />
      </div>

      <div className="mb-5">
        <DemandTable gaps={data.gaps} days={data.days} title={`What passengers searched from and to ${c.name}`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        <Panel title="Upcoming trips" pad={false} className="lg:col-span-2">
          {data.upcoming.length ? (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Trip</th>
                    <th>Route</th>
                    <th>Departs</th>
                    <th>Seats</th>
                  </tr>
                </thead>
                <tbody>
                  {data.upcoming.map((trip) => (
                    <tr key={trip.id}>
                      <td>
                        <Link href={`/trips/${trip.id}`} className="font-semibold text-gold hover:underline">
                          {trip.code}
                        </Link>
                      </td>
                      <td>{route(trip.from_city, trip.to_city)}</td>
                      <td className="muted">{when(trip.depart_at)}</td>
                      <td className="tabular-nums">
                        {trip.seats_booked}/{trip.seats_total} booked
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5">
              <Empty text={`No upcoming trips from or to ${c.name}.`} />
            </div>
          )}
        </Panel>

        <Panel title="Busiest stops" pad={false}>
          {data.points.length ? (
            <ul className="divide-y divide-line">
              {data.points.map((point) => (
                <li key={`${point.kind}-${point.name}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px]">
                  <span className="flex items-center gap-2">
                    {point.name}
                    <Badge value={point.kind === "Boarding" ? "active" : "scheduled"}>{point.kind}</Badge>
                  </span>
                  <span className="tabular-nums muted">{count(point.seats, "seat")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <Empty text="No seats booked here in this period." />
            </div>
          )}
        </Panel>

        <Panel title={`Vehicles that ran here · ${data.days} days`} pad={false}>
          {data.vehicles.length ? (
            <ul className="divide-y divide-line">
              {data.vehicles.map((car) => (
                <li key={car.car_id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px]">
                  <span>
                    {car.make_model ?? "Car"} · {car.plate ?? "—"}
                    {car.captain_id ? (
                      <Link href={`/captains/${car.captain_id}`} className="block text-[11px] text-sky hover:underline">
                        {car.captain_name} · {car.captain_code}
                      </Link>
                    ) : null}
                  </span>
                  <span className="tabular-nums muted">
                    {count(car.trips, "trip")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <Empty text="No vehicles ran here in this period." />
            </div>
          )}
        </Panel>

        <Panel title="Captains based here" pad={false}>
          {data.captainsBased.length ? (
            <ul className="divide-y divide-line">
              {data.captainsBased.map((captain) => (
                <li key={captain.user_id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px]">
                  <Link href={`/captains/${captain.user_id}`} className="hover:text-gold">
                    {captain.name}
                    <span className="block text-[11px] muted">
                      {captain.captain_code} · {captain.phone}
                    </span>
                  </Link>
                  <span className="text-[11px] muted">★ {Number(captain.rating).toFixed(2)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <Empty text={`No active carpool captain lists ${c.name} as home.`} />
            </div>
          )}
        </Panel>

        <Panel title="Top Riders" pad={false}>
          {data.topVado.length ? (
            <ul className="divide-y divide-line">
              {data.topVado.map((person) => (
                <li key={person.user_id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px]">
                  <Link href={`/travellers/${person.user_id}`} className="hover:text-gold">
                    {person.name}
                    <span className="block text-[11px] muted">{person.phone}</span>
                  </Link>
                  <span className="tabular-nums muted">{count(person.seats, "seat")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <Empty text="No passengers booked here in this period." />
            </div>
          )}
        </Panel>
      </div>

      {editing ? <PlanEditor id={id} detail={data} onClose={() => setEditing(false)} onSaved={() => (setEditing(false), reload())} /> : null}
    </>
  );
}

function PlanEditor({ id, detail, onClose, onSaved }: { id: string; detail: Detail; onClose: () => void; onSaved: () => void }) {
  const current = detail.city.plan;
  const { busy, run } = useAction();
  const [status, setStatus] = useState(current?.status ?? "planned");
  const [target, setTarget] = useState(current?.target_captains != null ? String(current.target_captains) : "");
  const [launch, setLaunch] = useState(current?.launch_date ?? "");
  const [owner, setOwner] = useState(current?.owner_id ?? "");
  const [note, setNote] = useState(current?.note ?? "");

  const save = async () => {
    const body = { status, targetCaptains: target ? Number(target) : null, launchDate: launch || null, ownerId: owner || null, note: note.trim() || null };
    const done = await run("save", () => api(`/networks/${id}`, { method: "PATCH", body }), "Launch plan saved.");
    if (done) onSaved();
  };

  return (
    <Modal title={`${current ? "Edit" : "Plan"} ${detail.city.name}`} onClose={onClose} locked={Boolean(busy)}>
      <div className="space-y-4">
        <div>
          <span className="label">Status</span>
          <Chips
            value={status}
            onChange={setStatus}
            options={[
              ["planned", "Planned"],
              ["launching", "Launching"],
              ["live", "Live"],
              ["paused", "Paused"],
            ]}
          />
          <span className="mt-1 block text-[11px] muted">
            {status === "paused" ? "Paused stops new trips and new seat bookings from and to this city in the apps and the website. Bookings already made stay as they are." : "Planned, Launching and Live are for the team's tracking. They do not change what the apps allow."}
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Captains wanted" hint={`${detail.city.captainsBased} carpool captains are based here now.`}>
            <input className="input" inputMode="numeric" maxLength={5} value={target} onChange={(event) => setTarget(event.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Launch date">
            <input className="input" type="date" value={launch} onChange={(event) => setLaunch(event.target.value)} />
          </Field>
        </div>
        <Field label="Owner">
          <select className="input" value={owner} onChange={(event) => setOwner(event.target.value)}>
            <option value="">No owner</option>
            {detail.team.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note">
          <textarea className="input min-h-20" maxLength={500} placeholder="Boarding points to sign up, partner stands, local ads…" value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose} disabled={Boolean(busy)}>
          Close
        </button>
        <button type="button" className="btn btn-gold" disabled={Boolean(busy)} onClick={() => void save()}>
          {busy ? <Spinner /> : null} Save plan
        </button>
      </div>
    </Modal>
  );
}
