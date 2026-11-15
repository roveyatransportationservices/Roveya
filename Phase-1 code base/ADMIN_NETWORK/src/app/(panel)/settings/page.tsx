"use client";

import { useEffect, useState } from "react";
import { Lock, Save } from "lucide-react";
import { PageHead, useAdmin } from "@/components/Shell";
import { Failure, Loading, Panel, Row, Spinner, useAction, useFeedback } from "@/components/ui";
import { bookingFeeForSeat } from "@/lib/carpoolMoney";
import { api, useData } from "@/lib/client";
import { when } from "@/lib/format";

type Setting = { key: string; label: string; unit: string; min: number; max: number; help: string; value: number | null; updatedAt: string | null };

function Sample({ values }: { values: Record<string, string> }) {
  const rules = {
    percent: Number(values.booking_fee_percent) || 10,
    floor: Number(values.booking_fee_floor) || 79,
    cap: Number(values.booking_fee_cap) || 149,
    gstPercent: Number(values.booking_fee_gst_percent) || 18,
  };
  const bill = bookingFeeForSeat(649, rules);
  return (
    <p className="mt-4 text-xs muted">
      On a ₹649 seat the passenger pays ₹{bill.passengerPays}. That is ₹{bill.seatPrice} to the captain, a ₹{bill.fee} booking fee, and ₹{bill.gst} GST.
    </p>
  );
}

export default function SettingsPage() {
  const { can } = useAdmin();
  const { ask } = useFeedback();
  const { busy, run } = useAction();
  const { data, error, loading, reload } = useData<{ settings: Setting[]; fixed: { label: string; value: string; help: string }[] }>("/settings");
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data) setValues(Object.fromEntries(data.settings.map((item) => [item.key, item.value === null ? "" : String(item.value)])));
  }, [data]);

  if (error) return <Failure text={error} retry={reload} />;
  if (loading || !data) return <Loading rows={5} />;

  const save = async (item: Setting) => {
    const value = Number(values[item.key]);
    if (!(await ask({ title: `Change ${item.label.toLowerCase()}?`, body: `From ${item.value ?? "default"} to ${value} ${item.unit}. This applies to the apps immediately.`, confirm: "Change it" }))) return;
    const done = await run(item.key, () => api("/settings", { method: "PATCH", body: { key: item.key, value } }), `${item.label} updated.`);
    if (done) void reload();
  };

  return (
    <>
      <PageHead title="Settings" sub="Platform rules the ROVEYA apps read live. Changes are recorded in the audit log." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Booking fee">
          <div className="space-y-5">
            {data.settings.map((item) => {
              const changed = values[item.key] !== (item.value === null ? "" : String(item.value));
              return (
                <div key={item.key}>
                  <div className="flex items-end gap-3">
                    <label className="flex-1">
                      <span className="label">
                        {item.label} ({item.unit})
                      </span>
                      <input className="input" inputMode="decimal" disabled={!can("settings.manage")} value={values[item.key] ?? ""} onChange={(event) => setValues({ ...values, [item.key]: event.target.value.replace(/[^\d.]/g, "") })} />
                    </label>
                    {can("settings.manage") ? (
                      <button type="button" className="btn btn-gold" disabled={!changed || busy === item.key || values[item.key] === ""} onClick={() => void save(item)}>
                        {busy === item.key ? <Spinner /> : <Save size={14} />} Save
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[11px] muted">
                    {item.help} Allowed {item.min} to {item.max}. {item.updatedAt ? `Last changed ${when(item.updatedAt)}.` : ""}
                  </p>
                </div>
              );
            })}
          </div>
          <Sample values={values} />
          {!can("settings.manage") ? (
            <p className="mt-4 flex items-center gap-2 text-xs muted">
              <Lock size={13} /> Only super admins and finance can change these.
            </p>
          ) : null}
        </Panel>
        <Panel title="Built into every booking">
          {data.fixed.map((item) => (
            <div key={item.label} className="border-b border-line py-2 last:border-0">
              <Row label={item.label} value={<span className="font-semibold text-gold">{item.value}</span>} />
              <p className="text-[11px] muted">{item.help}</p>
            </div>
          ))}
          <p className="mt-3 text-[11px] muted">These are part of the booking rules in the database. Changing them needs a database update so every app stays consistent.</p>
        </Panel>
      </div>
    </>
  );
}
