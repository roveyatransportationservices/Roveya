"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { PageHead, useAdmin } from "@/components/Shell";
import { Empty, Field, Panel, Spinner, useAction, useFeedback } from "@/components/ui";
import { api, useData } from "@/lib/client";
import { when } from "@/lib/format";

type History = { id: number; admin_email: string | null; detail: { title?: string; body?: string; audience?: string; people?: number; devices?: number }; at: string };

// The last two reach every phone at once, so they need the "Send to everyone" permission.
const AUDIENCES: { key: string; name: string; help: string; everyone?: boolean }[] = [
  { key: "person", name: "One person", help: "A single rider or Vado, found by mobile number" },
  { key: "trip", name: "One trip", help: "The Vado and every confirmed rider on a carpool trip" },
  { key: "travellers_all", name: "All riders", help: "Every rider with the ROVEYA app installed", everyone: true },
  { key: "captains_all", name: "All Vado", help: "Every Vado with the ROVEYA Captain app installed", everyone: true },
];

export default function NotifyPage() {
  const { can } = useAdmin();
  const { ask, toast } = useFeedback();
  const { busy, run } = useAction();
  const { data, reload } = useData<{ history: History[] }>("/notify");
  const delivery = useData<{ pendingSchema: boolean; events: { event_key: string; kind: string; channel: string; audience: string; status: string; attempts: number; last_error: string | null; created_at: string }[] }>("/communications");
  const audiences = AUDIENCES.filter((item) => !item.everyone || can("notify.broadcast"));
  const [audience, setAudience] = useState("person");
  const [app, setApp] = useState<"rider" | "captain">("rider");
  const [phone, setPhone] = useState("");
  const [trip, setTrip] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const send = async () => {
    const who = audience === "person" ? `${app === "rider" ? "rider" : "Vado"} ${phone}` : (AUDIENCES.find((item) => item.key === audience)?.name ?? "").toLowerCase();
    if (!(await ask({ title: `Send to ${who}?`, body: `“${title}” · ${body}`, confirm: "Send now" }))) return;
    const target = audience === "person" ? { app, phone } : audience === "trip" ? { tripCode: trip.trim() } : {};
    const result = await run("send", () => api<{ people: number; devices: number }>("/notify", { body: { audience, ...target, title, body } }));
    if (result) {
      toast(`Sent to ${result.people} people on ${result.devices} phones.`);
      setTitle("");
      setBody("");
      void reload();
    }
  };

  return (
    <>
      <PageHead title="Notifications" sub="Push messages straight to the ROVEYA app (riders) and the ROVEYA Captain app (Vado). Every message is recorded with your name." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="New notification">
          <div className="space-y-4">
            <Field label="Send to">
              <div className="grid gap-2">
                {audiences.map((item) => (
                  <label key={item.key} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${audience === item.key ? "border-gold/60 bg-gold/5" : "border-line"}`}>
                    <input type="radio" className="mt-1 accent-[#D6A000]" checked={audience === item.key} onChange={() => setAudience(item.key)} />
                    <span>
                      <span className="block text-[13px] font-medium">{item.name}</span>
                      <span className="block text-[11px] muted">{item.help}</span>
                    </span>
                  </label>
                ))}
              </div>
              {audiences.length < AUDIENCES.length ? <p className="mt-2 text-[11px] muted">Sending to all riders or all Vado needs the “Send to everyone” permission from the CEO.</p> : null}
            </Field>
            {audience === "person" ? (
              <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
                <Field label="Who">
                  <select className="input" value={app} onChange={(event) => setApp(event.target.value as "rider" | "captain")}>
                    <option value="rider">Rider</option>
                    <option value="captain">Vado</option>
                  </select>
                </Field>
                <Field label="Mobile number">
                  <input className="input" inputMode="numeric" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="9000011102" />
                </Field>
              </div>
            ) : null}
            {audience === "trip" ? (
              <Field label="Trip code">
                <input className="input uppercase" value={trip} onChange={(event) => setTrip(event.target.value.toUpperCase())} placeholder="RVT-50002" />
              </Field>
            ) : null}
            <Field label="Title" hint={`${title.length}/60`}>
              <input className="input" maxLength={60} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Heavy rain on NH65" />
            </Field>
            <Field label="Message" hint={`${body.length}/180`}>
              <textarea className="input min-h-[90px]" maxLength={180} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Drive slowly and keep headlights on. Call the desk if you need help." />
            </Field>
            <div className="rounded-lg border border-line bg-night p-3">
              <p className="text-[10px] uppercase tracking-widest muted">Preview</p>
              <p className="mt-1 text-[13px] font-semibold">{title || "Title"}</p>
              <p className="text-[12px] text-cream/70">{body || "Message"}</p>
            </div>
            <div className="flex justify-end">
              <button type="button" className="btn btn-gold" disabled={Boolean(busy) || title.trim().length < 3 || body.trim().length < 3 || (audience === "trip" && trip.trim().length < 5) || (audience === "person" && phone.length !== 10)} onClick={() => void send()}>
                {busy ? <Spinner /> : <Send size={14} />} Send
              </button>
            </div>
          </div>
        </Panel>
        <Panel title="Sent recently">
          {data?.history.length ? (
            <ul className="divide-y divide-line">
              {data.history.map((item) => (
                <li key={item.id} className="py-3 text-[13px]">
                  <p className="font-medium">{item.detail.title}</p>
                  <p className="text-[12px] text-cream/70">{item.detail.body}</p>
                  <p className="mt-1 text-[11px] muted">
                    {when(item.at)} · {item.admin_email} · {item.detail.people ?? 0} people, {item.detail.devices ?? 0} phones
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="Nothing sent yet." />
          )}
        </Panel>
      </div>
      <Panel title="Delivery">
        {delivery.data?.pendingSchema ? <p className="text-[13px] text-cream/70">Delivery records are waiting for the communication tables to be approved. OTP codes, keys, and phone tokens are not shown here.</p> : null}
        {delivery.data?.events.length ? (
          <ul className="divide-y divide-line">
            {delivery.data.events.map((item) => (
              <li key={item.event_key} className="py-3 text-[13px]">
                <p className="font-medium">{item.kind}</p>
                <p className="text-[12px] text-cream/70">{item.audience} · {item.channel} · {item.status} · tries {item.attempts}</p>
                <p className="mt-1 text-[11px] muted">{when(item.created_at)}{item.last_error ? ` · ${item.last_error}` : ""}</p>
              </li>
            ))}
          </ul>
        ) : delivery.data?.pendingSchema ? null : (
          <Empty text="No delivery records yet." />
        )}
      </Panel>
    </>
  );
}
