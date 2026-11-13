"use client";

import { useState } from "react";
import { PageHead, useAdmin } from "@/components/Shell";
import { Failure, Loading, Panel, Spinner, useAction } from "@/components/ui";
import { api, useData } from "@/lib/client";
import { when } from "@/lib/format";

type Fare = { key: string; service: "bike" | "auto" | "captain"; label: string; unit: string; min: number; max: number; value: number; custom: boolean; updatedAt: string | null };

const GROUPS: [Fare["service"], string, string][] = [
  ["bike", "ROVEYA Bike", "One passenger with a helmet."],
  ["auto", "ROVEYA Auto", "Up to three passengers, door to door."],
  ["captain", "Captain bonuses and commission", "Shared by both services."],
];

const shown = (fare: Fare) => (fare.unit === "paise" ? fare.value / 100 : fare.value);
const unitText = (fare: Fare) => (fare.unit === "paise" ? "₹" : fare.unit);

export default function RideFaresPage() {
  const { can } = useAdmin();
  const { data, error, loading, reload } = useData<{ fares: Fare[] }>("/rides/fares");
  const { busy, run } = useAction();
  const [draft, setDraft] = useState<Record<string, string>>({});
  if (error) return <Failure text={error} retry={reload} />;
  if (loading || !data) return <Loading rows={8} />;
  const editable = can("rides.manage") || can("settings.manage");

  const save = async (fare: Fare) => {
    const typed = Number(draft[fare.key]);
    if (!Number.isFinite(typed)) return;
    const value = fare.unit === "paise" ? Math.round(typed * 100) : typed;
    const done = await run(fare.key, () => api(`/rides/fares`, { method: "PATCH", body: { key: fare.key, value } }), `${fare.label} saved.`);
    if (done) {
      setDraft((current) => ({ ...current, [fare.key]: "" }));
      void reload();
    }
  };

  return (
    <>
      <PageHead title="Bike & auto fare card" sub="The passenger app prices every ride from these numbers. Changes apply to the next quote." />
      <div className="grid gap-5 lg:grid-cols-3">
        {GROUPS.map(([service, title, sub]) => (
          <Panel key={service} title={title}>
            <p className="-mt-2 mb-4 text-[12px] muted">{sub}</p>
            {data.fares
              .filter((fare) => fare.service === service)
              .map((fare) => (
                <div key={fare.key} className="mb-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[13px]">{fare.label}</p>
                    <p className="text-lg font-semibold tabular-nums text-gold">
                      {unitText(fare) === "₹" ? `₹${shown(fare)}` : `${shown(fare)} ${unitText(fare)}`}
                    </p>
                  </div>
                  <p className="text-[11px] muted">{fare.custom ? `Changed ${when(fare.updatedAt)}` : "Default"}</p>
                  {editable ? (
                    <div className="mt-2 flex gap-2">
                      <input
                        className="input flex-1"
                        inputMode="decimal"
                        placeholder={`New value in ${unitText(fare)}`}
                        value={draft[fare.key] ?? ""}
                        onChange={(event) => setDraft((current) => ({ ...current, [fare.key]: event.target.value.replace(/[^\d.]/g, "") }))}
                      />
                      <button type="button" className="btn btn-gold" disabled={!draft[fare.key] || Boolean(busy)} onClick={() => void save(fare)}>
                        {busy === fare.key ? <Spinner /> : null} Save
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
          </Panel>
        ))}
      </div>
    </>
  );
}
