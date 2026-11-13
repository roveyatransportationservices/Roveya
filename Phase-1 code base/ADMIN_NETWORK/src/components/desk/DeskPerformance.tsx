"use client";

import { useState } from "react";
import { CHART, LineChart, Progress } from "@/components/charts";
import { Chips } from "@/components/list";
import { PageHead } from "@/components/Shell";
import { Empty, Failure, Loading, Panel, Stat } from "@/components/ui";
import { useData } from "@/lib/client";
import { ago, num, shortDay } from "@/lib/format";
import type { ServiceKey } from "@/lib/services";
import { TIMER_COLOR } from "./Timer";

type Person = {
  id: string;
  name: string;
  email: string;
  role: string;
  desk: boolean;
  active: boolean;
  lastLoginAt: string | null;
  vadoApproved: number;
  vadoDeclined: number;
  avgMinutes: number | null;
  withinTime: number;
  docsChecked: number;
  fixesAsked: number;
  byService: Record<ServiceKey, number>;
  ticketsReplied: number;
  ticketsResolved: number;
  firstReplyMinutes: number | null;
  resolveMinutes: number | null;
  calls: number;
  supportRating: number | null;
  supportRatings: number;
  actions: number;
};
type Data = {
  days: number;
  minutes: number;
  scope: "team" | "me";
  totals: { vadoApproved: number; avgMinutes: number | null; withinTime: number; waitingNow: number; overdueNow: number; ticketsOpened: number; ticketsOpenNow: number; firstReplyMinutes: number | null; resolveMinutes: number | null; calls: number; supportRating: number | null; supportRatings: number };
  byService: { key: ServiceKey; name: string; approved: number; avgMinutes: number | null; withinTime: number; waitingNow: number }[];
  series: { labels: string[]; approved: number[]; avgMinutes: number[] };
  people: Person[];
};

const mins = (value: number | null) => (value === null ? "—" : value >= 120 ? `${Math.round(value / 60)} h` : `${value} min`);
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

