"use client";

import { useState } from "react";
import { ClipboardPlus, Phone } from "lucide-react";
import { api, useData } from "@/lib/client";
import { label } from "@/lib/format";
import { useAdmin } from "./Shell";
import { Field, Modal, Spinner, useAction } from "./ui";

type Kind = "Captain" | "Traveller" | "Contact" | "Other";
type CallRow = { id: number; admin_name: string | null; mode: string; outcome: string | null; note: string | null; created_at: string };

const OUTCOMES: [string, string][] = [
  ["reached", "Spoke to them"],
  ["no_answer", "No answer"],
  ["busy", "Busy"],
  ["callback", "Call back later"],
  ["wrong_number", "Wrong number"],
];

function CallModal({ phone, name, kind, entity, entityId, onClose }: { phone: string; name?: string; kind?: Kind; entity?: string; entityId?: string; onClose: () => void }) {
  const { busy, run } = useAction();
  const [stage, setStage] = useState<"pick" | "after">("pick");
  const [outcome, setOutcome] = useState("reached");
  const [note, setNote] = useState("");

  const save = async () => {
    const done = await run("save", () => api("/calls", { body: { action: "log", phone, name, kind, entity, entityId, outcome, note } }), "Call saved.");
    if (done) onClose();
  };

  return (
    <Modal title={`Call ${name ?? `+91 ${phone}`}`} onClose={onClose}>
      <p className="text-sm">
        {kind ? <span className="muted">{kind} · </span> : null}
        <span className="font-semibold text-gold">+91 {phone}</span>
      </p>
      {stage === "pick" ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <a href={`tel:+91${phone}`} className="btn btn-gold py-2.5" onClick={() => setStage("after")}>
            <Phone size={15} /> Call from my phone
          </a>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <Field label="How did it go?">
            <div className="flex flex-wrap gap-1.5">
              {OUTCOMES.map(([key, text]) => (
                <button key={key} type="button" onClick={() => setOutcome(key)} className={`btn px-2.5 py-1 text-[11px] ${outcome === key ? "border-gold text-gold" : ""}`}>
                  {text}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Notes">
            <textarea className="input min-h-[80px]" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Captain confirmed he is 10 minutes from the boarding point" />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={onClose}>
              Skip
            </button>
            <button type="button" className="btn btn-gold" disabled={busy === "save"} onClick={() => void save()}>
              {busy === "save" ? <Spinner /> : null} Save call
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function CallButton({ phone, name, kind, entity, entityId, compact }: { phone?: string | null; name?: string; kind?: Kind; entity?: string; entityId?: string; compact?: boolean }) {
  const { can } = useAdmin();
  const [open, setOpen] = useState(false);
  if (!phone) return null;
  if (!can("calls.make")) {
    return (
      <a href={`tel:+91${phone}`} className="text-gold hover:underline">
        {phone}
      </a>
    );
  }
  return (
    <>
      <button type="button" className={`btn ${compact ? "px-2 py-1 text-[11px]" : ""}`} onClick={() => setOpen(true)}>
        <Phone size={compact ? 12 : 14} className="text-success" /> {compact ? "Call" : `Call ${kind === "Captain" ? "captain" : kind === "Traveller" ? "traveller" : ""}`.trim()}
      </button>
      {open ? <CallModal phone={phone} name={name} kind={kind} entity={entity} entityId={entityId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

type Teammate = { id: string; name: string; roleName: string };

function AssignModal({ title, entity, entityId, link, onClose }: { title: string; entity: string; entityId?: string; link?: string; onClose: () => void }) {
  const { data } = useData<{ team: Teammate[] }>("/team");
  const { busy, run } = useAction();
  const [form, setForm] = useState({ assignedTo: "", title, details: "", priority: entity === "safety" ? "urgent" : "normal", due: "" });
  const save = async () => {
    const body = { assignedTo: form.assignedTo, title: form.title, details: form.details, priority: form.priority, dueAt: form.due ? new Date(`${form.due}:00+05:30`).toISOString() : null, entity, entityId, link };
    const done = await run("assign", () => api("/tasks", { body }), "Task assigned.");
    if (done) onClose();
  };
  return (
    <Modal title="Assign work" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Who does it">
          <select className="input" value={form.assignedTo} onChange={(event) => setForm({ ...form, assignedTo: event.target.value })}>
            <option value="">Pick a team member</option>
            {(data?.team ?? []).map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} · {person.roleName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Task">
          <input className="input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        </Field>
        <Field label="Details">
          <textarea className="input min-h-[80px]" value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} placeholder="What to check, who to call, when to report back" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Priority">
            <select className="input" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
              {["low", "normal", "high", "urgent"].map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due (IST)">
            <input type="datetime-local" className="input" value={form.due} onChange={(event) => setForm({ ...form, due: event.target.value })} />
          </Field>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
        <button type="button" className="btn btn-gold" disabled={busy === "assign" || !form.assignedTo || form.title.trim().length < 3} onClick={() => void save()}>
          {busy === "assign" ? <Spinner /> : <ClipboardPlus size={14} />} Assign
        </button>
      </div>
    </Modal>
  );
}

export function AssignButton({ title, entity, entityId, link, compact }: { title: string; entity: "captain" | "traveller" | "trip" | "booking" | "ticket" | "safety" | "payout" | "other"; entityId?: string; link?: string; compact?: boolean }) {
  const { can } = useAdmin();
  const [open, setOpen] = useState(false);
  if (!can("tasks.assign")) return null;
  return (
    <>
      <button type="button" className={`btn ${compact ? "px-2 py-1 text-[11px]" : ""}`} onClick={() => setOpen(true)}>
        <ClipboardPlus size={compact ? 12 : 14} className="text-sky" /> Assign
      </button>
      {open ? <AssignModal title={title} entity={entity} entityId={entityId} link={link} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
