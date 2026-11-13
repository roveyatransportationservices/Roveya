"use client";

import { useCallback, useEffect, useState } from "react";
import { desk } from "@/lib/desk-api";
import { formatMobile } from "@/lib/format";
import { TripDetail } from "./Trips";
import { Act, Badge, Block, Drawer, Facts, Grid, Pills, Search, ago, inr, useDebounced, when, type Row } from "./ui";

export function SupportSection({ ceo, onNotice }: { ceo: boolean; onNotice: (text: string) => void }) {
  const [status, setStatus] = useState("active");
  const [app, setApp] = useState("all");
  const [query, setQuery] = useState("");
  const q = useDebounced(query);
  const [tickets, setTickets] = useState<Row[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams({ q });
    if (status !== "all") params.set("status", status);
    if (app !== "all") params.set("app", app);
    desk<{ tickets: Row[] }>(`/support?${params.toString()}`)
      .then((result) => setTickets(result.tickets))
      .catch((error: Error) => onNotice(error.message));
  }, [status, app, q, onNotice]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <Search value={query} onChange={setQuery} placeholder="Ticket, topic, or ride ID" />
        <div className="flex flex-wrap gap-3">
          <Pills value={status} onChange={setStatus} options={[["active", "Needs us"], ["open", "Waiting on desk"], ["pending", "Waiting on them"], ["resolved", "Resolved"], ["all", "All"]]} />
          <Pills value={app} onChange={setApp} options={[["all", "Everyone"], ["rider", "Passengers"], ["captain", "Captains"]]} />
        </div>
      </div>
      <Grid
        head={["Ticket", "From", "Topic", "Priority", "Status", "Last message"]}
        empty="The support queue is clear."
        onOpen={(index) => setOpen(tickets[index].id)}
        rows={tickets.map((ticket) => [
          <div key="c">
            <p className="font-medium">{ticket.code}</p>
            <p className="text-xs text-[#F6F1DC]/45">{ticket.trip_code ?? "No ride"}</p>
          </div>,
          ticket.person ? (
            <div key="p">
              <p>{ticket.person.name}</p>
              <p className="text-xs text-[#F6F1DC]/45">{ticket.person.kind} · {formatMobile(ticket.person.phone)}</p>
            </div>
          ) : (
            ticket.app
          ),
          ticket.topic,
          <Badge key="pr" value={ticket.priority} tone={ticket.priority === "urgent" || ticket.priority === "high" ? "good" : undefined} />,
          <Badge key="s" value={ticket.status === "open" ? "Waiting on desk" : ticket.status === "pending" ? "Waiting on them" : ticket.status} />,
          ago(ticket.last_message_at),
        ])}
      />
      {open ? <TicketDetail id={open} ceo={ceo} onNotice={onNotice} onClose={() => setOpen(null)} onChanged={load} /> : null}
    </div>
  );
}

function TicketDetail({ id, ceo, onClose, onNotice, onChanged }: { id: string; ceo: boolean; onClose: () => void; onNotice: (text: string) => void; onChanged: () => void }) {
  const [data, setData] = useState<Row | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [trip, setTrip] = useState<string | null>(null);

  useEffect(() => {
    desk<Row>(`/support/${id}`)
      .then(setData)
      .catch((error: Error) => onNotice(error.message));
  }, [id, onNotice]);

  const update = async (body: Row) => {
    setBusy(true);
    try {
      setData(await desk<Row>(`/support/${id}`, { body }));
      setReply("");
      onNotice("");
      onChanged();
    } catch (error) {
      onNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <Drawer title="Loading ticket…" onClose={onClose}><p className="text-sm text-[#F6F1DC]/55">One moment.</p></Drawer>;
  const ticket = data.ticket as Row;

  return (
    <Drawer
      kicker={`${ticket.code} · ${ticket.app === "captain" ? "Captain" : "Passenger"} · ${ticket.status}`}
      title={ticket.topic}
      onClose={onClose}
      actions={
        <>
          <Act label="Assign to me" quiet disabled={busy} onClick={() => void update({ assignToMe: true })} />
          <Act label="Mark resolved" quiet disabled={busy} onClick={() => void update({ status: "resolved" })} />
          <Act label="Close" quiet disabled={busy} onClick={() => void update({ status: "closed" })} />
          {ticket.person ? <a className="btn-quiet" href={`tel:+91${ticket.person.phone}`}>Call {formatMobile(ticket.person.phone)}</a> : null}
        </>
      }
    >
      <Facts
        items={[
          ["From", ticket.person ? `${ticket.person.name} · ${ticket.person.kind}` : "—"],
          ["Opened", when(ticket.created_at)],
          ["Ride", data.trip ? <button key="t" type="button" className="text-[#E0B23A] underline" onClick={() => setTrip(data.trip.id)}>{data.trip.code} · {inr(data.trip.payable)} · {data.trip.status}</button> : (ticket.trip_code ?? "—")],
          [
            "Priority",
            <select key="p" className="field py-2" value={ticket.priority} disabled={busy} onChange={(event) => void update({ priority: event.target.value })}>
              {["low", "normal", "high", "urgent"].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>,
          ],
        ]}
      />
      <Block title="Conversation">
        <div className="space-y-3">
          {(data.messages as Row[]).map((message) => (
            <div key={message.id} className={`max-w-[85%] rounded-2xl border px-4 py-3 text-sm leading-6 ${message.author === "staff" ? "ml-auto border-[#D6A000]/40 bg-[#2A1220]" : "border-[#D6A000]/15 bg-[#1C0A14]"}`}>
              <p className="text-[10px] uppercase tracking-[0.16em] text-[#D6A000]">
                {message.author === "staff" ? `Desk · ${message.admin_users?.name ?? "ROVEYA"}` : ticket.person?.name ?? "Them"} · {when(message.created_at)}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{message.body}</p>
            </div>
          ))}
        </div>
      </Block>
      {ticket.status !== "closed" ? (
        <form
          className="panel grid gap-3 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (reply.trim()) void update({ message: reply.trim() });
          }}
        >
          <textarea value={reply} onChange={(event) => setReply(event.target.value)} rows={4} placeholder="Reply. They get it in the app and as a notification." className="field" />
          <div className="flex flex-wrap gap-2">
            <button className="btn" disabled={busy || !reply.trim()}>Send reply</button>
            <button type="button" className="btn-quiet" disabled={busy || !reply.trim()} onClick={() => void update({ message: reply.trim(), status: "resolved" })}>Send and resolve</button>
          </div>
        </form>
      ) : null}
      {trip ? <TripDetail id={trip} ceo={ceo} onNotice={onNotice} onClose={() => setTrip(null)} /> : null}
    </Drawer>
  );
}
