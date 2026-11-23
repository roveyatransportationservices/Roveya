"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, Pencil, Trash2, UserCheck } from "lucide-react";
import { AssignButton, CallButton } from "@/components/actions";
import { PageHead, useAdmin } from "@/components/Shell";
import { Badge, Empty, Failure, Field, Loading, Modal, Panel, Row, Spinner, useAction, useFeedback } from "@/components/ui";
import { api, useData } from "@/lib/client";
import { label, route, rs, when } from "@/lib/format";
import { collectedPaise, formatInrPaise } from "@/lib/refundPolicy";
import { bookingsTitle } from "@/lib/services";
import { ActivityPanel, type Activity } from "./shared";

type Stop = { id: string; name: string; landmark?: string; time?: string };
type Traveller = { seatId: string; name: string; age: number; gender: string };
type Detail = {
  booking: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  trip: Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  stops: { boarding: Stop[]; drops: Stop[] };
  seats: { seat_id: string; label: string; is_window: boolean; price_paise: number; state: string }[];
  rider: { id: string; name: string; phone: string } | null;
  riderWallet: number;
  captain: { id: string; name: string; phone: string } | null;
  ledger: { id: number; owner_id: string; kind: string; amount_paise: number; ref_type: string; note: string | null; created_at: string }[];
  payments: { id: string; amount_paise: number; status: string; razorpay_order_id: string | null; razorpay_payment_id: string | null; created_at: string }[];
  coupon: { code: string; title: string } | null;
  tickets: { id: string; code: string; topic: string; status: string }[];
  incidents: { id: string; code: string; kind: string; status: string }[];
  activity: Activity[];
  canDelete: boolean;
};

const PLATFORM = "00000000-0000-0000-0000-000000000001";
const stopText = (stop?: Stop | null) => (stop ? `${stop.name}${stop.time ? ` · ${stop.time}` : ""}${stop.landmark ? ` · ${stop.landmark}` : ""}` : "—");

