"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Chips, Toolbar, useList } from "@/components/list";
import { Progress } from "@/components/charts";
import { PageHead } from "@/components/Shell";
import { Badge, Empty, Failure, Loading, Pager, Panel } from "@/components/ui";
import { route, rs, when } from "@/lib/format";

type Trip = {
  id: string;
  code: string;
  status: string;
  from_city: string;
  to_city: string;
  depart_at: string;
  captain_id: string;
  captain_name: string;
  captain_code: string;
  make_model: string;
  plate: string;
  car_class: string;
  women_friendly: boolean;
  base_fare_paise: number;
  seats_total: number;
  seats_booked: number;
  bookings: number;
  fare_paise: number;
  profit_paise: number;
};

export default function TripsPage() {
  const list = useList<{ trips: Trip[]; total: number; size: number }>("/trips", { status: "scheduled", sort: "upcoming" });
  const rows = list.data?.trips ?? [];
  return (
    <>
      <Link href="/networks" className="mb-3 inline-flex items-center gap-1.5 text-xs muted hover:text-gold">
        <ArrowLeft size={14} /> Carpool Networks
      </Link>
      <PageHead title="Carpool trips" sub="Every Carpool Travels trip published by captains." />
      <Toolbar q={list.q} setQ={list.setQ} placeholder="Trip code, captain or number plate">
        <Chips
          value={list.filters.status ?? ""}
          onChange={(value) => {
            list.setFilter("status", value);
            list.setFilter("sort", value === "scheduled" ? "upcoming" : "");
          }}
          options={[
            ["scheduled", "Upcoming"],
            ["on_trip", "On the road"],
            ["completed", "Completed"],
            ["cancelled", "Cancelled"],
            ["", "All"],
          ]}
        />
      </Toolbar>
      <Panel pad={false}>
        {list.error ? (
          <div className="p-5">
            <Failure text={list.error} retry={list.reload} />
          </div>
        ) : list.loading && !list.data ? (
          <div className="p-5">
            <Loading rows={8} />
          </div>
        ) : rows.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Trip</th>
                  <th>Route</th>
                  <th>Departs</th>
                  <th>Captain and car</th>
                  <th>Base fare</th>
                  <th className="w-40">Seats</th>
                  <th>Seat fares</th>
                  <th>ROVEYA earns</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((trip) => (
                  <tr key={trip.id}>
                    <td>
                      <Link href={`/trips/${trip.id}`} className="font-semibold text-gold hover:underline">
                        {trip.code}
                      </Link>
                      {trip.women_friendly ? <p className="text-[10px] text-rose">Women friendly</p> : null}
                    </td>
                    <td>{route(trip.from_city, trip.to_city)}</td>
                    <td className="muted">{when(trip.depart_at)}</td>
                    <td>
                      <Link href={`/captains/${trip.captain_id}`} className="hover:text-gold">
                        {trip.captain_name}
                      </Link>
                      <p className="text-[11px] muted">
                        {trip.make_model} · {trip.plate}
                      </p>
                    </td>
                    <td className="tabular-nums">{rs(trip.base_fare_paise)}</td>
                    <td>
                      <p className="mb-1 text-[11px]">
                        {trip.seats_booked}/{trip.seats_total} booked
                      </p>
                      <Progress value={trip.seats_total ? trip.seats_booked / trip.seats_total : 0} color="#6FCF97" />
                    </td>
                    <td className="tabular-nums">{rs(trip.fare_paise)}</td>
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
          <Empty text="No trips match." />
        )}
      </Panel>
      {list.data ? <Pager page={list.page} size={list.data.size} total={list.data.total} onPage={list.setPage} /> : null}
    </>
  );
}
