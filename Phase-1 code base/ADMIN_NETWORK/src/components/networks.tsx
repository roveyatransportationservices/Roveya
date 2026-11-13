"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Progress } from "@/components/charts";
import { Badge, Empty, Panel } from "@/components/ui";
import { city, dateOnly, num, pct, shortDay, when } from "@/lib/format";

export type Plan = { status: string; target_captains: number | null; launch_date: string | null; owner_id: string | null; owner: string | null; note: string | null; updated_at: string };
export type NetworkCity = { id: string; name: string; state: string; since: string | null; status: string; plan: Plan | null; routes: number; vehicles: number; captainsBased: number; vado: number; departures: number; arrivals: number; tripsPerDay: number; seatsFrom: number; seatsTo: number; fill: number; upcoming: number; profitPaise: number; searches: number; unmet: number };
export type NetworkRoute = { from: string; to: string; since: string; trips: number; tripsPerDay: number; vehicles: number; vado: number; seatsBooked: number; seatsTotal: number; fill: number; upcoming: number; nextAt: string | null; lastAt: string | null; searches: number; unmet: number };
export type DemandGap = { from: string; to: string; searches: number; searchers: number; unmet: number; unmetSearchers: number; trips: number; lastAt: string; wantedDates: { date: string; searchers: number }[] };

export const count = (value: number, one: string, many = `${one}s`) => `${value.toLocaleString("en-IN")} ${value === 1 ? one : many}`;

// Trips a day, readable even when a route runs only a few times a month.
export const perDay = (value: number) => (value === 0 ? "0" : value < 0.1 ? "<0.1" : value.toFixed(1));

export const PERIODS: [string, string][] = [
  ["7", "7 days"],
  ["30", "30 days"],
  ["90", "90 days"],
];

export const STATUS_TEXT: Record<string, string> = {
  running: "Running",
  quiet: "Quiet",
  new: "New",
  planned: "Planned",
  launching: "Launching",
  live: "Live",
  paused: "Paused",
};

export function CityStatus({ city: row }: { city: Pick<NetworkCity, "status" | "plan"> }) {
  return (
    <Badge value={row.status}>
      {STATUS_TEXT[row.status] ?? row.status}
      {row.plan ? "" : " · auto"}
    </Badge>
  );
}

const Pair = ({ from, to }: { from: string; to: string }) => (
  <span className="flex items-center gap-1.5 font-medium">
    <Link href={`/networks/${from}`} className="hover:text-gold">
      {city(from)}
    </Link>
    <ArrowRight size={12} className="muted" />
    <Link href={`/networks/${to}`} className="hover:text-gold">
      {city(to)}
    </Link>
  </span>
);

export function RouteTable({ routes, days, title = "Routes" }: { routes: NetworkRoute[]; days: number; title?: string }) {
  return (
    <Panel title={title} pad={false}>
      {routes.length ? (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Route</th>
                <th>Trips ({days} days)</th>
                <th>Vehicles</th>
                <th>Riders</th>
                <th className="w-32">Seats booked</th>
                <th>Searchers</th>
                <th>Next trip</th>
                <th>Last trip</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((row) => (
                <tr key={`${row.from}-${row.to}`}>
                  <td>
                    <Pair from={row.from} to={row.to} />
                    <p className="text-[10px] muted">since {dateOnly(row.since)}</p>
                  </td>
                  <td className="tabular-nums">
                    {num(row.trips)}
                    <span className="block text-[10px] muted">{perDay(row.tripsPerDay)} a day</span>
                  </td>
                  <td className="tabular-nums">{num(row.vehicles)}</td>
                  <td className="tabular-nums">{num(row.vado)}</td>
                  <td>
                    <p className="mb-1 text-[11px]">
                      {row.seatsBooked}/{row.seatsTotal} · {pct(row.fill)}
                    </p>
                    <Progress value={row.fill} color="#6FCF97" />
                  </td>
                  <td className="tabular-nums">
                    {num(row.searches)}
                    {row.unmet ? <span className="block text-[10px] text-rose">{row.unmet} found no trip</span> : null}
                  </td>
                  <td className="muted">
                    {when(row.nextAt)}
                    {row.upcoming > 1 ? <span className="block text-[10px]">+{row.upcoming - 1} more</span> : null}
                  </td>
                  <td className="muted">{when(row.lastAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-5">
          <Empty text="No routes yet." />
        </div>
      )}
    </Panel>
  );
}

// Searches with no trip on offer, worst first.
export function DemandTable({ gaps, days, title = "Demand gaps" }: { gaps: DemandGap[]; days: number; title?: string }) {
  return (
    <Panel title={title} action={<span className="text-[11px] muted">Passenger seat searches in the last {days} days</span>} pad={false}>
      {gaps.length ? (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Searched route</th>
                <th>Searchers</th>
                <th>Found no trip</th>
                <th>Trips run</th>
                <th>Dates wanted</th>
                <th>Last search</th>
              </tr>
            </thead>
            <tbody>
              {gaps.map((row) => (
                <tr key={`${row.from}-${row.to}`}>
                  <td>
                    <Pair from={row.from} to={row.to} />
                  </td>
                  <td className="tabular-nums">
                    {num(row.searchers)}
                    <span className="block text-[10px] muted">{count(row.searches, "search", "searches")}</span>
                  </td>
                  <td className={`tabular-nums ${row.unmetSearchers ? "font-semibold text-rose" : "muted"}`}>
                    {num(row.unmetSearchers)}
                    {row.searchers ? <span className="block text-[10px] font-normal muted">{pct(row.unmetSearchers / row.searchers)} of searchers</span> : null}
                  </td>
                  <td className="tabular-nums">{num(row.trips)}</td>
                  <td className="text-[12px]">{row.wantedDates.length ? row.wantedDates.map((item) => `${shortDay(item.date)} (${item.searchers})`).join(", ") : <span className="muted">—</span>}</td>
                  <td className="muted">{when(row.lastAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-5">
          <Empty text="No passenger searches recorded in this period yet. Searches from the app and website show up here." />
        </div>
      )}
    </Panel>
  );
}
