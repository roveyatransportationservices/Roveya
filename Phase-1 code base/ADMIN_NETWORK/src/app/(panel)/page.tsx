"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, Download, Info } from "lucide-react";
import { Bars, CHART, Donut, LineChart, Progress } from "@/components/charts";
import { PageHead } from "@/components/Shell";
import { ServiceCards, type ServiceSummary } from "@/components/services";
import { Avatar, Badge, Empty, Failure, Panel, Row } from "@/components/ui";
import { useData } from "@/lib/client";
import { downloadCsv, num, pct, route, rs, shortDay, when } from "@/lib/format";

type Totals = Record<"bookings" | "seats" | "cancellations" | "collected_paise" | "fare_paise" | "gst_paise" | "secure_paise" | "discount_paise" | "refund_paise" | "commission_paise" | "captain_share_paise" | "kept_on_cancel_paise" | "profit_paise", number>;
type Dashboard = {
  days: number;
  services: ServiceSummary[];
  totals: Totals;
  previous: Totals;
  todayTotals: Totals & { day: string };
  series: (Totals & { day: string })[];
  hours: number[];
  fill: { seatsTotal: number; seatsBooked: number; rate: number; trips: number };
  counts: { captainsActive: number; captainsReview: number; carsReview: number; travellers: number; tripsUpcoming: number; tripsLive: number; openSos: number; openTickets: number; payoutsPending: number; payoutsPendingPaise: number };
  topCaptains: { id: string; name: string; code: string; trips: number; fare: number; profit: number }[];
  payMix: Record<string, number>;
  wallets: { rider: number; captain: number; platform: number };
  recent: { id: string; pnr: string; status: string; trip_code: string; from_city: string; to_city: string; seats: number; paid_paise: number; created_at: string; rider: { name: string } | null }[];
  upcoming: { id: string; code: string; from_city: string; to_city: string; depart_at: string; captain_name: string; make_model: string; seats_total: number; seats_booked: number; fare_paise: number }[];
};

const change = (now: number, before: number) => (before ? (now - before) / Math.abs(before) : now ? 1 : 0);

