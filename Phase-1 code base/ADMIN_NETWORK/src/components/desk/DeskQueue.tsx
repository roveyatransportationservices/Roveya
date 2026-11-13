"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronRight, FileWarning, Hourglass, UserCheck } from "lucide-react";
import { Chips } from "@/components/list";
import { PageHead } from "@/components/Shell";
import { Empty, Failure, Loading, Panel, Stat } from "@/components/ui";
import { useData } from "@/lib/client";
import { ago, num, timeOnly } from "@/lib/format";
import type { ServiceKey } from "@/lib/services";
import { SlaTimer, TIMER_COLOR, timerState, useNow } from "./Timer";

export const DESK_SERVICES: { key: ServiceKey; label: string }[] = [
  { key: "bike", label: "ROVEYA Bike Vado" },
  { key: "auto", label: "ROVEYA Auto Vado" },
  { key: "taxi", label: "ROVEYA Taxi Vado" },
  { key: "carpool", label: "Carpool Network Vado" },
];

type Row = {
  id: string;
  name: string;
  phone: string;
  code: string;
  city: string;
  vehicle: string;
  registeredAt: string;
  dueAt: string;
  missing: string[];
  rejected: string[];
  toCheck: string[];
  verified: number;
  need: number;
  waitingOnVado: boolean;
  ready: boolean;
  carStatus: string | null;
  claim: { adminId: string; name: string; at: string } | null;
  recheck?: string | null;
};
type Queue = {
  service: ServiceKey;
  minutes: number;
  cities: string[];
  stats: { waiting: number; readyToCheck: number; waitingOnVado: number; overdue: number; approvedToday: number; avgMinutesToday: number | null; withinTimeToday: number };
  captains: Row[];
  done: { id: string; name: string; code: string; city: string; approvedAt: string; minutes: number; withinTime: boolean; by: string }[];
};

