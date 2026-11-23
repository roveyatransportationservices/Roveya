"use client";

import Link from "next/link";
import { MapPin } from "lucide-react";
import { Chips, Toolbar, useList } from "@/components/list";
import { AssignButton, CallButton } from "@/components/actions";
import { PageHead, useAdmin } from "@/components/Shell";
import { Badge, Empty, Failure, Loading, Pager, Panel, useAction, useFeedback } from "@/components/ui";
import { api } from "@/lib/client";
import { ago, label, route, when } from "@/lib/format";

type Incident = {
  id: string;
  code: string;
  kind: string;
  app: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  user_note: string | null;
  notes: string | null;
  contacts_notified: number;
  desk_notified: number;
  trip_id: string | null;
  booking_id: string | null;
  created_at: string;
  person: { id: string; name: string; phone: string; kind: string } | null;
  trip: { id: string; code: string; from_city: string; to_city: string } | null;
  escalation_level?: number;
  escalated_at?: string | null;
  escalationCalls?: { level: number; name: string; status: string; error: string | null; created_at: string }[];
};

const CALL_STATUS: Record<string, string> = { queued: "waiting to ring", calling: "ringing", placed: "rang", failed: "call failed", not_configured: "not rung, Exotel not set up" };

export default function SafetyPage() {
  const { admin, can } = useAdmin();
  const desk = admin.workspace === "support_desk";
  const { ask } = useFeedback();
  const { busy, run } = useAction();
  const list = useList<{ incidents: Incident[]; total: number; size: number }>("/safety", { status: "active", kind: "" }, 15000);
  const rows = list.data?.incidents ?? [];

  const update = async (incident: Incident, status: string) => {
    const note = await ask({ title: `${label(status)} · ${incident.code}`, body: "Add what you did. It is saved on the alert with your name and time.", confirm: "Save", input: { label: "Note", placeholder: "Called the traveller, all fine", required: status !== "acknowledged" } });
    if (!note) return;
    const done = await run(incident.id, () => api(`/safety/${incident.id}`, { method: "PATCH", body: { status, note: note === "yes" ? undefined : note } }), "Alert updated.");
    if (done) void list.reload();
  };

  return (
    <>
      <PageHead title="Safety & SOS" sub="SOS presses and automatic route, stop and speed alerts. Refreshes every 15 seconds." />
      <Toolbar>
        <Chips
          value={list.filters.status ?? ""}
          onChange={(value) => list.setFilter("status", value)}
          options={[
            ["active", "Open now"],
            ["resolved", "Resolved"],
            ["false_alarm", "False alarms"],
            ["", "All"],
          ]}
        />
        <Chips
          value={list.filters.kind ?? ""}
          onChange={(value) => list.setFilter("kind", value)}
          options={[
            ["", "Every kind"],
            ["sos", "SOS"],
            ["deviation", "Off route"],
            ["long_stop", "Long stop"],
            ["speeding", "Speeding"],
          ]}
        />
      </Toolbar>
      {list.error ? (
        <Failure text={list.error} retry={list.reload} />
      ) : list.loading && !list.data ? (
        <Loading rows={6} />
      ) : rows.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((incident) => (
            <Panel key={incident.id} className={incident.status === "open" && incident.kind === "sos" ? "border-danger/50" : ""}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 font-semibold">
                    <span className={incident.kind === "sos" ? "text-danger" : "text-amber"}>{incident.kind === "sos" ? "SOS" : label(incident.kind)}</span>
                    <span className="text-[11px] muted">{incident.code}</span>
                  </p>
                  <p className="text-[11px] muted">
                    {when(incident.created_at)} · {ago(incident.created_at)} · from {incident.app}
                  </p>
                </div>
                <Badge value={incident.status} />
              </div>
              <div className="mt-3 space-y-1 text-[13px]">
                {incident.person ? (
                  <p>
                    <Link href={desk ? `/desk/lookup?${incident.person.kind === "Captain" ? "vado" : "rider"}=${incident.person.id}` : incident.person.kind === "Captain" ? `/captains/${incident.person.id}` : `/travellers/${incident.person.id}`} className="text-sky hover:underline">
                      {incident.person.name}
                    </Link>{" "}
                    · {incident.person.phone}
                  </p>
                ) : null}
                {incident.trip ? (
                  <p>
                    <Link href={desk ? `/desk/lookup?q=${incident.trip.code}` : `/trips/${incident.trip.id}`} className="text-gold hover:underline">
                      {incident.trip.code}
                    </Link>{" "}
                    · {route(incident.trip.from_city, incident.trip.to_city)}
                  </p>
                ) : null}
                {incident.user_note ? <p className="text-cream/80">“{incident.user_note}”</p> : null}
                {incident.latitude !== null && incident.longitude !== null ? (
                  <a className="inline-flex items-center gap-1 text-xs text-sky hover:underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${incident.latitude}&mlon=${incident.longitude}#map=16/${incident.latitude}/${incident.longitude}`}>
                    <MapPin size={12} /> {incident.latitude.toFixed(5)}, {incident.longitude.toFixed(5)}
                  </a>
                ) : null}
                <p className="text-[11px] muted">
                  Contacts texted {incident.contacts_notified} · desk phones {incident.desk_notified}
                </p>
                {incident.escalation_level ? (
                  <div className="mt-2 rounded border border-danger/40 bg-danger/10 p-2.5 text-[12px]">
                    <p className="font-semibold text-danger">
                      Not picked up in time · escalated {incident.escalation_level === 1 ? "once" : `${incident.escalation_level} times`}
                      {incident.escalated_at ? ` · last ${ago(incident.escalated_at)}` : ""}
                    </p>
                    {incident.escalationCalls?.length ? (
                      <ul className="mt-1 space-y-0.5 text-[11px] text-cream/80">
                        {incident.escalationCalls.map((call, index) => (
                          <li key={index}>
                            Round {call.level} · {call.name}: {CALL_STATUS[call.status] ?? call.status}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-[11px] text-cream/80">No on-call people are set. The CEO adds them in Settings.</p>
                    )}
                  </div>
                ) : null}
                {incident.notes ? <pre className="mt-2 whitespace-pre-wrap rounded bg-night p-2.5 font-sans text-[11px] text-cream/70">{incident.notes}</pre> : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-3">
                {incident.person ? <CallButton phone={incident.person.phone} name={incident.person.name} kind={incident.person.kind === "Captain" ? "Captain" : "Traveller"} entity="safety" entityId={incident.id} compact /> : null}
                <AssignButton title={`Handle ${incident.code} · ${incident.kind === "sos" ? "SOS" : label(incident.kind)}`} entity="safety" entityId={incident.id} link="/safety" compact />
              </div>
              {can("safety.respond") && (incident.status === "open" || incident.status === "acknowledged") ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {incident.status === "open" ? (
                    <button type="button" className="btn px-2.5 py-1 text-[11px]" disabled={busy === incident.id} onClick={() => void update(incident, "acknowledged")}>
                      Acknowledge
                    </button>
                  ) : null}
                  <button type="button" className="btn px-2.5 py-1 text-[11px] text-success" disabled={busy === incident.id} onClick={() => void update(incident, "resolved")}>
                    Resolved
                  </button>
                  <button type="button" className="btn px-2.5 py-1 text-[11px]" disabled={busy === incident.id} onClick={() => void update(incident, "false_alarm")}>
                    False alarm
                  </button>
                </div>
              ) : null}
            </Panel>
          ))}
        </div>
      ) : (
        <Panel>
          <Empty text="No alerts here. All quiet." />
        </Panel>
      )}
      {list.data ? <Pager page={list.page} size={list.data.size} total={list.data.total} onPage={list.setPage} /> : null}
    </>
  );
}
