"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Headset, Loader2, MessageSquarePlus, Send, Star } from "lucide-react";
import { api } from "@/lib/api";

type DeskTicket = { id: string; code: string; topic: string; status: "open" | "pending" | "resolved" | "closed"; tripCode: string | null; createdAt: string; lastMessageAt: string };
type DeskMessage = { id: string | number; from: "you" | "desk"; agent: string | null; body: string; at: string };
type Conversation = { ticket: DeskTicket; messages: DeskMessage[]; feedback?: { stars: number; note: string | null } | null };

const TOPICS = [
  { label: "My booking or seats", hint: "Add your PNR if you have it, like RVY482100." },
  { label: "Refund or cancellation", hint: "Tell us the PNR and what you expected back." },
  { label: "Payment issue", hint: "Add the amount and the UPI or card reference if money left your account." },
  { label: "Captain or car", hint: "What happened, and on which trip." },
  { label: "Safety concern", hint: "If you are in danger right now, call 112 or use SOS in the ROVEYA app." },
  { label: "Women Zone", hint: "Tell us about the seat or trip." },
  { label: "Website problem", hint: "What you clicked and what went wrong." },
  { label: "Something else", hint: "Type your message below." },
];

const time = (iso: string) => new Date(iso).toLocaleString("en-IN", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

// Once the desk resolves a request, the traveller rates the help they got.
function RateDesk({ conversation, onSaved }: { conversation: Conversation; onSaved: (conversation: Conversation) => void }) {
  const given = conversation.feedback ?? null;
  const [stars, setStars] = useState(given?.stars ?? 0);
  const [note, setNote] = useState(given?.note ?? "");
  const [editing, setEditing] = useState(!given);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      onSaved(await api<Conversation>(`/support/tickets/${conversation.ticket.id}/feedback`, { body: { stars, note: note.trim() || undefined } }));
      setEditing(false);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!editing && given) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="flex w-full items-center gap-3 rounded-2xl border border-gold/15 px-4 py-3 text-left text-sm text-cream/60">
        <span className="tracking-widest text-gold">
          {"★".repeat(given.stars)}
          {"☆".repeat(5 - given.stars)}
        </span>
        Thanks for rating the ROVEYA desk. Click to change.
      </button>
    );
  }
  return (
    <div className="rounded-2xl border border-gold/15 bg-mist/40 p-4">
      <p className="text-sm font-semibold">How did the ROVEYA desk do?</p>
      <div className="mt-3 flex gap-2">
        {[1, 2, 3, 4, 5].map((value) => (
          <button key={value} type="button" aria-label={`${value} star${value > 1 ? "s" : ""}`} onClick={() => setStars(value)} className="text-gold">
            <Star size={26} fill={value <= stars ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
      <textarea value={note} onChange={(event) => setNote(event.target.value.slice(0, 400))} rows={2} placeholder="Anything we should know? (optional)" className="field mt-3 resize-none" />
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      <button type="button" disabled={!stars || saving} onClick={() => void save()} className="btn mt-3">
        {saving ? <Loader2 size={16} className="animate-spin" /> : null} Send rating
      </button>
    </div>
  );
}

export function deskOpen(at = new Date()) {
  const hour = new Date(at.getTime() + 330 * 60000).getUTCHours();
  return hour >= 5 && hour < 23;
}

export function DeskChat({ pnr }: { pnr?: string }) {
  const [tickets, setTickets] = useState<DeskTicket[] | null>(null);
  const [active, setActive] = useState<Conversation | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [topic, setTopic] = useState(pnr ? TOPICS[0].label : "");
  const [reference, setReference] = useState(pnr ?? "");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const list = useCallback(
    () =>
      api<{ tickets: DeskTicket[] }>("/support/tickets?app=rider")
        .then((result) => setTickets(result.tickets))
        .catch(() => setTickets([])),
    [],
  );

  useEffect(() => {
    void list();
  }, [list]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      api<Conversation>(`/support/tickets/${active.ticket.id}`)
        .then((next) => setActive((current) => (current?.ticket.id === next.ticket.id ? next : current)))
        .catch(() => undefined);
    }, 6000);
    return () => clearInterval(timer);
  }, [active?.ticket.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [active?.messages.length]);

  const open = async (id: string) => {
    setOpening(id);
    setError("");
    try {
      setActive(await api<Conversation>(`/support/tickets/${id}`));
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setOpening(null);
    }
  };

  const send = async () => {
    const message = text.trim();
    if (!message) return;
    setSending(true);
    setError("");
    try {
      if (active) {
        setActive(await api<Conversation>(`/support/tickets/${active.ticket.id}`, { body: { message } }));
      } else {
        const ref = reference.trim().toUpperCase();
        if (ref && !/^RVY\d{4,10}$/.test(ref)) throw new Error("Check the PNR. It looks like RVY482100.");
        const { ticket } = await api<{ ticket: DeskTicket }>("/support/tickets", { body: { app: "rider", topic: topic || "Something else", message, ...(ref ? { pnr: ref } : null) } });
        setActive(await api<Conversation>(`/support/tickets/${ticket.id}`));
        void list();
      }
      setText("");
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setSending(false);
    }
  };

  const composer = (
    <div className="border-t border-gold/10 p-4">
      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
      <div className="flex items-end gap-3">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder={active ? "Write a reply" : "Tell us what happened"}
          className="field min-h-[52px] resize-none"
        />
        <button type="button" disabled={sending || !text.trim() || (!active && !topic)} onClick={() => void send()} className="btn h-[52px] w-[52px] shrink-0 p-0" aria-label="Send">
          {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="card grid min-h-[560px] overflow-hidden md:grid-cols-[300px_1fr]">
      <aside className={`border-gold/10 md:border-r ${active ? "hidden md:block" : ""}`}>
        <div className="flex items-center justify-between border-b border-gold/10 p-4">
          <p className="font-semibold">Your conversations</p>
          <button type="button" onClick={() => setActive(null)} className="flex items-center gap-1.5 text-sm text-gold">
            <MessageSquarePlus size={16} /> New
          </button>
        </div>
        <div className="max-h-[500px] space-y-1 overflow-y-auto p-2">
          {tickets === null ? (
            [0, 1, 2].map((index) => <div key={index} className="skeleton m-2 h-14" />)
          ) : tickets.length ? (
            tickets.map((ticket) => (
              <button key={ticket.id} type="button" onClick={() => void open(ticket.id)} className={`w-full rounded-2xl px-3 py-3 text-left transition hover:bg-mist ${active?.ticket.id === ticket.id ? "bg-mist" : ""}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{ticket.topic}</span>
                  {opening === ticket.id ? <Loader2 size={14} className="animate-spin text-gold" /> : <span className={`h-2 w-2 shrink-0 rounded-full ${ticket.status === "pending" ? "bg-gold" : ticket.status === "open" ? "bg-success" : "bg-cream/20"}`} />}
                </span>
                <span className="mt-0.5 block text-xs text-cream/45">
                  {ticket.code} · {time(ticket.lastMessageAt)}
                </span>
              </button>
            ))
          ) : (
            <p className="p-4 text-sm text-cream/50">No conversations yet.</p>
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-col">
        {active ? (
          <>
            <div className="flex items-center gap-3 border-b border-gold/10 p-4">
              <button type="button" onClick={() => setActive(null)} className="text-cream/60 md:hidden" aria-label="Back">
                <ArrowLeft size={18} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{active.ticket.topic}</p>
                <p className="text-xs text-cream/50">
                  {active.ticket.code}
                  {active.ticket.tripCode ? ` · ${active.ticket.tripCode}` : ""} · {active.ticket.status === "resolved" || active.ticket.status === "closed" ? "Resolved" : "Open"}
                </p>
              </div>
            </div>
            <div className="max-h-[440px] flex-1 space-y-3 overflow-y-auto p-5">
              {active.messages.map((message) => (
                <div key={message.id} className={`flex ${message.from === "you" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.from === "you" ? "rounded-br-md bg-gold text-night" : "rounded-bl-md bg-mist"}`}>
                    {message.from === "desk" ? <p className="mb-1 text-xs font-semibold text-gold">{message.agent ?? "ROVEYA desk"}</p> : null}
                    <p className="whitespace-pre-wrap">{message.body}</p>
                    <p className={`mt-1 text-[10px] ${message.from === "you" ? "text-night/60" : "text-cream/40"}`}>{time(message.at)}</p>
                  </div>
                </div>
              ))}
              {active.messages[active.messages.length - 1]?.from === "you" ? <p className="text-center text-xs text-cream/45">{deskOpen() ? "An agent usually replies within a few minutes." : "The desk opens at 5 AM. For safety, call 112 or use SOS in the app."}</p> : null}
              {active.ticket.status === "resolved" || active.ticket.status === "closed" ? <RateDesk key={active.ticket.id} conversation={active} onSaved={setActive} /> : null}
              <div ref={bottom} />
            </div>
            {composer}
          </>
        ) : (
          <>
            <div className="flex-1 p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gold/10 text-gold">
                  <Headset size={22} />
                </span>
                <div>
                  <p className="font-semibold">Chat with a real person</p>
                  <p className="flex items-center gap-1.5 text-xs text-cream/55">
                    <span className={`h-2 w-2 rounded-full ${deskOpen() ? "bg-success" : "bg-cream/30"}`} />
                    {deskOpen() ? "Desk is online, 5 AM to 11 PM" : "Desk opens at 5 AM. Leave a message."}
                  </p>
                </div>
              </div>
              <p className="mt-6 text-sm font-semibold">What is it about?</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {TOPICS.map((item) => (
                  <button key={item.label} type="button" className="chip" data-on={topic === item.label} onClick={() => setTopic(item.label)}>
                    {item.label}
                  </button>
                ))}
              </div>
              {topic ? <p className="mt-4 text-sm text-cream/55">{TOPICS.find((item) => item.label === topic)?.hint}</p> : null}
              <input className="field mt-4 max-w-xs uppercase" placeholder="PNR (optional)" value={reference} onChange={(event) => setReference(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 13))} />
            </div>
            {composer}
          </>
        )}
      </section>
    </div>
  );
}