export function DeskPerformance() {
  const [days, setDays] = useState("7");
  const { data, error, loading, reload } = useData<Data>(`/desk/performance?days=${days}`, 60000);
  if (error) return <Failure text={error} retry={reload} />;
  const t = data?.totals;
  return (
    <>
      <PageHead title={data?.scope === "me" ? "My performance" : "Support desk performance"} sub="Vado verification against the clock, support tickets and calls, from the audit log." />
      <div className="mb-4">
        <Chips
          value={days}
          onChange={setDays}
          options={[
            ["1", "Today"],
            ["7", "7 days"],
            ["30", "30 days"],
            ["90", "90 days"],
          ]}
        />
      </div>
      {loading || !data || !t ? (
        <Loading rows={8} />
      ) : (
        <>
          <Panel title="Vado verification" className="mb-5">
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-6">
              <Stat label="Vado approved" value={num(t.vadoApproved)} tone="text-success" />
              <Stat label="Average time" value={mins(t.avgMinutes)} sub="from registering to approved" />
              <Stat label={`Within ${data.minutes} min`} value={t.vadoApproved ? `${pct(t.withinTime, t.vadoApproved)}%` : "—"} sub={`${num(t.withinTime)} of ${num(t.vadoApproved)}`} tone={!t.vadoApproved ? "text-cream" : pct(t.withinTime, t.vadoApproved) >= 90 ? "text-success" : pct(t.withinTime, t.vadoApproved) >= 60 ? "text-amber" : "text-danger"} />
              <Stat label="Waiting now" value={num(t.waitingNow)} />
              <Stat label="Overdue now" value={num(t.overdueNow)} tone={t.overdueNow ? "text-danger" : "text-cream"} />
              <Stat label="Calls made" value={num(t.calls)} />
            </div>
          </Panel>

          <Panel title="Support tickets" className="mb-5">
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-5">
              <Stat label="Support rating" value={t.supportRating === null ? "—" : `${t.supportRating} ★`} sub={`from ${num(t.supportRatings)} rated requests`} tone={t.supportRating === null ? "text-cream" : t.supportRating >= 4 ? "text-success" : t.supportRating >= 3 ? "text-amber" : "text-danger"} />
              <Stat label="Tickets raised" value={num(t.ticketsOpened)} />
              <Stat label="Open now" value={num(t.ticketsOpenNow)} tone={t.ticketsOpenNow ? "text-amber" : "text-cream"} />
              <Stat label="First reply" value={mins(t.firstReplyMinutes)} sub="on average" />
              <Stat label="Resolved in" value={mins(t.resolveMinutes)} sub="on average" />
            </div>
          </Panel>

          <div className="mb-5 grid gap-5 xl:grid-cols-3 [&>*]:min-w-0">
            <Panel title="Day by day" className="xl:col-span-2">
              <LineChart
                labels={data.series.labels.map(shortDay)}
                series={[
                  { name: "Vado approved", values: data.series.approved, color: CHART.green, fill: true },
                  { name: "Average minutes", values: data.series.avgMinutes, color: CHART.amber },
                ]}
              />
            </Panel>
            <Panel title="By service" pad={false}>
              <ul className="divide-y divide-line">
                {data.byService.map((row) => (
                  <li key={row.key} className="px-5 py-3 text-[13px]">
                    <p className="flex justify-between">
                      <span className="font-medium">{row.name}</span>
                      <span className="tabular-nums">{num(row.approved)} approved</span>
                    </p>
                    <p className="text-[11px] muted">
                      Average {mins(row.avgMinutes)} · {pct(row.withinTime, row.approved)}% on time · {row.waitingNow} waiting now
                    </p>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <Panel title={data.scope === "me" ? "Your numbers" : "Each person"} pad={false}>
            {data.people.length ? (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Person</th>
                      <th>Vado approved</th>
                      <th>Average time</th>
                      <th className="w-36">On time</th>
                      <th>Documents checked</th>
                      <th>By service</th>
                      <th>Tickets</th>
                      <th>First reply</th>
                      <th>Resolved in</th>
                      <th>Support rating</th>
                      <th>Calls</th>
                      <th>Last login</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.people.map((row) => {
                      const onTime = pct(row.withinTime, row.vadoApproved);
                      return (
                        <tr key={row.id}>
                          <td>
                            <p className="font-semibold">{row.name}</p>
                            <p className="text-[11px] muted">
                              {row.role}
                              {!row.active ? " · switched off" : ""}
                            </p>
                          </td>
                          <td className="tabular-nums">
                            {num(row.vadoApproved)}
                            {row.vadoDeclined ? <span className="block text-[11px] text-danger">{row.vadoDeclined} declined</span> : null}
                          </td>
                          <td className="tabular-nums" style={{ color: row.avgMinutes === null ? undefined : row.avgMinutes <= data.minutes ? TIMER_COLOR.green : TIMER_COLOR.red }}>
                            {mins(row.avgMinutes)}
                          </td>
                          <td>
                            {row.vadoApproved ? (
                              <>
                                <p className="mb-1 text-[11px]">{onTime}%</p>
                                <Progress value={onTime / 100} color={onTime >= 90 ? CHART.green : onTime >= 70 ? CHART.amber : "#E5484D"} />
                              </>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td className="tabular-nums">
                            {num(row.docsChecked)}
                            {row.fixesAsked ? <span className="block text-[11px] text-amber">{row.fixesAsked} new photos asked</span> : null}
                          </td>
                          <td className="text-[11px]">
                            Bike {row.byService.bike} · Auto {row.byService.auto} · Taxi {row.byService.taxi} · Carpool {row.byService.carpool}
                          </td>
                          <td className="tabular-nums">
                            {num(row.ticketsReplied)} answered
                            <span className="block text-[11px] muted">{num(row.ticketsResolved)} resolved</span>
                          </td>
                          <td className="tabular-nums">{mins(row.firstReplyMinutes)}</td>
                          <td className="tabular-nums">{mins(row.resolveMinutes)}</td>
                          <td className="tabular-nums">
                            {row.supportRating === null ? <span className="muted">—</span> : <span className={row.supportRating >= 4 ? "text-success" : row.supportRating >= 3 ? "text-amber" : "text-danger"}>{row.supportRating} ★</span>}
                            {row.supportRatings ? <span className="block text-[11px] muted">{num(row.supportRatings)} ratings</span> : null}
                          </td>
                          <td className="tabular-nums">{num(row.calls)}</td>
                          <td className="muted">{row.lastLoginAt ? ago(row.lastLoginAt) : "Never"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-5">
                <Empty text="No support desk work in this period yet." />
              </div>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
