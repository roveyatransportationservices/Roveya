"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PhoneIncoming, Send, StickyNote } from "lucide-react";
import { AssignButton, CallButton } from "@/components/actions";
import { Chips, Toolbar, useList } from "@/components/list";
import { PageHead, useAdmin } from "@/components/Shell";
import { Badge, Empty, Failure, Field, Loading, Modal, Pager, Panel, Spinner, useAction } from "@/components/ui";
import { api, useData } from "@/lib/client";
import { ago, rs, when } from "@/lib/format";

type Ticket = { id: string; code: string; app: string; topic: string; status: string; priority: string; channel: string | null; trip_code: string | null; last_message_at: string; created_at: string; contact_email: string | null; contact_phone: string | null; person: { id: string; name: string; phone: string; kind: string } | null };
type Detail = { ticket: Ticket; messages: { id: number; author: string; body: string; channel: string | null; created_at: string }[]; booking: { id: string; pnr: string; status: string; seat_ids: string[]; total_paise: number; cash_paise: number } | null };

function Conversation({ id, onChange }: { id: string; onChange: () => void }) {
  const { admin, can } = useAdmin();
  const desk = admin.workspace === "support_desk";
  const { data, error, loading, reload, setData } = useData<Detail>(`/support/${id}`, 10000);
  const [text, setText] = useState("");
  const [note, setNote] = useState(false);
  const { busy, run } = useAction();
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => bottom.current?.scrollIntoView({ block: "nearest" }), [data?.messages.length]);

  if (error) return <Failure text={error} retry={reload} />;
  if (loading || !data) return <Loading rows={6} />;
  const t = data.ticket;

  const send = async (patch: { status?: string; priority?: string } = {}) => {
    const body = { ...(text.trim() ? { message: text.trim(), note } : {}), ...patch };
    const next = await run("send", () => api<Detail>(`/support/${id}`, { body }), text.trim() ? (note ? "Note saved." : "Reply sent.") : "Ticket updated.");
    if (next) {
      setData(next);
      setText("");
      onChange();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <p className="font-semibold">{t.topic}</p>
          <p className="text-[11px] muted">
            {t.code} · {t.app === "captain" ? "Vado app" : "Rider app"} · {t.channel ?? "chat"}
            {t.trip_code ? (
              <>
                {" · "}
                {desk ? (
                  <Link href={`/desk/lookup?q=${encodeURIComponent(t.trip_code)}`} className="text-sky hover:underline">
                    {t.trip_code}
                  </Link>
                ) : (
                  t.trip_code
                )}
              </>
            ) : null}
          </p>
          {t.person ? (
            <Link href={desk ? `/desk/lookup?${t.person.kind === "Captain" ? "vado" : "rider"}=${t.person.id}` : t.person.kind === "Captain" ? `/captains/${t.person.id}` : `/travellers/${t.person.id}`} className="text-xs text-sky hover:underline">
              {t.person.name} · {t.person.phone}
            </Link>
          ) : (
            <p className="text-xs muted">{t.contact_email ?? t.contact_phone ?? ""}</p>
          )}
          {data.booking ? (
            <Link href={desk ? `/desk/lookup?q=${data.booking.pnr}` : `/bookings/carpool/${data.booking.id}`} className="block text-xs text-gold hover:underline">
              {data.booking.pnr} · {data.booking.seat_ids.join(", ")} · {rs(data.booking.total_paise + data.booking.cash_paise)}
            </Link>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {t.person ? <CallButton phone={t.person.phone} name={t.person.name} kind={t.person.kind === "Captain" ? "Captain" : "Traveller"} entity="ticket" entityId={t.id} compact /> : t.contact_phone ? <CallButton phone={t.contact_phone} kind="Other" entity="ticket" entityId={t.id} compact /> : null}
          <AssignButton title={`Answer ${t.code} · ${t.topic}`} entity="ticket" entityId={t.id} link={`/support?ticket=${t.id}`} compact />
          <Badge value={t.priority} />
          {can("support.reply") ? (
            <select className="input w-auto py-1 text-xs" value={t.status} onChange={(event) => void send({ status: event.target.value })} aria-label="Status">
              {["open", "pending", "resolved", "closed"].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          ) : (
            <Badge value={t.status} />
          )}
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4" style={{ maxHeight: 460 }}>
        {data.messages.map((message) => (
          <div key={message.id} className={`flex ${message.author === "staff" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-lg px-3.5 py-2.5 text-[13px] ${message.channel === "note" ? "border border-dashed border-amber/50 bg-amber/10" : message.author === "staff" ? "bg-burgundy" : "bg-mist"}`}>
              {message.channel === "note" ? <p className="mb-0.5 text-[10px] font-semibold uppercase text-amber">Internal note</p> : null}
              <p className="whitespace-pre-wrap leading-5">{message.body}</p>
              <p className="mt-1 text-[10px] muted">{when(message.created_at)}</p>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {can("support.reply") ? (
        <div className="border-t border-line p-4">
          <textarea className="input min-h-[70px] resize-y" placeholder={note ? "Note for the team only" : "Reply to the traveller or captain"} value={text} onChange={(event) => setText(event.target.value)} />
          <div className="mt-2 flex items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs muted">
              <input type="checkbox" checked={note} onChange={(event) => setNote(event.target.checked)} className="accent-[#E8A15C]" />
              <StickyNote size={13} /> Internal note
            </label>
            <button type="button" className="btn btn-gold" disabled={busy === "send" || !text.trim()} onClick={() => void send()}>
              {busy === "send" ? <Spinner /> : <Send size={13} />} {note ? "Save note" : "Send reply"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LogCall({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const [form, setForm] = useState({ phone: "", topic: "", note: "", status: "resolved", pnr: "" });
  const { busy, run } = useAction();
  const save = async () => {
    const result = await run("call", () => api<{ ticket: { id: string } }>("/support/calls", { body: form }), "Call logged as a ticket.");
    if (result) onSaved(result.ticket.id);
  };
  return (
    <Modal title="Log a phone call" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Caller's mobile">
            <input className="input" inputMode="numeric" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value.replace(/\D/g, "").slice(0, 10) })} />
          </Field>
          <Field label="PNR (optional)">
            <input className="input uppercase" value={form.pnr} onChange={(event) => setForm({ ...form, pnr: event.target.value.toUpperCase() })} placeholder="RVY482100" />
          </Field>
        </div>
        <Field label="Topic">
          <input className="input" value={form.topic} onChange={(event) => setForm({ ...form, topic: event.target.value })} placeholder="Refund question" />
        </Field>
        <Field label="What they needed and what you did">
          <textarea className="input min-h-[90px]" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
        </Field>
        <Field label="Status">
          <select className="input" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
            <option value="resolved">Solved on the call</option>
            <option value="pending">Waiting on the caller</option>
            <option value="open">Needs follow-up</option>
          </select>
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
        <button type="button" className="btn btn-gold" disabled={busy === "call" || !/^[6-9]\d{9}$/.test(form.phone) || form.topic.trim().length < 2 || form.note.trim().length < 4} onClick={() => void save()}>
          {busy === "call" ? <Spinner /> : null} Save call
        </button>
      </div>
    </Modal>
  );
}

function SupportDesk() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useAdmin();
  const selected = params.get("ticket");
  const [logging, setLogging] = useState(false);
  const list = useList<{ tickets: Ticket[]; total: number; size: number }>("/support", { status: "active", app: "", kind: "" }, 30000);
  const rows = list.data?.tickets ?? [];

  return (
    <>
      <PageHead
        title="Support desk"
        sub="Chats, feedback, emails and phone calls from both apps."
        actions={
          can("support.reply") ? (
            <button type="button" className="btn btn-gold" onClick={() => setLogging(true)}>
              <PhoneIncoming size={14} /> Log a call
            </button>
          ) : null
        }
      />
      {logging ? (
        <LogCall
          onClose={() => setLogging(false)}
          onSaved={(id) => {
            setLogging(false);
            void list.reload();
            router.replace(`/support?ticket=${id}`);
          }}
        />
      ) : null}
      <Toolbar q={list.q} setQ={list.setQ} placeholder="Ticket code, topic or trip">
        <Chips
          value={list.filters.status ?? ""}
          onChange={(value) => list.setFilter("status", value)}
          options={[
            ["active", "Needs attention"],
            ["open", "Open"],
            ["pending", "Waiting on user"],
            ["resolved", "Resolved"],
            ["", "All"],
          ]}
        />
        <Chips
          value={list.filters.app ?? ""}
          onChange={(value) => list.setFilter("app", value)}
          options={[
            ["", "Both apps"],
            ["rider", "Travellers"],
            ["captain", "Captains"],
          ]}
        />
        <Chips
          value={list.filters.kind ?? ""}
          onChange={(value) => list.setFilter("kind", value)}
          options={[
            ["", "Every kind"],
            ["feedback", "Feedback"],
            ["call", "Calls"],
            ["email", "Emails"],
          ]}
        />
      </Toolbar>
      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
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
            <ul className="max-h-[640px] divide-y divide-line overflow-y-auto">
              {rows.map((ticket) => (
                <li key={ticket.id}>
                  <button type="button" onClick={() => router.replace(`/support?ticket=${ticket.id}`)} className={`w-full px-5 py-3.5 text-left transition hover:bg-mist/60 ${selected === ticket.id ? "bg-mist" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-medium">{ticket.topic}</span>
                      <Badge value={ticket.status} />
                    </div>
                    <p className="mt-0.5 truncate text-[11px] muted">
                      {ticket.code} · {ticket.person?.name ?? ticket.contact_email ?? ticket.contact_phone ?? "—"} · {ago(ticket.last_message_at)}
                    </p>
                    {ticket.priority === "urgent" ? <p className="mt-1 text-[10px] font-bold uppercase text-danger">Urgent</p> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="No tickets here." />
          )}
        </Panel>
        <Panel pad={false} className="min-h-[420px]">
          {selected ? <Conversation key={selected} id={selected} onChange={() => void list.reload()} /> : <Empty text="Pick a ticket to read the conversation." />}
        </Panel>
      </div>
      {list.data ? <Pager page={list.page} size={list.data.size} total={list.data.total} onPage={list.setPage} /> : null}
    </>
  );
}

export default function SupportPage() {
  return (
    <Suspense>
      <SupportDesk />
    </Suspense>
  );
}