export function CarpoolDetail({ id }: { id: string }) {
  const { can } = useAdmin();
  const router = useRouter();
  const { ask } = useFeedback();
  const { busy, run } = useAction();
  const [editing, setEditing] = useState(false);
  const { data, error, loading, reload, setData } = useData<Detail>(`/bookings/${id}`);

  if (error) return <Failure text={error} retry={reload} />;
  if (loading || !data) return <Loading rows={10} />;
  const b = data.booking;
  const travellers = (b.travellers ?? []) as Traveller[];
  const seatOf = new Map(data.seats.map((seat) => [seat.seat_id, seat]));
  const manage = can("bookings.manage");
  const upcoming = b.status === "confirmed" || b.status === "pending";
  const collected = collectedPaise({ walletPaise: b.wallet_collected_paise, gatewayPaise: b.gateway_collected_paise, deskPaise: b.desk_collected_paise });
  const deskRefund = b.status === "pending" ? "This booking is unpaid. Cancelling it refunds ₹0 and opens the seats." : `This is a desk cancellation. The traveller gets the money collected, ${formatInrPaise(collected)}, back. Passenger time bands are not used.`;

  const cancel = async () => {
    const reason = await ask({ title: `Cancel ${b.pnr}?`, body: deskRefund, confirm: "Cancel booking", danger: true, input: { label: "Reason (shown in the audit log)", placeholder: "Traveller called the desk", required: true } });
    if (!reason) return;
    const next = await run("cancel", () => api<Detail & { refundPaise: number }>(`/bookings/${id}`, { body: { action: "cancel", reason } }), "Booking cancelled and refunded.");
    if (next) setData(next);
  };

  const board = async () => {
    const next = await run("board", () => api<Detail>(`/bookings/${id}`, { body: { action: "board" } }), "Marked as boarded.");
    if (next) setData(next);
  };

  const remove = async () => {
    const reason = await ask({ title: `Delete ${b.pnr}?`, body: "The booking is removed for good and any held seats open again. The audit log keeps a copy.", confirm: "Delete booking", danger: true, input: { label: "Reason for the record", placeholder: "Test booking", required: true } });
    if (!reason) return;
    const done = await run("delete", () => api<{ ok: boolean }>(`/bookings/${id}?reason=${encodeURIComponent(reason)}`, { method: "DELETE" }), `${b.pnr} deleted.`);
    if (done) router.push("/bookings/carpool");
  };

  return (
    <>
      <Link href="/bookings/carpool" className="mb-3 inline-flex items-center gap-1.5 text-xs muted hover:text-gold">
        <ArrowLeft size={14} /> {bookingsTitle("carpool")}
      </Link>
      <PageHead
        title={`Booking ${b.pnr}`}
        sub={`${data.trip ? route(data.trip.from_city, data.trip.to_city) : ""} · booked ${when(b.created_at)}`}
        actions={
          <>
            <CallButton phone={b.phone} name={data.rider?.name} kind="Traveller" entity="booking" entityId={id} />
            {data.captain ? <CallButton phone={data.captain.phone} name={data.captain.name} kind="Captain" entity="booking" entityId={id} /> : null}
            <AssignButton title={`Follow up on booking ${b.pnr}`} entity="booking" entityId={id} link={`/bookings/carpool/${id}`} />
            {manage ? (
              <>
                {upcoming ? (
                  <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => setEditing(true)}>
                    <Pencil size={14} /> Edit
                  </button>
                ) : null}
                {b.status === "confirmed" && !b.boarded_at ? (
                  <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => void board()}>
                    {busy === "board" ? <Spinner /> : <UserCheck size={14} />} Mark boarded
                  </button>
                ) : null}
                {upcoming ? (
                  <button type="button" className="btn btn-danger" disabled={Boolean(busy)} onClick={() => void cancel()}>
                    {busy === "cancel" ? <Spinner /> : <Ban size={14} />} {b.status === "pending" ? "Cancel unpaid booking" : "Cancel and refund collected"}
                  </button>
                ) : null}
                {data.canDelete ? (
                  <button type="button" className="btn btn-danger" disabled={Boolean(busy)} onClick={() => void remove()}>
                    {busy === "delete" ? <Spinner /> : <Trash2 size={14} />} Delete
                  </button>
                ) : null}
              </>
            ) : null}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        <Panel title="Booking" action={<Badge value={b.status} />}>
          <Row label="PNR" value={<span className="font-semibold text-gold">{b.pnr}</span>} />
          <Row label="Seats" value={(b.seat_ids as string[]).map((seat) => seatOf.get(seat)?.label ?? seat).join(", ")} />
          <Row label="Boarding" value={stopText(b.boarding)} />
          <Row label="Drop" value={stopText(b.drop_point)} />
          <Row label="Contact" value={`${b.phone}${b.email ? ` · ${b.email}` : ""}`} />
          <Row label="Paid with" value={b.paid_with ?? "—"} />
          <Row label="Secure your trip" value={b.secured ? "Yes" : "No"} />
          {b.status === "pending" ? <Row label="Seats held until" value={when(b.hold_until)} /> : null}
          <Row label="Confirmed" value={when(b.confirmed_at)} />
          <Row label="Boarded" value={when(b.boarded_at)} />
          {b.cancelled_at ? <Row label="Cancelled" value={`${when(b.cancelled_at)} by ${b.cancelled_by}`} /> : null}
          {data.coupon ? <Row label="Coupon" value={<span className="text-gold">{data.coupon.code}</span>} /> : null}
        </Panel>

        <Panel title="Money">
          <Row label="Seat fare" value={rs(b.fare_paise)} />
          <Row label="GST on the booking fee" value={rs(b.gst_paise)} />
          <Row label="Secure your trip" value={rs(b.secure_paise)} />
          <Row label="Coupon discount" value={`− ${rs(b.discount_paise)}`} tone="text-amber" />
          <Row label="ROVEYA Cash used" value={rs(b.cash_paise)} />
          <Row label="Paid online / wallet / desk" value={rs(b.total_paise)} />
          <Row label="Collected" value={formatInrPaise(collected)} />
          {upcoming ? <Row label={b.status === "pending" ? "If the desk cancels" : "Desk cancellation refunds"} value={b.status === "pending" ? "₹0" : formatInrPaise(collected)} /> : null}
          <div className="my-2 border-t border-line" />
          <Row label="Total paid" value={rs(b.paid_paise)} tone="font-semibold" />
          {b.refund_paise ? <Row label="Refunded" value={rs(b.refund_paise)} tone="text-amber" /> : null}
          <div className="my-2 border-t border-line" />
          <Row label="Captain share" value={rs(b.captain_share_paise)} />
          <Row label="Commission" value={rs(b.commission_paise)} tone="text-sky" />
          <Row label="ROVEYA earns" value={rs(b.profit_paise)} tone="font-semibold text-gold" />
        </Panel>

        <Panel title="People and trip">
          {data.rider ? (
            <Row
              label="Traveller"
              value={
                <Link href={`/travellers/${data.rider.id}`} className="text-sky hover:underline">
                  {data.rider.name} · {data.rider.phone}
                </Link>
              }
            />
          ) : null}
          <Row label="Traveller wallet" value={rs(data.riderWallet)} />
          {data.captain ? (
            <Row
              label="Captain"
              value={
                <Link href={`/captains/${data.captain.id}`} className="text-sky hover:underline">
                  {data.captain.name} · {data.captain.phone}
                </Link>
              }
            />
          ) : null}
          {data.trip ? (
            <>
              <Row
                label="Trip"
                value={
                  <Link href={`/trips/${data.trip.id}`} className="text-sky hover:underline">
                    {data.trip.code}
                  </Link>
                }
              />
              <Row label="Departs" value={when(data.trip.depart_at)} />
              <Row label="Arrives" value={when(data.trip.arrive_at)} />
              <Row label="Car" value={`${data.trip.make_model} · ${data.trip.plate}`} />
              {data.trip.women_friendly ? <Row label="Women-friendly trip" value="Yes" /> : null}
              <Row label="Trip status" value={<Badge value={data.trip.status} />} />
            </>
          ) : null}
          {data.tickets.length || data.incidents.length ? <div className="my-2 border-t border-line" /> : null}
          {data.tickets.map((ticket) => (
            <Row key={ticket.id} label={`Ticket ${ticket.code}`} value={<Link href={`/support?ticket=${ticket.id}`} className="text-sky hover:underline">{ticket.topic}</Link>} />
          ))}
          {data.incidents.map((incident) => (
            <Row key={incident.id} label={`Alert ${incident.code}`} value={<Badge value={incident.status}>{label(incident.kind)}</Badge>} />
          ))}
        </Panel>

        <Panel title="Travellers" pad={false}>
          <table className="table">
            <thead>
              <tr>
                <th>Seat</th>
                <th>Name</th>
                <th>Age</th>
                <th>Gender</th>
              </tr>
            </thead>
            <tbody>
              {travellers.map((person) => {
                const seat = seatOf.get(person.seatId);
                return (
                  <tr key={person.seatId}>
                    <td className="font-semibold text-gold">
                      {seat?.label ?? person.seatId}
                      {seat?.is_window ? <span className="block text-[10px] font-normal muted">Window</span> : null}
                    </td>
                    <td>{person.name}</td>
                    <td>{person.age}</td>
                    <td className={person.gender === "Female" ? "text-rose" : ""}>{person.gender}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        <Panel title="Money trail" className="lg:col-span-2" pad={false}>
          {data.ledger.length || data.payments.length ? (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>What</th>
                    <th>Wallet</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="muted">{when(payment.created_at)}</td>
                      <td>
                        Razorpay payment <Badge value={payment.status} />
                        <p className="text-[11px] muted">{payment.razorpay_payment_id ?? payment.razorpay_order_id ?? payment.id}</p>
                      </td>
                      <td className="muted">Online</td>
                      <td className="text-right tabular-nums">{rs(payment.amount_paise)}</td>
                    </tr>
                  ))}
                  {data.ledger.map((entry) => (
                    <tr key={entry.id}>
                      <td className="muted">{when(entry.created_at)}</td>
                      <td>
                        {label(entry.kind)}
                        {entry.note ? <p className="text-[11px] muted">{entry.note}</p> : null}
                      </td>
                      <td className="muted">{entry.owner_id === PLATFORM ? "ROVEYA" : "Traveller"}</td>
                      <td className={`text-right tabular-nums ${entry.amount_paise < 0 ? "text-danger" : "text-success"}`}>{rs(entry.amount_paise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5">
              <Empty text="No money has moved for this booking yet." />
            </div>
          )}
        </Panel>

        <ActivityPanel entries={data.activity} className="lg:col-span-3" />
      </div>

      {editing ? <EditBooking detail={data} onClose={() => setEditing(false)} onSaved={(next) => (setData(next), setEditing(false))} /> : null}
    </>
  );
}

function EditBooking({ detail, onClose, onSaved }: { detail: Detail; onClose: () => void; onSaved: (next: Detail) => void }) {
  const b = detail.booking;
  const { busy, run } = useAction();
  const [phone, setPhone] = useState<string>(b.phone);
  const [email, setEmail] = useState<string>(b.email ?? "");
  const [people, setPeople] = useState<Traveller[]>((b.travellers ?? []) as Traveller[]);
  const [boardingId, setBoarding] = useState<string>(b.boarding?.id ?? "");
  const [dropId, setDrop] = useState<string>(b.drop_point?.id ?? "");
  const [reason, setReason] = useState("");
  const started = detail.trip?.status !== "scheduled";
  const seatLabel = (id: string) => detail.seats.find((seat) => seat.seat_id === id)?.label ?? id;

  const save = async () => {
    const body: Record<string, unknown> = { reason, travellers: people.map((person) => ({ seatId: person.seatId, name: person.name.trim(), age: Number(person.age) })) };
    if (phone !== b.phone) body.phone = phone;
    if (email !== (b.email ?? "")) body.email = email;
    if (boardingId !== b.boarding?.id) body.boardingId = boardingId;
    if (dropId !== b.drop_point?.id) body.dropId = dropId;
    const next = await run("save", () => api<Detail>(`/bookings/${b.id}`, { method: "PATCH", body }), "Booking updated.");
    if (next) onSaved(next);
  };

  return (
    <Modal title={`Edit ${b.pnr}`} onClose={onClose} wide locked={Boolean(busy)}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mobile on the ticket">
            <input className="input" inputMode="numeric" maxLength={10} value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Email">
            <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
        </div>
        <div className="space-y-2">
          <span className="label">Travellers</span>
          {people.map((person, index) => (
            <div key={person.seatId} className="grid grid-cols-[3rem_1fr_5rem_5rem] items-center gap-2">
              <span className="font-semibold text-gold">{seatLabel(person.seatId)}</span>
              <input className="input" value={person.name} onChange={(event) => setPeople((list) => list.map((item, at) => (at === index ? { ...item, name: event.target.value } : item)))} />
              <input className="input" inputMode="numeric" maxLength={2} value={String(person.age)} onChange={(event) => setPeople((list) => list.map((item, at) => (at === index ? { ...item, age: Number(event.target.value.replace(/\D/g, "")) || 0 } : item)))} />
              <span className={`text-[12px] ${person.gender === "Female" ? "text-rose" : "muted"}`}>{person.gender}</span>
            </div>
          ))}
          <p className="text-[11px] muted">Seats and genders stay as booked because they decide which seats are women-only. To change seats, cancel and book again.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Boarding point">
            <select className="input" value={boardingId} disabled={started} onChange={(event) => setBoarding(event.target.value)}>
              {detail.stops.boarding.map((stop) => (
                <option key={stop.id} value={stop.id}>
                  {stop.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Drop point">
            <select className="input" value={dropId} disabled={started} onChange={(event) => setDrop(event.target.value)}>
              {detail.stops.drops.map((stop) => (
                <option key={stop.id} value={stop.id}>
                  {stop.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Reason for the record">
          <input className="input" placeholder="Traveller called to fix the name" value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose} disabled={Boolean(busy)}>
          Close
        </button>
        <button type="button" className="btn btn-gold" disabled={reason.trim().length < 3 || Boolean(busy)} onClick={() => void save()}>
          {busy ? <Spinner /> : null} Save changes
        </button>
      </div>
    </Modal>
  );
}
