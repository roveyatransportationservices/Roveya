"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { List, MapPin, Plus, Radio } from "lucide-react";
import { Chips } from "@/components/list";
import { Progress } from "@/components/charts";
import { MapLegend, NetworkMap, type MapCity } from "@/components/NetworkMap";
import { CityStatus, count, DemandTable, perDay, PERIODS, RouteTable, type DemandGap, type NetworkCity, type NetworkRoute } from "@/components/networks";
import { PageHead, useAdmin } from "@/components/Shell";
import { Empty, Failure, Loading, Panel, Stat } from "@/components/ui";
import { useData } from "@/lib/client";
import { dateOnly, num, pct } from "@/lib/format";

type Network = {
  days: number;
  totals: { states: number; cities: number; routes: number; vehicles: number; vado: number; trips: number; tripsPerDay: number; seatsBooked: number; upcoming: number; searches: number; unmet: number };
  states: { state: string; cities: NetworkCity[]; vehicles: number; vado: number; departures: number; seatsFrom: number }[];
  routes: NetworkRoute[];
  gaps: DemandGap[];
  notYet: { id: string; name: string; state: string; searches: number }[];
};

export default function NetworksPage() {
  const [days, setDays] = useState("30");
  const { data, error, loading, reload } = useData<Network>(`/networks?days=${days}`, 60000);
  return (
    <>
      <PageHead
        title="Carpool Networks"
        sub="Every city and state ROVEYA Carpool Travels runs in, where passengers want to go, and the cities being launched."
        actions={
          <>
            <Link href="/networks/live" className="btn">
              <Radio size={14} /> On the road now
            </Link>
            <Link href="/trips" className="btn">
              <List size={14} /> All carpool trips
            </Link>
          </>
        }
      />
      <div className="mb-4">
        <Chips value={days} onChange={setDays} options={PERIODS} />
      </div>
      {error ? <Failure text={error} retry={reload} /> : loading || !data ? <Loading rows={10} /> : <NetworkView data={data} />}
    </>
  );
}

