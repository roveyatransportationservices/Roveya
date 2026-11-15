"use client";

import { useState } from "react";
import { PageHead, useAdmin } from "@/components/Shell";
import { Failure, Loading, Panel, Spinner, useAction } from "@/components/ui";
import { api, useData } from "@/lib/client";

type Board = {
  settings: { offerSeconds: number; radiiKm: number[]; searchSeconds: number; gpsFreshSeconds: number; batch: number };
  duty: Record<string, number>;
  phases: Record<string, number>;
  offers: { pending: number; accepted: number; declined: number };
  note: string;
};

const FIELDS: { key: string; label: string; hint: string }[] = [
  { key: "dispatch_offer_seconds", label: "Acceptance timer (seconds)", hint: "One captain at a time. 10 to 60." },
  { key: "dispatch_search_seconds", label: "Customer search limit (seconds)", hint: "Then the ride expires. 60 to 300." },
  { key: "dispatch_gps_fresh_seconds", label: "GPS freshness (seconds)", hint: "Older locations are not offered a ride." },
  { key: "dispatch_batch", label: "Captains offered at once", hint: "1 is sequential. 2 is the maximum." },
  { key: "dispatch_radius_km", label: "Search radii (km)", hint: "Example 2,4,6,8. The ring steps out after each timer." },
];

export default function DispatchPage() {
  const { can } = useAdmin();
  const { data, error, loading, reload } = useData<Board>("/dispatch");
  const { busy, run } = useAction();
  const [draft, setDraft] = useState<Record<string, string>>({});
  if (error) return <Failure text={error} retry={reload} />;
  if (loading || !data) return <Loading rows={8} />;
  const editable = can("rides.manage") || can("settings.manage");
  const current: Record<string, string> = {
    dispatch_offer_seconds: String(data.settings.offerSeconds),
    dispatch_search_seconds: String(data.settings.searchSeconds),
    dispatch_gps_fresh_seconds: String(data.settings.gpsFreshSeconds),
    dispatch_batch: String(data.settings.batch),
    dispatch_radius_km: data.settings.radiiKm.join(","),
  };

  const save = async (key: string) => {
    const value = draft[key]?.trim();
    if (!value) return;
    const done = await run(key, () => api("/dispatch", { method: "PATCH", body: { key, value } }), "Dispatch setting saved.");
    if (done) {
      setDraft((now) => ({ ...now, [key]: "" }));
      void reload();
    }
  };

  return (
    <>
      <PageHead title="Ride dispatch" sub="One free captain of the matching vehicle is offered. The next captain is offered only after a miss or a rejection." />
      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <Panel title="Captains right now">
          {Object.entries(data.duty).map(([label, value]) => (
            <p key={label} className="flex justify-between text-[13px]">
              <span>{label.replaceAll("_", " ")}</span>
              <span className="tabular-nums text-gold">{value}</span>
            </p>
          ))}
        </Panel>
        <Panel title="Bookings in the last day">
          {Object.entries(data.phases).map(([label, value]) => (
            <p key={label} className="flex justify-between text-[13px]">
              <span>{label.replaceAll("_", " ")}</span>
              <span className="tabular-nums text-gold">{value}</span>
            </p>
          ))}
        </Panel>
        <Panel title="Offers in the last day">
          <p className="flex justify-between text-[13px]"><span>Waiting on a captain</span><span className="tabular-nums text-gold">{data.offers.pending}</span></p>
          <p className="flex justify-between text-[13px]"><span>Accepted</span><span className="tabular-nums text-gold">{data.offers.accepted}</span></p>
          <p className="flex justify-between text-[13px]"><span>Missed or rejected</span><span className="tabular-nums text-gold">{data.offers.declined}</span></p>
          <p className="mt-3 text-[12px] muted">{data.note}</p>
        </Panel>
      </div>
      <Panel title="Dispatch settings">
        {FIELDS.map((field) => (
          <div key={field.key} className="mb-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[13px]">{field.label}</p>
              <p className="text-lg font-semibold tabular-nums text-gold">{current[field.key]}</p>
            </div>
            <p className="text-[11px] muted">{field.hint}</p>
            {editable ? (
              <div className="mt-2 flex gap-2">
                <input className="input flex-1" value={draft[field.key] ?? ""} placeholder="New value" onChange={(event) => setDraft((now) => ({ ...now, [field.key]: event.target.value }))} />
                <button type="button" className="btn btn-gold" disabled={!draft[field.key] || Boolean(busy)} onClick={() => void save(field.key)}>
                  {busy === field.key ? <Spinner /> : null} Save
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </Panel>
    </>
  );
}
