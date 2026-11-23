"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CHART, LineChart } from "@/components/charts";
import { Chips, Toolbar } from "@/components/list";
import { PageHead } from "@/components/Shell";
import { Badge, Empty, Failure, Loading, Panel, Stat } from "@/components/ui";
import { useData } from "@/lib/client";
import { ago, dateOnly, num, pct, rs, shortDay } from "@/lib/format";

type Activity = "active" | "recent" | "inactive" | "waiting" | "suspended";
type Captain = { id: string; name: string; phone: string; code: string; status: string; city: string; vehicleNo: string; vehicleModel: string; rating: number; joinedAt: string; activity: Activity; onDuty: boolean; onRide: boolean; lastActive: string | null; rides15: number; activeDays15: number };
type Person = { user_id: string; name: string; phone?: string; captain_code?: string } | null;
type Ride = { id: string; code: string; status: string; pickup: string; drop: string; owedPaise: number; waitingMin: number; rider: Person; captain: Person };
type Live = {
  service: "bike" | "auto" | "car";
  name: string;
  days: number;
  totals: { registered: number; newInPeriod: number; approved: number; waiting: number; suspended: number; active: number; recent: number; inactive: number; onDuty: number; onRide: number; ridesInPeriod: number; busyCaptains: number };
  series: { labels: string[]; registered: number[]; working: number[] };
  captains: Captain[];
  rides: Ride[];
};

export const ACTIVITY: Record<Activity, { label: string; color: string; text: string }> = {
  active: { label: "Active", color: "#6FCF97", text: "On duty now or active in the last 24 hours" },
  recent: { label: "Active in 15 days", color: "#E8A15C", text: "Worked in the last 15 days, not today" },
  inactive: { label: "Not active 15+ days", color: "#E5484D", text: "No duty or rides for 15 days or more, or never" },
  waiting: { label: "Waiting approval", color: "#8FB4E8", text: "Registered, documents in review" },
  suspended: { label: "Suspended", color: "#9A8F99", text: "Paused by the team" },
};

const PERIODS: [string, string][] = [
  ["7", "7 days"],
  ["30", "30 days"],
  ["90", "90 days"],
];

function Dot({ activity }: { activity: Activity }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ACTIVITY[activity].color }} />;
}