export function DeskQueue({ service }: { service: ServiceKey }) {
  const [city, setCity] = useState("");
  const [show, setShow] = useState<"" | "ready" | "waiting">("");
  const { data, error, loading, reload } = useData<Queue>(`/desk/queue?service=${service}${city ? `&city=${encodeURIComponent(city)}` : ""}`, 15000);
  const now = useNow();
  const title = DESK_SERVICES.find((item) => item.key === service)!.label;
  if (error) return <Failure text={error} retry={reload} />;
  const rows = (data?.captains ?? []).filter((row) => (show === "ready" ? !row.waitingOnVado : show === "waiting" ? row.waitingOnVado : true));
  const s = data?.stats;

  return (
    <>
      <PageHead title={`${title} verification`} sub={`Every new Vado is checked within ${data?.minutes ?? 45} minutes of registering. The clock starts when they register and they see it in the captain app too.`} />
      {loading || !data || !s ? (
        <Loading rows={8} />
      ) : (
        <>
          <Panel className="mb-5">
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-4 xl:grid-cols-7">
              <Stat label="Waiting" value={num(s.waiting)} />
              <Stat label="Ready to check" value={num(s.readyToCheck)} tone="text-gold" />
              <Stat label="Waiting on the Vado" value={num(s.waitingOnVado)} sub="papers missing or to fix" />
              <Stat label="Overdue" value={num(s.overdue)} tone={s.overdue ? "text-danger" : "text-cream"} />
              <Stat label="Approved today" value={num(s.approvedToday)} tone="text-success" />
              <Stat label="Average time today" value={s.avgMinutesToday === null ? "—" : `${s.avgMinutesToday} min`} />
              <Stat label={`Within ${data.minutes} min today`} value={s.approvedToday ? `${Math.round((s.withinTimeToday / s.approvedToday) * 100)}%` : "—"} tone={!s.approvedToday ? "text-cream" : s.withinTimeToday / s.approvedToday >= 0.9 ? "text-success" : s.withinTimeToday / s.approvedToday >= 0.6 ? "text-amber" : "text-danger"} />
            </div>
          </Panel>

          <div className="mb-4 flex flex-wrap gap-3">
            <Chips
              value={show}
              onChange={(value) => setShow(value as typeof show)}
              options={[
                ["", `All (${s.waiting})`],
                ["ready", `Ready to check (${s.readyToCheck})`],
                ["waiting", `Waiting on the Vado (${s.waitingOnVado})`],
              ]}
            />
            {data.cities.length > 1 || city ? <Chips value={city} onChange={setCity} options={[["", "All cities"], ...data.cities.map((name): [string, string] => [name, name])]} /> : null}
          </div>

          <Panel pad={false} className="mb-5">
            {rows.length ? (
              <ul className="divide-y divide-line">
                {rows.map((row) => {
                  const state = timerState(row.registeredAt, row.dueAt, now);
                  return (
                    <li key={row.id} style={{ boxShadow: `inset 4px 0 0 ${row.waitingOnVado ? TIMER_COLOR.grey : TIMER_COLOR[state.tone]}` }}>
                      <Link href={`/desk/verify/${service}/${row.id}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-4 hover:bg-mist/40 md:grid-cols-[130px_1.3fr_1fr_1.2fr_auto]">
                        <SlaTimer registeredAt={row.registeredAt} dueAt={row.dueAt} paused={row.waitingOnVado} now={now} />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">
                            {row.name}
                            {row.recheck ? <span className="ml-2 rounded bg-amber/20 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-amber">Renewal</span> : null}
                          </span>
                          <span className="block text-[11px] muted">
                            {row.code} · {row.phone} · {row.recheck ? `back ${timeOnly(row.registeredAt)} · ${row.recheck}` : `registered ${timeOnly(row.registeredAt)}`}
                          </span>
                        </span>
                        <span className="hidden min-w-0 text-[12px] md:block">
                          <span className="block truncate">{row.city}</span>
                          <span className="block truncate muted">{row.vehicle}</span>
                        </span>
                        <span className="hidden text-[12px] md:block">
                          <span className="flex items-center gap-1.5">
                            <CheckCircle2 size={13} className="text-success" /> {row.verified} of {row.need} verified
                          </span>
                          {row.toCheck.length ? (
                            <span className="flex items-center gap-1.5 text-gold">
                              <Hourglass size={13} /> {row.toCheck.length} to check
                            </span>
                          ) : null}
                          {row.missing.length || row.rejected.length ? (
                            <span className="flex items-center gap-1.5 text-amber">
                              <FileWarning size={13} /> {row.missing.length ? `${row.missing.length} missing` : ""}
                              {row.missing.length && row.rejected.length ? " · " : ""}
                              {row.rejected.length ? `${row.rejected.length} to fix` : ""}
                            </span>
                          ) : null}
                        </span>
                        <span className="flex items-center gap-2 text-[11px]">
                          {row.claim ? (
                            <span className="flex items-center gap-1 rounded bg-sky/15 px-2 py-1 text-sky">
                              <UserCheck size={12} /> {row.claim.name}
                            </span>
                          ) : (
                            <span className="rounded bg-gold/15 px-2 py-1 font-semibold text-gold">Open</span>
                          )}
                          <ChevronRight size={16} className="muted" />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="p-6">
                <Empty text={data.captains.length ? "Nobody matches this filter." : `No new ${title} waiting. Well done.`} />
              </div>
            )}
          </Panel>

          <Panel title="Approved today" pad={false}>
            {data.done.length ? (
              <ul className="divide-y divide-line">
                {data.done.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 text-[13px]">
                    <span>
                      <span className="font-medium">{row.name}</span> <span className="muted">· {row.code} · {row.city}</span>
                    </span>
                    <span className="flex items-center gap-3 text-[12px]">
                      <span style={{ color: row.withinTime ? TIMER_COLOR.green : TIMER_COLOR.red }}>{row.minutes} min</span>
                      <span className="muted">
                        by {row.by} · {ago(row.approvedAt)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-5">
                <Empty text="Nobody approved in this service today yet." />
              </div>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
