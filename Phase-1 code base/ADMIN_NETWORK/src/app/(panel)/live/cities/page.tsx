"use client";

import { useState } from "react";
import { Progress } from "@/components/charts";
import { Chips } from "@/components/list";
import { PageHead } from "@/components/Shell";
import { Empty, Failure, Loading, Panel, Stat } from "@/components/ui";
import { useData } from "@/lib/client";
import { num, pct, rs } from "@/lib/format";

type Numbers = {
  requests: number;
  passengers: number;
  completed: number;
  noCaptain: number;
  cancelled: number;
  fulfilment: number;
  unmet: number;
  captains: number;
  approved: number;
  working: number;
  utilisation: number;
  valuePaise?: number;
  commissionPaise?: number;
  bonusPaise?: number;
  promoPaise?: number;
  spendPaise?: number;
  netPaise?: number;
};
type Service = "bike" | "auto" | "car";
type City = { id: string; name: string; state: string; total: Numbers; services: Record<Service, Numbers> };
type Data = { days: number; finance: boolean; totals: Numbers; cities: City[] };

const PERIODS: [string, string][] = [
  ["7", "7 days"],
  ["30", "30 days"],
  ["90", "90 days"],
];

export default function LiveCitiesPage() {
  const [days, setDays] = useState("30");
  const [service, setService] = useState<"" | Service>("");
  const { data, error, loading, reload } = useData<Data>(`/live/cities?days=${days}`, 60000);

  if (error) return <Failure text={error} retry={reload} />;
  const pick = (city: City) => (service ? city.services[service] : city.total);
  const rows = (data?.cities ?? []).filter((city) => {
    const n = pick(city);
    return n.requests || n.captains;
  });
  const totals = data ? (service ? sum(rows.map(pick)) : data.totals) : null;

  return (
    <>
      <PageHead title="Live Cities" sub="ROVEYA Bike, Auto and Car city by city: captains working, passengers trying to ride, and what ROVEYA earns and spends. Carpool Travels is in Carpool Networks." />
      <div className="mb-4 flex flex-wrap gap-3">
        <Chips value={days} onChange={setDays} options={PERIODS} />
        <Chips
          value={service}
          onChange={(value) => setService(value as "" | Service)}
          options={[
            ["", "All city services"],
            ["bike", "ROVEYA Bike"],
            ["auto", "ROVEYA Auto"],
            ["car", "ROVEYA Car"],
          ]}
        />
      </div>
      {loading || !data || !totals ? (
        <Loading rows={8} />
      ) : (
        <>
          <Panel className="mb-5">
            <div className={`grid grid-cols-2 gap-5 sm:grid-cols-4 ${data.finance ? "xl:grid-cols-9" : "xl:grid-cols-6"}`}>
              <Stat label="Cities" value={num(rows.filter((city) => city.id !== "other").length)} />
              <Stat label="Captains working" value={pct(totals.utilisation)} sub={`${num(totals.working)} of ${num(totals.approved)} approved`} tone="text-success" />
              <Stat label="Passengers trying" value={num(totals.passengers)} sub={`${num(totals.requests)} ride requests`} />
              <Stat label="Got a ride" value={pct(totals.fulfilment)} sub={`${num(totals.completed)} rides done`} tone="text-sky" />
              <Stat label="Found no captain" value={pct(totals.unmet)} sub={`${num(totals.noCaptain)} requests`} tone={totals.noCaptain ? "text-danger" : "text-cream"} />
              <Stat label="Cancelled" value={num(totals.cancelled)} />
              {data.finance ? (
                <>
                  <Stat label="ROVEYA earns" value={rs(totals.commissionPaise)} sub={`on ${rs(totals.valuePaise)} of rides`} tone="text-gold" />
                  <Stat label="ROVEYA spends" value={rs(totals.spendPaise)} sub="captain bonuses and promos" tone="text-amber" />
                  <Stat label="Net" value={rs(totals.netPaise)} tone={(totals.netPaise ?? 0) >= 0 ? "text-success" : "text-danger"} />
                </>
              ) : null}
            </div>
          </Panel>

          <Panel pad={false}>
            {rows.length ? (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>City</th>
                      <th className="w-44">Captains working</th>
                      <th>Passengers trying</th>
                      <th className="w-40">Got a ride</th>
                      <th>Found no captain</th>
                      {data.finance ? (
                        <>
                          <th>ROVEYA earns</th>
                          <th>ROVEYA spends</th>
                          <th>Net</th>
                        </>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((city) => {
                      const n = pick(city);
                      return (
                        <tr key={city.id}>
                          <td>
                            <p className="font-semibold">{city.name}</p>
                            <p className="text-[11px] muted">{city.state || "Pickups more than 40 km from a ROVEYA city"}</p>
                            {!service ? (
                              <p className="text-[10px] muted">
                                Bike {city.services.bike.requests} · Auto {city.services.auto.requests} · Car {city.services.car.requests} requests
                              </p>
                            ) : null}
                          </td>
                          <td>
                            <p className="mb-1 text-[11px]">
                              {n.working} of {n.approved} · {pct(n.utilisation)}
                            </p>
                            <Progress value={n.utilisation} color="#6FCF97" />
                            <p className="mt-1 text-[10px] muted">{n.captains} registered</p>
                          </td>
                          <td className="tabular-nums">
                            {num(n.passengers)}
                            <span className="block text-[11px] muted">{num(n.requests)} requests</span>
                          </td>
                          <td>
                            <p className="mb-1 text-[11px]">
                              {n.completed} rides · {pct(n.fulfilment)}
                            </p>
                            <Progress value={n.fulfilment} color="#8FB4E8" />
                          </td>
                          <td className={`tabular-nums ${n.noCaptain ? "text-danger" : "muted"}`}>
                            {pct(n.unmet)}
                            <span className="block text-[11px] muted">{n.noCaptain} requests</span>
                          </td>
                          {data.finance ? (
                            <>
                              <td className="tabular-nums text-gold">
                                {rs(n.commissionPaise)}
                                <span className="block text-[11px] muted">of {rs(n.valuePaise)}</span>
                              </td>
                              <td className="tabular-nums text-amber" title={`Captain bonuses ${rs(n.bonusPaise)} · promos ${rs(n.promoPaise)}`}>
                                {rs(n.spendPaise)}
                                <span className="block text-[11px] muted">
                                  bonus {rs(n.bonusPaise)} · promos {rs(n.promoPaise)}
                                </span>
                              </td>
                              <td className={`tabular-nums font-semibold ${(n.netPaise ?? 0) >= 0 ? "text-success" : "text-danger"}`}>{rs(n.netPaise)}</td>
                            </>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-5">
                <Empty text="No captains or ride requests in any city for this period yet." />
              </div>
            )}
          </Panel>
          <p className="mt-3 text-[11px] muted">
            A ride counts in the city nearest its pickup (within 40 km). Captains count in the city they registered with. &quot;Working&quot; means on duty or on a ride in the last 15 days.
          </p>
        </>
      )}
    </>
  );
}

function sum(items: Numbers[]): Numbers {
  const add = (key: keyof Numbers) => items.reduce((acc, item) => acc + Number(item[key] ?? 0), 0);
  const requests = add("requests");
  const approved = add("approved");
  return {
    requests,
    passengers: add("passengers"),
    completed: add("completed"),
    noCaptain: add("noCaptain"),
    cancelled: add("cancelled"),
    fulfilment: requests ? add("completed") / requests : 0,
    unmet: requests ? add("noCaptain") / requests : 0,
    captains: add("captains"),
    approved,
    working: add("working"),
    utilisation: approved ? add("working") / approved : 0,
    valuePaise: add("valuePaise"),
    commissionPaise: add("commissionPaise"),
    bonusPaise: add("bonusPaise"),
    promoPaise: add("promoPaise"),
    spendPaise: add("spendPaise"),
    netPaise: add("netPaise"),
  };
}
