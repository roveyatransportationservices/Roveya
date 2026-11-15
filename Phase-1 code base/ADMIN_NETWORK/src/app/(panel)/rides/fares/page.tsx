"use client";

import { useState } from "react";
import { PageHead, useAdmin } from "@/components/Shell";
import { Failure, Loading, Panel, Spinner, useAction } from "@/components/ui";
import { captainAccess, rideBill, type RidePlan } from "@/lib/ridePlan";
import { api, useData } from "@/lib/client";
import { when } from "@/lib/format";

type Fare = { key: string; service: "bike" | "auto" | "captain"; label: string; unit: string; min: number; max: number; value: number; custom: boolean; updatedAt: string | null };

const GROUPS: [Fare["service"], string, string][] = [
  ["bike", "ROVEYA Bike", "One passenger with a helmet."],
  ["auto", "ROVEYA Auto", "Up to three passengers, door to door."],
  ["captain", "Captain bonuses", "Paid on top of the fare. The fare itself stays with the captain."],
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
      <PageHead title="Bike & auto fare card" sub="Passengers pay the fare on the card. Captains keep it and pay the plan below. Changes apply to the next quote." />
      <div className="mb-5">
        <RidePlanPanel />
      </div>
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

const PLAN_FIELDS: [Exclude<keyof RidePlan, "mode">, string][] = [
  ["bikeDay", "Bike day plan ₹"],
  ["bikeMonth", "Bike month plan ₹"],
  ["autoDay", "Auto day plan ₹"],
  ["autoMonth", "Auto month plan ₹"],
  ["commissionPct", "Commission % if switched"],
  ["bikePassengerFee", "Bike passenger fee ₹"],
  ["autoPassengerFee", "Auto passenger fee ₹"],
];

function RidePlanPanel() {
  const { can } = useAdmin();
  const { data, error, loading, reload } = useData<RidePlan>("/ride-plan");
  const { busy, run } = useAction();
  const [draft, setDraft] = useState<RidePlan | null>(null);
  const plan = draft ?? data;
  if (error) return <Failure text={error} retry={reload} />;
  if (loading || !plan) return <Loading rows={3} />;
  const editable = can("rides.manage") || can("settings.manage");
  const bike = rideBill("bike", 49, plan);
  const auto = rideBill("auto", 89, plan);
  const bikeAccess = captainAccess("bike", plan);
  const autoAccess = captainAccess("auto", plan);

  const save = async () => {
    const done = await run("plan", () => api("/ride-plan", { method: "PATCH", body: plan }), "Ride plan saved.");
    if (done) {
      setDraft(null);
      void reload();
    }
  };

  return (
    <Panel title="Who pays Roveya">
      <p className="-mt-2 mb-4 text-[12px] muted">Subscription is the live model. The passenger pays the fare. Switch to commission only if a percent should come out of the captain’s fare later.</p>
      <div className="mb-4 flex gap-2">
        {(["subscription", "commission"] as const).map((mode) => (
          <button key={mode} type="button" className={`btn ${plan.mode === mode ? "btn-gold" : ""}`} disabled={!editable} onClick={() => setDraft({ ...plan, mode })}>
            {mode === "subscription" ? "Day or month plan" : "Percent of the fare"}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {PLAN_FIELDS.map(([key, label]) => (
          <label key={key} className="text-[13px]">
            {label}
            <input
              className="input mt-1"
              inputMode="numeric"
              disabled={!editable}
              value={String(plan[key])}
              onChange={(event) => setDraft({ ...plan, [key]: Number(event.target.value.replace(/[^\d.]/g, "")) || 0 })}
            />
          </label>
        ))}
      </div>
      <p className="mt-4 text-[12px] leading-5 muted">
        A ₹49 bike: the passenger pays ₹{bike.passengerPays}
        {bike.passengerFee ? `, including a ₹${bike.passengerFee} fee` : ""}. The captain keeps ₹{bike.captainReceives}
        {bikeAccess.mode === "subscription" ? ` and pays ₹${bikeAccess.day} for the day or ₹${bikeAccess.month} for the month.` : ` after a ${bikeAccess.commissionPct}% commission.`}
        {" "}A ₹89 auto: the passenger pays ₹{auto.passengerPays}. The captain keeps ₹{auto.captainReceives}
        {autoAccess.mode === "subscription" ? ` and pays ₹${autoAccess.day} for the day or ₹${autoAccess.month} for the month.` : ` after a ${autoAccess.commissionPct}% commission.`}
      </p>
      {editable ? (
        <button type="button" className="btn btn-gold mt-4" disabled={Boolean(busy)} onClick={() => void save()}>
          {busy === "plan" ? <Spinner /> : null} Save plan
        </button>
      ) : null}
    </Panel>
  );
}