export default function DashboardPage() {
  const [days, setDays] = useState(7);
  const { data, error, loading, reload } = useData<Dashboard>(`/dashboard?days=${days}`, 60000);

  const actions = (
    <>
      <label className="btn cursor-pointer">
        <CalendarDays size={14} className="text-gold" />
        <select value={days} onChange={(event) => setDays(Number(event.target.value))} className="cursor-pointer bg-transparent outline-none">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </label>
      <button type="button" className="btn" disabled={!data} onClick={() => data && downloadCsv(`roveya-daily-${days}d`, data.series.map((row) => ({ day: row.day, bookings: row.bookings, seats: row.seats, collected: row.collected_paise / 100, fares: row.fare_paise / 100, gst: row.gst_paise / 100, commission: row.commission_paise / 100, refunds: row.refund_paise / 100, discounts: row.discount_paise / 100, profit: row.profit_paise / 100 })))}>
        <Download size={14} /> Export
      </button>
      <Link href="/finance" className="btn">
        <Info size={14} /> Info
      </Link>
    </>
  );

  if (error) {
    return (
      <>
        <PageHead title="Dashboard" actions={actions} />
        <Failure text={error} retry={reload} />
      </>
    );
  }
  if (loading || !data) {
    return (
      <>
        <PageHead title="Dashboard" actions={actions} />
        <div className="grid gap-5 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((at) => (
            <div key={at} className="skeleton h-56" />
          ))}
        </div>
      </>
    );
  }

  const { totals, previous, series, counts, fill } = data;
  const labels = series.map((row) => shortDay(row.day));
  const profitChange = change(totals.profit_paise, previous.profit_paise);
  const collectedChange = change(totals.collected_paise, previous.collected_paise);
  const average = (key: keyof Totals) => (series.length ? series.reduce((sum, row) => sum + row[key], 0) / series.length : 0);
  const peak = (key: keyof Totals) => Math.max(0, ...series.map((row) => row[key]));
  const mixTotal = Object.values(data.payMix).reduce((sum, value) => sum + value, 0);
  const waiting = data.services.reduce((sum, item) => sum + item.captains.waiting, 0);

  return (
    <>
      <PageHead title="Dashboard" actions={actions} />

      <div className="grid gap-5 lg:grid-cols-12 [&>*]:min-w-0">
        <ServiceCards services={data.services} days={data.days} />

        <Panel title="Carpool seat fill rate" className="lg:col-span-5">
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <Donut value={fill.rate} label="Booked" color={CHART.lilac} />
            <ul className="w-full space-y-2.5 text-[13px]">
              {[
                ["Seats sold", fill.seatsBooked, fill.seatsTotal],
                ["Seats open", fill.seatsTotal - fill.seatsBooked, fill.seatsTotal],
                ["Bookings", totals.bookings, totals.bookings + totals.cancellations],
                ["Cancellations", totals.cancellations, totals.bookings + totals.cancellations],
                ["Trips", fill.trips, fill.trips],
              ].map(([name, value, of]) => (
                <li key={name as string} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky" />
                  <span className="flex-1 text-cream/80">
                    {name}({num(value as number)})
                  </span>
                  <span className="tabular-nums muted">{num(value as number)}({(of as number) ? Math.round(((value as number) / (of as number)) * 100) : 0}%)</span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <Panel title="Carpool bookings today" className="lg:col-span-3">
          <div className="mb-2 flex gap-4 text-[11px]">
            <span className="text-rose">Bookings</span>
            <span className="text-amber">{num(data.hours.reduce((sum, value) => sum + value, 0))} today</span>
          </div>
          <LineChart series={[{ name: "Bookings", values: data.hours, color: CHART.rose, fill: true }]} labels={data.hours.map((_, hour) => `${hour % 12 || 12}${hour < 12 ? "a" : "p"}`)} height={150} grid={false} />
        </Panel>

        <Panel title="Platform stats" className="lg:col-span-4">
          <Row label="Active Vado (captains), all services" value={num(data.services.reduce((sum, item) => sum + item.captains.active, 0))} />
          <Row label="Vado waiting for approval" value={<span className={waiting ? "text-amber" : ""}>{num(waiting)}</span>} />
          <Row label="Passengers signed up" value={num(counts.travellers)} />
          <Row label="Rides in progress · carpool trips live" value={`${num(data.services.filter((item) => item.key !== "carpool").reduce((sum, item) => sum + item.period.inProgress, 0))} · ${num(counts.tripsLive)}`} />
          <Row label="Upcoming carpool trips" value={num(counts.tripsUpcoming)} />
          <Row label="Open SOS · open tickets" value={<span className={counts.openSos ? "text-danger" : ""}>{`${counts.openSos} · ${counts.openTickets}`}</span>} />
          <div className="mt-3">
            <Progress value={fill.rate} color={CHART.green} />
          </div>
        </Panel>

        <Panel title="Top carpool captains" className="lg:col-span-3">
          <div className="flex justify-between pb-2 text-[11px] muted">
            <span>Captain</span>
            <span>This period</span>
          </div>
          {data.topCaptains.length ? (
            <ul className="space-y-2.5">
              {data.topCaptains.map((captain) => (
                <li key={captain.id} className="flex items-center justify-between gap-2 text-[13px]">
                  <Link href={`/captains/${captain.id}`} className="truncate text-sky hover:underline">
                    {captain.name}
                  </Link>
                  <span className="tabular-nums">{rs(captain.fare, { compact: true })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="No trips in this period." />
          )}
        </Panel>

        <Panel title="Carpool revenue" className="lg:col-span-6" action={<Link href="/finance" className="btn px-2.5 py-1 text-[11px]">Finance</Link>}>
          <div className="mb-4 grid grid-cols-3 gap-4">
            {[
              ["Collected", totals.collected_paise, "text-rose"],
              ["Commission", totals.commission_paise, "text-sky"],
              ["Net profit", totals.profit_paise, "text-amber"],
            ].map(([name, value, tone]) => (
              <div key={name as string}>
                <p className="text-[11px] muted">{name}</p>
                <p className={`text-xl font-bold tabular-nums ${tone}`}>{rs(value as number, { compact: true })}</p>
              </div>
            ))}
          </div>
          <LineChart
            series={[
              { name: "Collected", values: series.map((row) => row.collected_paise / 100), color: CHART.rose },
              { name: "Commission", values: series.map((row) => row.commission_paise / 100), color: CHART.lilac },
              { name: "Profit", values: series.map((row) => row.profit_paise / 100), color: CHART.amber },
            ]}
            labels={labels}
            height={200}
            format={(value) => `₹${Math.round(value).toLocaleString("en-IN")}`}
          />
        </Panel>

        <Panel title="Carpool profit" className="lg:col-span-3">
          <p className="text-xs text-sky">Net profit</p>
          <p className="text-2xl font-bold tabular-nums">{rs(totals.profit_paise)}</p>
          <p className={`text-[11px] font-semibold ${profitChange >= 0 ? "text-success" : "text-danger"}`}>{`${profitChange >= 0 ? "▲" : "▼"} ${pct(Math.abs(profitChange), 1)} vs previous ${data.days} days`}</p>
          <div className="my-4 border-t border-line" />
          <p className="text-xs text-sky">GST payable</p>
          <p className="text-2xl font-bold tabular-nums">{rs(totals.gst_paise)}</p>
          <p className="text-[11px] muted">Captain share {rs(totals.captain_share_paise, { compact: true })}</p>
          <div className="mt-4">
            <Bars values={series.map((row) => Math.max(0, row.profit_paise))} color={CHART.sky} height={90} highlight={CHART.gold} />
          </div>
        </Panel>

        <Panel title="Carpool bookings analytics" className="lg:col-span-12" action={<div className="flex gap-1.5">{[7, 30, 90].map((value) => <button key={value} type="button" onClick={() => setDays(value)} className={`btn px-2.5 py-1 text-[11px] ${days === value ? "border-gold text-gold" : ""}`}>{value === 7 ? "WEEK" : value === 30 ? "MONTH" : "QUARTER"}</button>)}</div>}>
          <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
            <div className="rounded-md bg-night/60 p-3">
              <LineChart
                series={[
                  { name: "Collected", values: series.map((row) => row.collected_paise / 100), color: CHART.lilac, fill: true },
                  { name: "Refunds", values: series.map((row) => row.refund_paise / 100), color: CHART.green, fill: true },
                ]}
                labels={labels}
                height={240}
                format={(value) => `₹${Math.round(value).toLocaleString("en-IN")}`}
              />
            </div>
            <div className="text-[13px]">
              <p className="mb-1 text-xs font-semibold text-success">Inbound</p>
              <Row label="Today" value={rs(data.todayTotals.collected_paise)} />
              <Row label="Average a day" value={rs(average("collected_paise"))} />
              <Row label="Best day" value={rs(peak("collected_paise"))} />
              <Row label={`Change vs previous`} value={<span className={collectedChange >= 0 ? "text-success" : "text-danger"}>{pct(collectedChange, 1)}</span>} />
              <p className="mb-1 mt-4 text-xs font-semibold text-success">Outbound</p>
              <Row label="Refunds" value={rs(totals.refund_paise)} />
              <Row label="Coupon discounts" value={rs(totals.discount_paise)} />
              <Row label="Captain share" value={rs(totals.captain_share_paise)} />
              <Row label={`Payouts waiting (${counts.payoutsPending})`} value={rs(counts.payoutsPendingPaise)} />
            </div>
          </div>
        </Panel>

        <Panel title="Carpool money trend" className="lg:col-span-4">
          <div className="space-y-4 text-[11px]">
            {[
              ["Seat fill", fill.rate, CHART.sky],
              ["Paid online", mixTotal ? (data.payMix.Online ?? 0) / mixTotal : 0, CHART.green],
              ["Paid with ROVEYA Cash", mixTotal ? (data.payMix["ROVEYA Cash"] ?? 0) / mixTotal : 0, CHART.amber],
              ["Profit margin", totals.collected_paise ? totals.profit_paise / totals.collected_paise : 0, CHART.rose],
            ].map(([name, value, color]) => (
              <div key={name as string}>
                <div className="mb-1.5 flex justify-between">
                  <span className="text-cream/80">{name}</span>
                  <span className="tabular-nums muted">{pct(value as number, 1)}</span>
                </div>
                <Progress value={value as number} color={color as string} />
              </div>
            ))}
          </div>
          <div className="mt-5">
            <LineChart series={[{ name: "Profit", values: series.map((row) => row.profit_paise / 100), color: CHART.rose, fill: true }]} labels={labels} height={130} grid={false} format={(value) => `₹${Math.round(value).toLocaleString("en-IN")}`} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[11px]">
            <div>
              <p className="muted">Travellers&apos; ROVEYA Cash</p>
              <p className="text-sm font-semibold">{rs(data.wallets.rider)}</p>
            </div>
            <div>
              <p className="muted">Captain wallets</p>
              <p className="text-sm font-semibold">{rs(data.wallets.captain)}</p>
            </div>
          </div>
        </Panel>

        <Panel title="Upcoming carpool trips" className="lg:col-span-8" action={<Link href="/trips" className="btn px-2.5 py-1 text-[11px]">All trips</Link>}>
          {data.upcoming.length ? (
            <div className="-mx-5 overflow-x-auto">
              <table className="table">
                <tbody>
                  {data.upcoming.map((trip) => (
                    <tr key={trip.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={trip.captain_name} />
                          <div>
                            <p className="text-[11px] muted">{trip.code}</p>
                            <p className="font-medium">{route(trip.from_city, trip.to_city)}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <p className="text-[11px] muted">Fares</p>
                        <p className="font-medium tabular-nums">{rs(trip.fare_paise)}</p>
                      </td>
                      <td>
                        <p className="text-[11px] muted">Filled</p>
                        <p className="font-semibold text-success">{trip.seats_total ? Math.round((trip.seats_booked / trip.seats_total) * 100) : 0}%</p>
                      </td>
                      <td>
                        <p className="text-[11px] muted">Departs</p>
                        <p className="font-medium">{when(trip.depart_at)}</p>
                      </td>
                      <td className="text-right">
                        <Link href={`/trips/${trip.id}`} className="btn px-3 py-1.5 text-[11px]">
                          manage
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty text="No upcoming trips published." />
          )}
        </Panel>

        <Panel title="Latest carpool bookings" className="lg:col-span-12" action={<Link href="/bookings/carpool" className="btn px-2.5 py-1 text-[11px]">All bookings</Link>} pad={false}>
          {data.recent.length ? (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>PNR</th>
                    <th>Traveller</th>
                    <th>Route</th>
                    <th>Seats</th>
                    <th>Paid</th>
                    <th>Status</th>
                    <th>Booked</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Link href={`/bookings/carpool/${row.id}`} className="font-medium text-gold hover:underline">
                          {row.pnr}
                        </Link>
                      </td>
                      <td>{row.rider?.name ?? "—"}</td>
                      <td>
                        {route(row.from_city, row.to_city)} <span className="muted">· {row.trip_code}</span>
                      </td>
                      <td>{row.seats}</td>
                      <td className="tabular-nums">{rs(row.paid_paise)}</td>
                      <td>
                        <Badge value={row.status} />
                      </td>
                      <td className="muted">{when(row.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5">
              <Empty text="No bookings yet." />
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
