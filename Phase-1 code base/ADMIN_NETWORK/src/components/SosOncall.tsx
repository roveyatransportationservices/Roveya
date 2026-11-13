"use client";

import { useState } from "react";
import { PhoneCall, Plus, Trash2 } from "lucide-react";
import { Empty, Panel, Spinner, useAction, useFeedback } from "@/components/ui";
import { api, useData } from "@/lib/client";

type Person = { id: number; name: string; phone: string; priority: number; active: boolean };

// Who ROVEYA rings, day or night, when an SOS is not acknowledged on the Support Desk in time.
export function SosOncall({ canEdit }: { canEdit: boolean }) {
  const { ask } = useFeedback();
  const { busy, run } = useAction();
  const { data, reload } = useData<{ oncall: Person[]; exotelReady: boolean }>("/sos/oncall");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const add = async () => {
    if (await run("add", () => api("/sos/oncall", { body: { name, phone, priority: (data?.oncall.length ?? 0) + 1 } }), `${name} is on call.`)) {
      setName("");
      setPhone("");
      void reload();
    }
  };
  const toggle = async (person: Person) => {
    if (await run(`t${person.id}`, () => api(`/sos/oncall/${person.id}`, { method: "PATCH", body: { active: !person.active } }), person.active ? `${person.name} is off call.` : `${person.name} is on call.`)) void reload();
  };
  const remove = async (person: Person) => {
    if (!(await ask({ title: `Remove ${person.name}?`, body: "They will no longer be called for SOS alerts.", confirm: "Remove", danger: true }))) return;
    if (await run(`d${person.id}`, () => api(`/sos/oncall/${person.id}`, { method: "DELETE" }), "Removed.")) void reload();
  };

  return (
    <Panel title="SOS on-call people" className="lg:col-span-2">
      <p className="text-[12px] muted">
        When an SOS is not acknowledged on the Support Desk in time, ROVEYA rings everyone switched on here. When they pick up, they are connected straight to the person who pressed SOS. It repeats every 5 minutes, up to 3 rounds, until the desk acknowledges the alert.
      </p>
      {data && !data.exotelReady ? (
        <p className="mt-3 rounded border border-amber/40 bg-amber/10 px-3 py-2 text-[12px] text-amber">
          Test mode: Exotel is not set up yet, so calls are recorded but phones do not ring. Add EXOTEL_SID, EXOTEL_API_KEY, EXOTEL_API_TOKEN and EXOTEL_CALLER_ID to switch it on.
        </p>
      ) : null}
      <ul className="mt-4 divide-y divide-line">
        {(data?.oncall ?? []).map((person, index) => (
          <li key={person.id} className="flex flex-wrap items-center gap-3 py-2.5 text-[13px]">
            <PhoneCall size={14} className={person.active ? "text-success" : "text-cream/30"} />
            <span className="w-6 text-[11px] muted">#{index + 1}</span>
            <span className={`font-semibold ${person.active ? "" : "muted"}`}>{person.name}</span>
            <span className="muted">+91 {person.phone}</span>
            {canEdit ? (
              <span className="ml-auto flex gap-1.5">
                <button type="button" className="btn px-2.5 py-1 text-[11px]" disabled={Boolean(busy)} onClick={() => void toggle(person)}>
                  {person.active ? "Switch off" : "Switch on"}
                </button>
                <button type="button" className="btn px-2 py-1 text-[11px] text-danger" disabled={Boolean(busy)} onClick={() => void remove(person)} aria-label={`Remove ${person.name}`}>
                  <Trash2 size={12} />
                </button>
              </span>
            ) : (
              <span className="ml-auto text-[11px] muted">{person.active ? "On call" : "Off"}</span>
            )}
          </li>
        ))}
      </ul>
      {data && !data.oncall.length ? <Empty text="Nobody is on call. Add at least yourself so an SOS at night never goes unanswered." /> : null}
      {canEdit ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-[180px] flex-1">
            <span className="label">Name</span>
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Night manager" />
          </label>
          <label className="w-48">
            <span className="label">Mobile</span>
            <input className="input" inputMode="numeric" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="9876543210" />
          </label>
          <button type="button" className="btn btn-gold" disabled={busy === "add" || name.trim().length < 2 || phone.length !== 10} onClick={() => void add()}>
            {busy === "add" ? <Spinner /> : <Plus size={14} />} Add
          </button>
        </div>
      ) : null}
    </Panel>
  );
}
