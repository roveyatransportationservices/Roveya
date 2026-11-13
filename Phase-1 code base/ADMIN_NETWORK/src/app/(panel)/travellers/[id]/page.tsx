"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";
import { AssignButton, CallButton } from "@/components/actions";
import { PageHead, useAdmin } from "@/components/Shell";
import { WalletAdjust } from "@/components/WalletAdjust";
import { Avatar, Badge, Empty, Failure, Field, Loading, Modal, Panel, Row, Spinner, useAction } from "@/components/ui";
import { api, useData } from "@/lib/client";
import { dateOnly, label, route, rs, when } from "@/lib/format";
import { SERVICE_INFO, serviceOfVehicle, type ServiceKey } from "@/lib/services";

type Detail = {
  traveller: { user_id: string; name: string; phone: string; email: string | null; created_at: string };
  walletPaise: number | null;
  services: { key: ServiceKey; orders: number; completed: number; spentPaise: number }[];
  rides: { id: string; code: string; vehicle: string; status: string; pickup: string; drop: string; owedPaise: number; payment: string; paymentStatus: string; requestedAt: string }[];
  bookings: { id: string; pnr: string; status: string; trip_code: string; from_city: string; to_city: string; depart_at: string; seats: number; paid_paise: number; refund_paise: number; created_at: string }[];
  ledger: { id: number; kind: string; amount_paise: number; note: string | null; created_at: string }[];
  contacts: { id: string; name: string; phone: string; relation: string | null }[];
  tickets: { id: string; code: string; topic: string; status: string; created_at: string }[];
  payments: { id: string; purpose: string; amount_paise: number; status: string; created_at: string }[];
  stats: { bookings: number; spentPaise: number; refundsPaise: number };
};