function NetworkView({ data }: { data: Network }) {
  const t = data.totals;
  const cities = useMemo(() => data.states.flatMap((state) => state.cities), [data]);
  // Stable inputs so the map is only redrawn when the numbers change.
  const key = JSON.stringify([data.days, t, data.routes.length, data.gaps.length, cities.map((row) => [row.id, row.status, row.departures, row.arrivals, row.unmet])]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mapCities = useMemo<MapCity[]>(() => [...cities.map((row) => ({ ...row, inNetwork: true })), ...data.notYet.map((row) => ({ ...row, status: "none", departures: 0, arrivals: 0, vehicles: 0, vado: 0, unmet: row.searches, inNetwork: false }))], [key]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mapRoutes = useMemo(() => data.routes.map((row) => ({ from: row.from, to: row.to, weight: row.trips })), [key]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mapGaps = useMemo(() => data.gaps.filter((row) => row.unmetSearchers > 0).map((row) => ({ from: row.from, to: row.to, weight: row.unmetSearchers })), [key]);
  const planned = cities.filter((row) => row.plan);

  return (
    <>
      <Panel className="mb-5">
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-5 xl:grid-cols-10">
          <Stat label="States" value={num(t.states)} />
          <Stat label="Cities" value={num(t.cities)} />
          <Stat label="Routes" value={num(t.routes)} />
          <Stat label="Vehicles" value={num(t.vehicles)} sub={`ran in ${data.days} days`} />
          <Stat label="Riders" value={num(t.vado)} sub="passengers who booked" />
          <Stat label="Trips a day" value={perDay(t.tripsPerDay)} sub={`${num(t.trips)} in ${data.days} days`} />
          <Stat label="Seats booked" value={num(t.seatsBooked)} tone="text-gold" />
          <Stat label="Upcoming trips" value={num(t.upcoming)} tone="text-sky" />
          <Stat label="Searchers" value={num(t.searches)} sub="looked for seats" />
          <Stat label="Found no trip" value={num(t.unmet)} tone={t.unmet ? "text-rose" : "text-cream"} />
        </div>
      </Panel>

      <Panel title="Network map" className="mb-5">
        <NetworkMap cities={mapCities} routes={mapRoutes} gaps={mapGaps} />
        <MapLegend />
      </Panel>

      {data.states.length ? (
        <div className="mb-5 grid gap-5 2xl:grid-cols-2 [&>*]:min-w-0">
          {data.states.map((state) => (
            <Panel
              key={state.state}
              pad={false}
              title={
                <span className="flex items-center gap-2">
                  <MapPin size={15} className="text-gold" /> {state.state}
                </span>
              }
              action={
                <span className="text-[11px] muted">
                  {count(state.cities.length, "city", "cities")} · {count(state.vehicles, "vehicle")} · {num(state.vado)} Riders
                </span>
              }
            >
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>City</th>
                      <th>Status</th>
                      <th>Vehicles</th>
                      <th>Riders</th>
                      <th>Trips a day</th>
                      <th>Seats booked from</th>
                      <th className="w-28">Fill</th>
                      <th>Searchers</th>
                      <th>Upcoming</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.cities.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <Link href={`/networks/${row.id}`} className="font-semibold text-gold hover:underline">
                            {row.name}
                          </Link>
                          <p className="text-[10px] muted">{row.since ? `${count(row.routes, "route")} · since ${dateOnly(row.since)}` : "No trips yet"}</p>
                        </td>
                        <td>
                          <CityStatus city={row} />
                        </td>
                        <td className="tabular-nums">
                          {num(row.vehicles)}
                          {row.captainsBased ? <span className="block text-[10px] muted">{count(row.captainsBased, "captain")} based here</span> : null}
                        </td>
                        <td className="tabular-nums">{num(row.vado)}</td>
                        <td className="tabular-nums">
                          {perDay(row.tripsPerDay)}
                          <span className="block text-[10px] muted">
                            {row.departures} out · {row.arrivals} in
                          </span>
                        </td>
                        <td className="tabular-nums">
                          {num(row.seatsFrom)}
                          <span className="block text-[10px] muted">{num(row.seatsTo)} into the city</span>
                        </td>
                        <td>
                          <p className="mb-1 text-[11px]">{pct(row.fill)}</p>
                          <Progress value={row.fill} color="#6FCF97" />
                        </td>
                        <td className="tabular-nums">
                          {num(row.searches)}
                          {row.unmet ? <span className="block text-[10px] text-rose">{row.unmet} found no trip</span> : null}
                        </td>
                        <td className="tabular-nums text-sky">{num(row.upcoming)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel className="mb-5">
          <Empty text="No carpool trips yet. A city joins the network when a captain publishes its first trip from or to it, or when you add it to the launch planner." />
        </Panel>
      )}

      <div className="mb-5">
        <DemandTable gaps={data.gaps} days={data.days} />
      </div>

      <div className="mb-5">
        <RouteTable routes={data.routes} days={data.days} />
      </div>

      <LaunchPlanner planned={planned} notYet={data.notYet} />
    </>
  );
}

function LaunchPlanner({ planned, notYet }: { planned: NetworkCity[]; notYet: Network["notYet"] }) {
  const router = useRouter();
  const { can } = useAdmin();
  const [pick, setPick] = useState("");
  return (
    <div className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
      <Panel
        title="Launch planner"
        pad={false}
        className="lg:col-span-2"
        action={
          can("trips.manage") ? (
            <span className="flex items-center gap-2">
              <select className="input h-8 py-0 text-[12px]" value={pick} onChange={(event) => setPick(event.target.value)} aria-label="City to plan">
                <option value="">Add a city…</option>
                {notYet.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} · {row.state}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-gold h-8 px-2.5 text-[12px]" disabled={!pick} onClick={() => router.push(`/networks/${pick}?plan=1`)}>
                <Plus size={13} /> Plan
              </button>
            </span>
          ) : null
        }
      >
        {planned.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>City</th>
                  <th>Status</th>
                  <th className="w-40">Captains (based here / target)</th>
                  <th>Launch date</th>
                  <th>Owner</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {planned.map((row) => {
                  const target = row.plan?.target_captains ?? 0;
                  return (
                    <tr key={row.id}>
                      <td>
                        <Link href={`/networks/${row.id}`} className="font-semibold text-gold hover:underline">
                          {row.name}
                        </Link>
                        <p className="text-[10px] muted">{row.state}</p>
                      </td>
                      <td>
                        <CityStatus city={row} />
                      </td>
                      <td>
                        <p className="mb-1 text-[11px]">
                          {row.captainsBased} / {target || "—"}
                        </p>
                        {target ? <Progress value={Math.min(1, row.captainsBased / target)} color="#E8A15C" /> : null}
                      </td>
                      <td className="muted">{dateOnly(row.plan?.launch_date)}</td>
                      <td>{row.plan?.owner ?? <span className="muted">—</span>}</td>
                      <td className="max-w-[260px] truncate text-[12px] muted" title={row.plan?.note ?? ""}>
                        {row.plan?.note ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <Empty text="No city is in the launch planner yet. Add one to track its status, captain target, launch date and owner." />
          </div>
        )}
      </Panel>

      <Panel title="Cities not in the network yet">
        {notYet.length ? (
          <>
            <p className="mb-3 text-[12px] muted">Captains can publish trips to these cities, but none have so far. The number is passengers who searched for them.</p>
            <div className="flex flex-wrap gap-2">
              {notYet.map((row) => (
                <Link key={row.id} href={`/networks/${row.id}`} className={`rounded-full border px-3 py-1 text-[12px] hover:border-gold ${row.searches ? "border-rose/50" : "border-line"}`}>
                  {row.name} <span className="muted">· {row.state}</span>
                  {row.searches ? <span className="ml-1 font-semibold text-rose">{row.searches}</span> : null}
                </Link>
              ))}
            </div>
          </>
        ) : (
          <Empty text="Every city is in the network." />
        )}
      </Panel>
    </div>
  );
}
