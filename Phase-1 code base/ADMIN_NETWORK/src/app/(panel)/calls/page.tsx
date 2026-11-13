"use client";

import { useState } from "react";
import { Phone } from "lucide-react";
import { CallButton } from "@/components/actions";
import { Chips, Toolbar, useList } from "@/components/list";
import { PageHead } from "@/components/Shell";
import { Badge, Empty, Failure, Loading, Pager, Panel } from "@/components/ui";
import { label, when } from "@/lib/format";

type Call = { id: number; admin_name: string | null; to_phone: string; to_name: string | null; to_kind: string | null; mode: string; outcome: string | null; note: string | null; created_at: string };

export default function CallsPage() {
  const list = useList<{ calls: Call[]; total: number; size: number; bridgeReady: boolean; myPhone: string | null }>("/calls", { mine: "" });
  const [dial, setDial] = useState("");
  const rows = list.data?.calls ?? [];
  return (
    <>
      <PageHead title="Calls" sub="Every call the team made to captains, travellers and emergency contacts." />
      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <Panel title="Call a number">
          <div className="flex gap-2">
            <label className="flex flex-1 items-center gap-2 rounded-md border border-line bg-night px-3">
              <span className="text-sm muted">+91</span>
              <input className="w-full bg-transparent py-2 text-sm outline-none" inputMode="numeric" value={dial} onChange={(event) => setDial(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Mobile number" />
            </label>
            {/^[6-9]\d{9}$/.test(dial) ? <CallButton phone={dial} kind="Other" entity="call" /> : <button type="button" className="btn" disabled><Phone size={14} /> Call</button>}
          </div>
          <p className="mt-3 text-[11px] muted">
            {list.data?.bridgeReady ? `The ROVEYA line rings your phone${list.data.myPhone ? ` (+91 ${list.data.myPhone})` : ""} first, then connects. Numbers stay private.` : "The ROVEYA line works once Exotel is added to the server. Until then calls go from your own phone and are logged here."}
          </p>
        </Panel>
      </div>
      <Toolbar>
        <Chips
          value={list.filters.mine ?? ""}
          onChange={(value) => list.setFilter("mine", value)}
          options={[
            ["", "Whole team"],
            ["1", "My calls"],
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
            <Loading rows={6} />
          </div>
        ) : rows.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>By</th>
                  <th>To</th>
                  <th>How</th>
                  <th>Outcome</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((call) => (
                  <tr key={call.id}>
                    <td className="whitespace-nowrap muted">{when(call.created_at)}</td>
                    <td>{call.admin_name ?? "—"}</td>
                    <td>
                      {call.to_name ?? "—"} <span className="muted">· {call.to_phone}</span>
                      <p className="text-[11px] muted">{call.to_kind}</p>
                    </td>
                    <td className="text-[12px]">{call.mode === "bridged" ? "ROVEYA line" : "Own phone"}</td>
                    <td>{call.outcome ? <Badge value={call.outcome === "reached" ? "completed" : "pending"}>{label(call.outcome)}</Badge> : <span className="muted">—</span>}</td>
                    <td className="max-w-sm text-[12px] text-cream/70">{call.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="No calls logged yet." />
        )}
      </Panel>
      {list.data ? <Pager page={list.page} size={list.data.size} total={list.data.total} onPage={list.setPage} /> : null}
    </>
  );
}
