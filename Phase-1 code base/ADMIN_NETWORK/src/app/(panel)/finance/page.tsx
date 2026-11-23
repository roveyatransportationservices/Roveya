"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { CHART, LineChart } from "@/components/charts";
import { PageHead } from "@/components/Shell";
import { ServiceMoney, type ServiceSummary } from "@/components/services";
import { Badge, Empty, Failure, Loading, Panel, Row } from "@/components/ui";
import { qs, useData } from "@/lib/client";
import { downloadCsv, num, pct, route, rs, shortDay, when } from "@/lib/format";

type Totals = Record<"bookings" | "seats" | "cancellations" | "collected_paise" | "fare_paise" | "gst_paise" | "secure_paise" | "discount_paise" | "refund_paise" | "commission_paise" | "captain_share_paise" | "kept_on_cancel_paise" | "profit_paise", number>;
type Finance = {
  from: string;
  to: string;
  commissionPct: number;
  services: ServiceSummary[];
  totals: Totals;
  margin: number;
  series: (Totals & { day: string })[];
  routes: { from_city: string; to_city: string; trips: number; completed_trips: number; seats_offered: number; seats_sold: number; bookings: number; fare_paise: number; avg_base_fare_paise: number; commission_paise: number; profit_paise: number }[];
  trips: { id: string; code: string; status: string; from_city: string; to_city: string; depart_at: string; captain_name: string; make_model: string; seats_total: number; seats_booked: number; fare_paise: number; collected_paise: number; commission_paise: number; captain_share_paise: number; captain_paid_paise: number; profit_paise: number }[];
  coupons: { id: string; code: string; title: string; uses: number; discount: number }[];
  captainLedger: { earned: number; paidOut: number };
};

const ist = (offset = 0) => {
  const at = new Date(Date.now() + 330 * 60000);
  at.setUTCDate(at.getUTCDate() + offset);
  return at.toISOString().slice(0, 10);
};

const PRESETS = [
  { label: "Today", from: () => ist(), to: () => ist() },
  { label: "7 days", from: () => ist(-6), to: () => ist() },
  { label: "30 days", from: () => ist(-29), to: () => ist() },
  { label: "This month", from: () => `${ist().slice(0, 8)}01`, to: () => ist() },
  { label: "90 days", from: () => ist(-89), to: () => ist() },
];

