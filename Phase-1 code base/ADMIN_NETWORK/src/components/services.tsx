"use client";

import Link from "next/link";
import { Bike, Car, CarTaxiFront, Users } from "lucide-react";
import { Panel } from "./ui";
import { num, rs } from "@/lib/format";
import type { ServiceKey } from "@/lib/services";

export type ServiceSummary = {
  key: ServiceKey;
  name: string;
  soon: boolean;
  captains: { active: number; waiting: number; onDuty: number; total: number };
  customers: number;
  period: { orders: number; completed: number; cancelled: number; inProgress: number; valuePaise: number; commissionPaise: number; bonusPaise: number; netPaise: number };
};

export const SERVICE_ICON: Record<ServiceKey, typeof Bike> = { bike: Bike, auto: CarTaxiFront, taxi: Car, carpool: Users };

const word = (key: ServiceKey) => (key === "carpool" ? "bookings" : "rides");

// One card per service: captains, passengers and this period's rides and money.
export function ServiceCards({ services, days }: { services: ServiceSummary[]; days: number }) {
  const sum = (pick: (item: ServiceSummary) => number) => services.reduce((acc, item) => acc + pick(item), 0);
  return (
    <Panel title="All ROVEYA services" className="min-w-0 lg:col-span-12">
      <p className="-mt-2 mb-4 text-[11px] muted">Rides and money for the last {days} days. Riders and Vado count everyone so far.</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {services.map((item) => {
          const Icon = SERVICE_ICON[item.key];
          return (
            <div key={item.key} className="rounded-md border border-line bg-night/40 p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded bg-gold/15 text-gold">
                  <Icon size={16} />
                </span>
                <p className="flex-1 text-[13px] font-semibold">{item.name}</p>
                {item.soon ? <span className="rounded bg-sky/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-sky">Soon</span> : null}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Figure label="Vado" value={num(item.captains.active)} sub={`${num(item.captains.onDuty)} ${item.key === "carpool" ? "on trip" : "on duty"}`} />
                <Figure label="Waiting" value={num(item.captains.waiting)} tone={item.captains.waiting ? "text-amber" : ""} sub="to approve" />
                <Figure label="Riders" value={num(item.customers)} sub="passengers" />
              </div>
              <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-[12px]">
                <Line label={`Completed ${word(item.key)}`} value={`${num(item.period.completed)} / ${num(item.period.orders)}`} />
                <Line label="In progress now" value={num(item.period.inProgress)} />
                <Line label="Value" value={rs(item.period.valuePaise)} />
                <Line label="ROVEYA commission" value={rs(item.period.commissionPaise)} />
              </div>
              <div className="mt-3 flex gap-2">
                <Link href={`/riders/${item.key}`} className="btn flex-1 px-2 py-1 text-[11px]">
                  Riders
                </Link>
                <Link href={`/vado/${item.key}`} className="btn flex-1 px-2 py-1 text-[11px]">
                  Vado
                </Link>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[12px] sm:grid-cols-5">
        <Total label="Active Vado (captains)" value={num(sum((item) => item.captains.active))} />
        <Total label="Waiting to approve" value={num(sum((item) => item.captains.waiting))} tone={sum((item) => item.captains.waiting) ? "text-amber" : ""} />
        <Total label="Completed rides and bookings" value={num(sum((item) => item.period.completed))} />
        <Total label="Value" value={rs(sum((item) => item.period.valuePaise))} />
        <Total label="ROVEYA commission" value={rs(sum((item) => item.period.commissionPaise))} />
      </div>
    </Panel>
  );
}

// Money per service for the finance page.
export function ServiceMoney({ services }: { services: ServiceSummary[] }) {
  const sum = (pick: (item: ServiceSummary) => number) => services.reduce((acc, item) => acc + pick(item), 0);
  return (
    <Panel title="By service" pad={false} className="mb-5">
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Completed</th>
              <th>Cancelled</th>
              <th>Value</th>
              <th>Commission</th>
              <th>Captain bonuses</th>
              <th>ROVEYA net</th>
            </tr>
          </thead>
          <tbody>
            {services.map((item) => (
              <tr key={item.key}>
                <td className="font-medium">
                  {item.name}
                  {item.soon ? <span className="ml-2 rounded bg-sky/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-sky">Soon</span> : null}
                  <span className="block text-[11px] muted">{item.key === "carpool" ? "Seat bookings · net is after GST, refunds and the captain share" : "City rides · net is commission less bonuses and coupons"}</span>
                </td>
                <td className="tabular-nums">{num(item.period.completed)}</td>
                <td className="tabular-nums">{num(item.period.cancelled)}</td>
                <td className="tabular-nums">{rs(item.period.valuePaise)}</td>
                <td className="tabular-nums">{rs(item.period.commissionPaise)}</td>
                <td className="tabular-nums">{item.key === "carpool" ? "—" : rs(item.period.bonusPaise)}</td>
                <td className={`tabular-nums font-semibold ${item.period.netPaise < 0 ? "text-danger" : "text-success"}`}>{rs(item.period.netPaise)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td>All services</td>
              <td className="tabular-nums">{num(sum((item) => item.period.completed))}</td>
              <td className="tabular-nums">{num(sum((item) => item.period.cancelled))}</td>
              <td className="tabular-nums">{rs(sum((item) => item.period.valuePaise))}</td>
              <td className="tabular-nums">{rs(sum((item) => item.period.commissionPaise))}</td>
              <td className="tabular-nums">{rs(sum((item) => item.period.bonusPaise))}</td>
              <td className="tabular-nums">{rs(sum((item) => item.period.netPaise))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Figure({ label, value, sub, tone = "" }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="rounded bg-panel px-1 py-2">
      <p className="text-[10px] muted">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${tone}`}>{value}</p>
      <p className="text-[10px] muted">{sub}</p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex justify-between gap-2">
      <span className="muted">{label}</span>
      <span className="tabular-nums">{value}</span>
    </p>
  );
}

function Total({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[11px] muted">{label}</p>
      <p className={`text-base font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}