export default function TravellerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useAdmin();
  const { data, error, loading, reload, setData } = useData<Detail>(`/travellers/${id}`);
  const [editing, setEditing] = useState(false);

  if (error) return <Failure text={error} retry={reload} />;
  if (loading || !data) return <Loading rows={10} />;
  const p = data.traveller;

  return (
    <>
      <Link href={`/riders/${data.services.find((item) => item.orders)?.key ?? "bike"}`} className="mb-3 inline-flex items-center gap-1.5 text-xs muted hover:text-gold">
        <ArrowLeft size={14} /> ROVEYA Riders
      </Link>
      <PageHead
        title={p.name}
        sub={`${p.phone} · joined ${dateOnly(p.created_at)}`}
        actions={
          <>
            <CallButton phone={p.phone} name={p.name} kind="Traveller" entity="traveller" entityId={id} />
            <AssignButton title={`Follow up with traveller ${p.name}`} entity="traveller" entityId={id} link={`/travellers/${id}`} />
            {can("travellers.edit") ? (
              <button type="button" className="btn" onClick={() => setEditing(true)}>
                <Pencil size={14} /> Edit
              </button>
            ) : null}
            {can("money.wallets") && data.walletPaise !== null ? <WalletAdjust ownerId={id} name={p.name} balance={data.walletPaise} onDone={() => void reload()} /> : null}
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Profile">
          <div className="mb-3 flex items-center gap-3">
            <Avatar name={p.name} size={44} />
            <div>
              <p className="font-semibold">{p.name}</p>
              <p className="text-xs muted">{p.email ?? "No email"}</p>
            </div>
          </div>
          {data.walletPaise !== null ? <Row label="ROVEYA Cash" value={rs(data.walletPaise)} tone="font-semibold text-gold" /> : null}
          {data.services.map((item) => (
            <Row key={item.key} label={SERVICE_INFO[item.key].name} value={item.orders ? `${item.completed}/${item.orders} · ${rs(item.spentPaise)}` : <span className="muted">Not used</span>} />
          ))}
          <Row label="Seat refunds received" value={rs(data.stats.refundsPaise)} />
          <div className="my-2 border-t border-line" />
          <p className="mb-1 text-[11px] muted">Emergency contacts</p>
          {data.contacts.length ? data.contacts.map((contact) => <Row key={contact.id} label={`${contact.name}${contact.relation ? ` · ${contact.relation}` : ""}`} value={<span className="flex items-center gap-2">{contact.phone} <CallButton phone={contact.phone} name={contact.name} kind="Contact" entity="traveller" entityId={id} compact /></span>} />) : <p className="text-[13px] muted">None added.</p>}
        </Panel>

        <Panel title="Bike, auto and taxi rides" className="lg:col-span-2" pad={false}>
          {data.rides.length ? (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Ride</th>
                    <th>Pickup → drop</th>
                    <th>Requested</th>
                    <th>Fare</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rides.map((ride) => (
                    <tr key={ride.id}>
                      <td>
                        <Link href={`/bookings/${serviceOfVehicle(ride.vehicle)}/${ride.id}`} className="font-semibold text-gold hover:underline">
                          {ride.code}
                        </Link>
                        <span className="block text-[11px] muted">{SERVICE_INFO[serviceOfVehicle(ride.vehicle)].name}</span>
                      </td>
                      <td>
                        {ride.pickup} <span className="muted">→ {ride.drop}</span>
                      </td>
                      <td className="muted">{when(ride.requestedAt)}</td>
                      <td className="tabular-nums">
                        {rs(ride.owedPaise)}
                        <span className="block text-[11px] capitalize muted">
                          {ride.payment} · {label(ride.paymentStatus)}
                        </span>
                      </td>
                      <td>
                        <Badge value={ride.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5">
              <Empty text="No bike, auto or taxi rides yet." />
            </div>
          )}
        </Panel>

        <Panel title="Carpool seat bookings" className="lg:col-span-2" pad={false}>
          {data.bookings.length ? (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>PNR</th>
                    <th>Route</th>
                    <th>Departs</th>
                    <th>Seats</th>
                    <th>Paid</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bookings.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Link href={`/bookings/carpool/${row.id}`} className="font-semibold text-gold hover:underline">
                          {row.pnr}
                        </Link>
                      </td>
                      <td>
                        {route(row.from_city, row.to_city)} <span className="muted">· {row.trip_code}</span>
                      </td>
                      <td className="muted">{when(row.depart_at)}</td>
                      <td>{row.seats}</td>
                      <td className="tabular-nums">
                        {rs(row.paid_paise)}
                        {row.refund_paise ? <span className="block text-[11px] text-amber">refund {rs(row.refund_paise)}</span> : null}
                      </td>
                      <td>
                        <Badge value={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5">
              <Empty text="No bookings yet." />
            </div>
          )}
        </Panel>

        <Panel title="ROVEYA Cash history" className={data.walletPaise === null ? "hidden" : "lg:col-span-2"} pad={false}>
          {data.ledger.length ? (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {data.ledger.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 px-5 py-3 text-[13px]">
                  <span>
                    {label(entry.kind)}
                    <span className="block text-[11px] muted">
                      {when(entry.created_at)}
                      {entry.note ? ` · ${entry.note}` : ""}
                    </span>
                  </span>
                  <span className={`tabular-nums ${entry.amount_paise < 0 ? "text-danger" : "text-success"}`}>{rs(entry.amount_paise)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <Empty text="No wallet movements yet." />
            </div>
          )}
        </Panel>

        <Panel title="Payments and tickets">
          {data.payments.map((payment) => (
            <Row key={payment.id} label={`${label(payment.purpose)} · ${when(payment.created_at)}`} value={<span className="flex items-center gap-2">{rs(payment.amount_paise)} <Badge value={payment.status} /></span>} />
          ))}
          {data.tickets.map((ticket) => (
            <Row key={ticket.id} label={`${ticket.code} · ${ticket.topic}`} value={<Link href={`/support?ticket=${ticket.id}`}><Badge value={ticket.status} /></Link>} />
          ))}
          {!data.payments.length && !data.tickets.length ? <Empty text="No payments or tickets." /> : null}
        </Panel>
      </div>
      {editing ? <EditTraveller id={id} traveller={p} onClose={() => setEditing(false)} onSaved={(next) => (setData(next), setEditing(false))} /> : null}
    </>
  );
}

function EditTraveller({ id, traveller, onClose, onSaved }: { id: string; traveller: Detail["traveller"]; onClose: () => void; onSaved: (detail: Detail) => void }) {
  const [name, setName] = useState(traveller.name);
  const [email, setEmail] = useState(traveller.email ?? "");
  const { busy, run } = useAction();
  const save = async () => {
    const next = await run("save", () => api<Detail>(`/travellers/${id}`, { method: "PATCH", body: { name, email } }), "Traveller saved.");
    if (next) onSaved(next);
  };
  return (
    <Modal title="Edit traveller" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Name">
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Email">
          <input className="input" value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <p className="text-[11px] muted">The mobile number is the traveller&apos;s login and can only change from the app.</p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
        <button type="button" className="btn btn-gold" disabled={busy === "save"} onClick={() => void save()}>
          {busy === "save" ? <Spinner /> : null} Save
        </button>
      </div>
    </Modal>
  );
}