export default function FinancePage() {
  const [range, setRange] = useState({ from: ist(-29), to: ist() });
  const { data, error, loading, reload } = useData<Finance>(`/finance${qs(range)}`);
  const labels = useMemo(() => (data?.series ?? []).map((row) => shortDay(row.day)), [data]);

  const actions = (
    <>
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((preset) => {
          const on = range.from === preset.from() && range.to === preset.to();
          return (
            <button key={preset.label} type="button" onClick={() => setRange({ from: preset.from(), to: preset.to() })} className={`btn px-2.5 py-1.5 text-[11px] ${on ? "border-gold text-gold" : ""}`}>
              {preset.label}
            </button>
          );
        })}
      </div>
      <input type="date" className="input w-auto py-1.5" value={range.from} max={range.to} onChange={(event) => event.target.value && setRange({ ...range, from: event.target.value })} aria-label="From" />
      <input type="date" className="input w-auto py-1.5" value={range.to} min={range.from} onChange={(event) => event.target.value && setRange({ ...range, to: event.target.value })} aria-label="To" />
      <button type="button" className="btn" disabled={!data} onClick={() => data && downloadCsv(`roveya-trips-${range.from}-${range.to}`, data.trips.map((trip) => ({ trip: trip.code, route: route(trip.from_city, trip.to_city), departs: trip.depart_at, captain: trip.captain_name, seats: `${trip.seats_booked}/${trip.seats_total}`, fares: trip.fare_paise / 100, collected: trip.collected_paise / 100, commission: trip.commission_paise / 100, captain_share: trip.captain_share_paise / 100, profit: trip.profit_paise / 100, status: trip.status })))}>
        <Download size={14} /> Export
      </button>
    </>
  );

  if (error) {
    return (
      <>
        <PageHead title="Fares & profit" actions={actions} />
        <Failure text={error} retry={reload} />
      </>
    );
  }
  if (loading || !data) {
    return (
      <>
        <PageHead title="Fares & profit" actions={actions} />
        <Loading rows={8} />
      </>
    );
  }

  const t = data.totals;
  const tiles: [string, number, string, string?][] = [
    ["Collected from travellers", t.collected_paise, "text-cream", `${num(t.bookings)} bookings · ${num(t.seats)} seats`],
    ["Seat fares", t.fare_paise, "text-cream", "Before GST and add-ons"],
    [`Booking fees (${data.commissionPct}%)`, t.commission_paise, "text-sky", "Paid by passengers. Captains keep the seat fare."],
    ["Secure your trip fees", t.secure_paise, "text-sky", "₹19 a seat when chosen"],
    ["Kept on cancellations", t.kept_on_cancel_paise, "text-sky", `${num(t.cancellations)} cancellations`],
    ["Coupon discounts", -t.discount_paise, "text-amber", "Paid for by ROVEYA"],
    ["Refunds", t.refund_paise, "text-amber", "Wallet credits and gateway refunds"],
    ["GST payable", t.gst_paise, "text-rose", "18% of the booking fee, owed to the government"],
    ["Captain share", t.captain_share_paise, "text-cream", "Paid into captain wallets on trip completion"],
  ];

  return (
    <>
      <PageHead title="Fares & profit" sub={`${shortDay(data.from)} to ${shortDay(data.to)} · every ROVEYA service, then Carpool Travels in detail`} actions={actions} />

      <ServiceMoney services={data.services} />

      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gold">ROVEYA Carpool Travels · seat bookings</p>
      <div className="grid gap-5 lg:grid-cols-12">
        <Panel className="lg:col-span-4" title="Net profit">
          <p className="text-4xl font-bold tabular-nums text-gold">{rs(t.profit_paise)}</p>
          <p className="mt-1 text-xs muted">Margin {pct(data.margin, 1)} of money collected</p>
          <div className="mt-5 space-y-0.5 border-t border-line pt-4">
            <Row label="Booking fee" value={`+ ${rs(t.commission_paise)}`} tone="text-success" />
            <Row label="Secure your trip fees" value={`+ ${rs(t.secure_paise)}`} tone="text-success" />
            <Row label="Kept on cancellations" value={`+ ${rs(t.kept_on_cancel_paise)}`} tone="text-success" />
            <Row label="Coupon discounts" value={`− ${rs(t.discount_paise)}`} tone="text-danger" />
            <div className="my-2 border-t border-line" />
            <Row label="Net profit" value={rs(t.profit_paise)} tone="font-semibold text-gold" />
          </div>
          <p className="mt-4 text-[11px] leading-5 muted">GST on the booking fee is collected for the government and is not counted as profit. The booking fee uses the current {data.commissionPct}% rate, with the minimum and maximum set in Settings. Completed trips match the captain wallet ledger.</p>
        </Panel>

        <div className="grid gap-5 sm:grid-cols-3 lg:col-span-8">
          {tiles.map(([name, value, tone, sub]) => (
            <div key={name} className="panel p-4">
              <p className="text-[11px] muted">{name}</p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>{rs(value)}</p>
              {sub ? <p className="mt-0.5 text-[10px] muted">{sub}</p> : null}
            </div>
          ))}
        </div>

        <Panel className="lg:col-span-12" title="Money by day">
          {data.series.length ? (
            <LineChart
              series={[
                { name: "Collected", values: data.series.map((row) => row.collected_paise / 100), color: CHART.lilac, fill: true },
                { name: "Captain share", values: data.series.map((row) => row.captain_share_paise / 100), color: CHART.sky },
                { name: "Net profit", values: data.series.map((row) => row.profit_paise / 100), color: CHART.gold },
                { name: "Refunds", values: data.series.map((row) => row.refund_paise / 100), color: CHART.green },
              ]}
              labels={labels}
              height={220}
              format={(value) => `₹${Math.round(value).toLocaleString("en-IN")}`}
            />
          ) : (
            <Empty text="No confirmed bookings in this range." />
          )}
        </Panel>

        <Panel className="lg:col-span-8" title="Fares and earnings by route" pad={false}>
          {data.routes.length ? (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Route</th>
                    <th>Trips</th>
                    <th>Seats sold</th>
                    <th>Avg base fare</th>
                    <th>Seat fares</th>
                    <th>Commission</th>
                    <th>Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.routes.map((row) => (
                    <tr key={`${row.from_city}-${row.to_city}`}>
                      <td className="font-medium">{route(row.from_city, row.to_city)}</td>
                      <td>
                        {num(row.trips)} <span className="muted">({row.completed_trips} done)</span>
                      </td>
                      <td>
                        {num(row.seats_sold)}/{num(row.seats_offered)}
                      </td>
                      <td className="tabular-nums">{rs(row.avg_base_fare_paise)}</td>
                      <td className="tabular-nums">{rs(row.fare_paise)}</td>
                      <td className="tabular-nums text-sky">{rs(row.commission_paise)}</td>
                      <td className="tabular-nums text-gold">{rs(row.profit_paise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5">
              <Empty text="No trips yet." />
            </div>
          )}
          <p className="px-5 py-3 text-[11px] muted">All-time totals per route.</p>
        </Panel>

        <div className="space-y-5 lg:col-span-4">
          <Panel title="Captain money in this range">
            <Row label="Earned into wallets" value={rs(data.captainLedger.earned)} />
            <Row label="Paid out to banks" value={rs(data.captainLedger.paidOut)} />
            <Link href="/payouts" className="btn mt-3 w-full">
              Captain payouts
            </Link>
          </Panel>
          <Panel title="What coupons cost">
            {data.coupons.length ? (
              <ul className="space-y-2 text-[13px]">
                {data.coupons.map((coupon) => (
                  <li key={coupon.id} className="flex items-center justify-between gap-3">
                    <span>
                      <span className="font-semibold text-gold">{coupon.code}</span> <span className="muted">· {coupon.uses} uses</span>
                    </span>
                    <span className="tabular-nums text-amber">− {rs(coupon.discount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty text="No coupons used in this range." />
            )}
          </Panel>
        </div>

        <Panel className="lg:col-span-12" title="Trips departing in this range" pad={false}>
          {data.trips.length ? (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Trip</th>
                    <th>Route</th>
                    <th>Departs</th>
                    <th>Captain</th>
                    <th>Seats</th>
                    <th>Seat fares</th>
                    <th>Commission</th>
                    <th>Captain share</th>
                    <th>Profit</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trips.map((trip) => (
                    <tr key={trip.id}>
                      <td>
                        <Link href={`/trips/${trip.id}`} className="font-medium text-gold hover:underline">
                          {trip.code}
                        </Link>
                      </td>
                      <td>{route(trip.from_city, trip.to_city)}</td>
                      <td className="muted">{when(trip.depart_at)}</td>
                      <td>{trip.captain_name}</td>
                      <td>
                        {trip.seats_booked}/{trip.seats_total}
                      </td>
                      <td className="tabular-nums">{rs(trip.fare_paise)}</td>
                      <td className="tabular-nums text-sky">{rs(trip.commission_paise)}</td>
                      <td className="tabular-nums">{rs(trip.captain_share_paise)}</td>
                      <td className="tabular-nums text-gold">{rs(trip.profit_paise)}</td>
                      <td>
                        <Badge value={trip.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5">
              <Empty text="No trips depart in this range." />
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