export function CaptainLive({ service, soon }: { service: "bike" | "auto" | "car"; soon?: boolean }) {
  const [days, setDays] = useState("30");
  const [filter, setFilter] = useState<"" | Activity>("");
  const [q, setQ] = useState("");
  const { data, error, loading, reload } = useData<Live>(`/live/${service}?days=${days}`, 30000);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.captains ?? []).filter((row) => (!filter || row.activity === filter) && (!needle || `${row.name} ${row.phone} ${row.code} ${row.vehicleNo} ${row.city}`.toLowerCase().includes(needle)));
  }, [data, filter, q]);

  if (error) return <Failure text={error} retry={reload} />;
  if (loading || !data) return <Loading rows={10} />;
  const t = data.totals;
  const share = (value: number) => (t.approved ? value / t.approved : 0);

  return (
    <>
      <PageHead title={`${data.name} Live`} sub={soon ? `${data.name} is coming soon. Captains who register for it show up here.` : `${data.name} captains: who registered, who is working, and rides happening now. Refreshes every 30 seconds.`} />
      <div className="mb-4">
        <Chips value={days} onChange={setDays} options={PERIODS} />
      </div>

      <Panel className="mb-5">
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4 xl:grid-cols-8">
          <Stat label="Registered" value={num(t.registered)} sub={`${num(t.newInPeriod)} new in ${data.days} days`} />
          <Stat label="Approved" value={num(t.approved)} sub={`${num(t.waiting)} waiting approval`} />
          <Stat label="Active" value={num(t.active)} sub={pct(share(t.active))} tone="text-success" />
          <Stat label="Active in 15 days" value={num(t.recent)} sub={pct(share(t.recent))} tone="text-amber" />
          <Stat label="Not active 15+ days" value={num(t.inactive)} sub={pct(share(t.inactive))} tone="text-danger" />
          <Stat label="On duty now" value={num(t.onDuty)} sub={`${num(t.onRide)} on a ride`} tone="text-sky" />
          <Stat label={`Rides in ${data.days} days`} value={num(t.ridesInPeriod)} sub={`by ${num(t.busyCaptains)} captains`} />
          <Stat label="Suspended" value={num(t.suspended)} />
        </div>
        {t.approved ? (
          <div className="mt-5">
            <div className="flex h-3 overflow-hidden rounded-full bg-mist">
              {(["active", "recent", "inactive"] as const).map((key) => (
                <div key={key} style={{ width: `${share(t[key]) * 100}%`, background: ACTIVITY[key].color }} title={`${ACTIVITY[key].label}: ${t[key]}`} />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] muted">
              {(["active", "recent", "inactive", "waiting", "suspended"] as const).map((key) => (
                <span key={key} className="flex items-center gap-1.5">
                  <Dot activity={key} /> {ACTIVITY[key].label}: {ACTIVITY[key].text}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </Panel>

      <div className="mb-5 grid gap-5 xl:grid-cols-3 [&>*]:min-w-0">
        <Panel title={`Day by day · last ${data.days} days`} className="xl:col-span-2">
          <LineChart
            labels={data.series.labels.map(shortDay)}
            series={[
              { name: "Captains working", values: data.series.working, color: CHART.green, fill: true },
              { name: "New registrations", values: data.series.registered, color: CHART.gold },
            ]}
          />
        </Panel>
        <Panel title="Rides right now" pad={false}>
          {data.rides.length ? (
            <ul className="divide-y divide-line">
              {data.rides.map((ride) => (
                <li key={ride.id} className="px-5 py-3 text-[13px]">
                  <p className="flex items-center justify-between gap-2">
                    <Link href={`/bookings/${service === "car" ? "taxi" : service}/${ride.id}`} className="font-semibold text-gold hover:underline">
                      {ride.code}
                    </Link>
                    <Badge value={ride.status} />
                  </p>
                  <p className="truncate text-[11px] muted">
                    {ride.pickup} → {ride.drop} · {rs(ride.owedPaise)}
                  </p>
                  <p className="text-[11px] muted">
                    {ride.rider?.name ?? "Passenger"} · {ride.captain ? `${ride.captain.name}` : `waiting ${ride.waitingMin} min for a captain`}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <Empty text="No rides in progress." />
            </div>
          )}
        </Panel>
      </div>

      <Toolbar q={q} setQ={setQ} placeholder="Name, phone, RC code, plate or city">
        <Chips
          value={filter}
          onChange={(value) => setFilter(value as "" | Activity)}
          options={[
            ["", `All (${t.registered})`],
            ["active", `Active (${t.active})`],
            ["recent", `15 days (${t.recent})`],
            ["inactive", `Not active (${t.inactive})`],
            ["waiting", `Waiting (${t.waiting})`],
            ["suspended", `Suspended (${t.suspended})`],
          ]}
        />
      </Toolbar>
      <Panel pad={false}>
        {shown.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Captain</th>
                  <th>Activity</th>
                  <th>Last active</th>
                  <th>Rides (15 days)</th>
                  <th>Days worked (of 15)</th>
                  <th>Vehicle</th>
                  <th>City</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.id} style={{ boxShadow: `inset 3px 0 0 ${ACTIVITY[row.activity].color}` }}>
                    <td>
                      <Link href={`/captains/${row.id}`} className="font-semibold text-gold hover:underline">
                        {row.name}
                      </Link>
                      <p className="text-[11px] muted">
                        {row.code} · {row.phone} · ★ {row.rating.toFixed(2)}
                      </p>
                    </td>
                    <td>
                      <span className="flex items-center gap-2 text-[12px] font-medium" style={{ color: ACTIVITY[row.activity].color }}>
                        <Dot activity={row.activity} /> {ACTIVITY[row.activity].label}
                      </span>
                      {row.onRide ? <span className="text-[10px] text-sky">On a ride</span> : row.onDuty ? <span className="text-[10px] text-success">On duty now</span> : null}
                    </td>
                    <td className="muted">{row.lastActive ? ago(row.lastActive) : "Never"}</td>
                    <td className="tabular-nums">{num(row.rides15)}</td>
                    <td className="tabular-nums">{row.activeDays15}</td>
                    <td>
                      {row.vehicleModel}
                      <span className="block text-[11px] muted">{row.vehicleNo}</span>
                    </td>
                    <td>{row.city || "—"}</td>
                    <td className="muted">{dateOnly(row.joinedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <Empty text={data.captains.length ? "No captain matches." : `No ${data.name} captains have registered yet.`} />
          </div>
        )}
      </Panel>
    </>
  );
}
