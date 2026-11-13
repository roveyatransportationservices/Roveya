"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, Banknote, Eye, MapPin, Pencil, ReceiptText, Star, Trash2, UserPlus } from "lucide-react";
import { AssignButton, CallButton } from "@/components/actions";
import { Chips } from "@/components/list";
import { PageHead, useAdmin } from "@/components/Shell";
import { Badge, Empty, Failure, Field, Loading, Modal, Panel, Row, Spinner, useAction, useFeedback } from "@/components/ui";
import { api, useData } from "@/lib/client";
import { ago, label, rs, when } from "@/lib/format";
import { bookingsTitle, serviceOfVehicle } from "@/lib/services";
import { ActivityPanel, type Activity } from "./shared";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Detail = {
  ride: { id: string; code: string; vehicle: string; service: string; status: string; pickup: string; drop: string; distanceKm: number; etaMin: number; farePaise: number; discountPaise: number; owedPaise: number; bonusPaise: number; payment: string; paymentStatus: string; cancelledBy: string | null; cancelReason: string | null };
  places: { pickup: { latitude: number; longitude: number }; drop: { latitude: number; longitude: number } };
  times: Record<"requested" | "assigned" | "arrived" | "started" | "completed" | "cancelled", string | null>;
  rider: Record<string, any> | null;
  captain: Record<string, any> | null;
  captainLocation: { online: boolean; latitude: number | null; longitude: number | null; updated_at: string } | null;
  otp: string | null;
  offers: { id: string; status: string; pickup_km: number; created_at: string; decided_at: string | null; captain: { name: string; captain_code: string } | null }[];
  ratings: { by_role: string; stars: number; tags: string[]; note: string | null }[];
  coupon: { discount_paise: number; status: string; coupons: { code: string; title: string } | null } | null;
  tickets: { id: string; code: string; topic: string; status: string }[];
  payments: { id: string; amount_paise: number; status: string; razorpay_payment_id: string | null; created_at: string }[];
  ledger: { id: number; who: string; kind: string; amount_paise: number; note: string | null; created_at: string }[];
  activity: Activity[];
  canDelete: boolean;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

const OPEN = ["searching", "assigned", "arrived", "on_trip"];
const STEPS: [keyof Detail["times"], string][] = [
  ["requested", "Requested"],
  ["assigned", "Captain assigned"],
  ["arrived", "Captain at pickup"],
  ["started", "Ride started with OTP"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
];
const mapLink = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

export function RideDetail({ id }: { id: string }) {
  const { can } = useAdmin();
  const router = useRouter();
  const { ask } = useFeedback();
  const { busy, run } = useAction();
  const [showOtp, setShowOtp] = useState(false);
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const { data, error, loading, reload, setData } = useData<Detail>(`/rides/${id}`, 15000);

  if (error) return <Failure text={error} retry={reload} />;
  if (loading || !data) return <Loading rows={10} />;
  const r = data.ride;
  const service = serviceOfVehicle(r.vehicle);
  const manage = can("rides.manage");
  const where = data.captainLocation;

  const act = async (action: "cancel" | "collect") => {
    const copy = {
      cancel: { title: `Cancel ${r.code}?`, body: "The passenger and captain are told the ride is cancelled. Nobody is charged.", confirm: "Cancel ride" },
      collect: { title: "Mark cash collected?", body: `The captain collected ${rs(r.owedPaise)} in cash.`, confirm: "Mark collected" },
    }[action];
    const reason = await ask({ ...copy, danger: action !== "collect", input: { label: "Reason for the record", required: true } });
    if (!reason) return;
    const next = await run(action, () => api<Detail>(`/rides/${id}`, { method: "POST", body: { action, reason } }), "Ride updated.");
    if (next) setData(next);
  };

  const remove = async () => {
    const reason = await ask({ title: `Delete ${r.code}?`, body: "The ride and its offers and ratings are removed for good. The audit log keeps a copy.", confirm: "Delete ride", danger: true, input: { label: "Reason for the record", placeholder: "Test booking", required: true } });
    if (!reason) return;
    const done = await run("delete", () => api<{ ok: boolean }>(`/rides/${id}?reason=${encodeURIComponent(reason)}`, { method: "DELETE" }), `${r.code} deleted.`);
    if (done) router.push(`/bookings/${service}`);
  };

  return (
    <>
      <Link href={`/bookings/${service}`} className="mb-3 inline-flex items-center gap-1.5 text-xs muted hover:text-gold">
        <ArrowLeft size={14} /> {bookingsTitle(service)}
      </Link>
      <PageHead
        title={r.code}
        sub={`${r.service} · ${r.pickup} → ${r.drop}`}
        actions={
          <>
            <AssignButton title={`Follow up on ride ${r.code}`} entity="trip" entityId={id} link={`/bookings/${service}/${id}`} />
            {manage && ["searching", "assigned"].includes(r.status) ? (
              <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => setAssigning(true)}>
                <UserPlus size={14} /> {data.captain ? "Reassign captain" : "Assign captain"}
              </button>
            ) : null}
            {manage ? (
              <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => setEditing(true)}>
                <Pencil size={14} /> Edit
              </button>
            ) : null}
            {manage && OPEN.includes(r.status) ? (
              <button type="button" className="btn btn-danger" disabled={Boolean(busy)} onClick={() => void act("cancel")}>
                {busy === "cancel" ? <Spinner /> : <Ban size={14} />} Cancel ride
              </button>
            ) : null}
            {manage && r.payment === "cash" && r.status === "completed" && r.paymentStatus !== "paid" ? (
              <button type="button" className="btn btn-gold" disabled={Boolean(busy)} onClick={() => void act("collect")}>
                {busy === "collect" ? <Spinner /> : <Banknote size={14} />} Mark cash collected
              </button>
            ) : null}
            {data.rider && (can("view.finance") || can("view.support")) ? (
              <Link href={`/payments/riders/${service}/${data.rider.user_id}`} className="btn" title="City rides are paid after the ride, so there are no refunds. A fare dispute is handled as a payment case.">
                <ReceiptText size={14} /> Passenger payments
              </Link>
            ) : null}
            {manage && data.canDelete ? (
              <button type="button" className="btn btn-danger" disabled={Boolean(busy)} onClick={() => void remove()}>
                {busy === "delete" ? <Spinner /> : <Trash2 size={14} />} Delete
              </button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        <Panel title="Ride" action={<Badge value={r.status} />}>
          <Row label="Service" value={r.service} />
          <Row
            label="Pickup"
            value={
              <a href={mapLink(data.places.pickup.latitude, data.places.pickup.longitude)} target="_blank" rel="noreferrer" className="hover:text-gold">
                {r.pickup} <MapPin size={11} className="inline text-gold" />
              </a>
            }
          />
          <Row
            label="Drop"
            value={
              <a href={mapLink(data.places.drop.latitude, data.places.drop.longitude)} target="_blank" rel="noreferrer" className="hover:text-gold">
                {r.drop} <MapPin size={11} className="inline text-gold" />
              </a>
            }
          />
          <Row label="Distance" value={`${r.distanceKm.toFixed(1)} km · about ${data.ride.etaMin} min`} />
          <Row label="Fare" value={rs(r.farePaise)} />
          {r.discountPaise ? <Row label={`Coupon ${data.coupon?.coupons?.code ?? ""}`} value={`−${rs(r.discountPaise)}`} tone="text-rose" /> : null}
          <Row label="Passenger pays" value={rs(r.owedPaise)} tone="font-semibold text-gold" />
          {r.bonusPaise ? <Row label="Captain bonus" value={rs(r.bonusPaise)} /> : null}
          <Row label="Payment" value={<span className="capitalize">{r.payment} · {label(r.paymentStatus)}</span>} />
          {data.otp ? (
            <Row
              label="Ride OTP"
              value={
                showOtp ? (
                  <span className="font-semibold tracking-[0.3em] text-gold">{data.otp}</span>
                ) : (
                  <button type="button" className="inline-flex items-center gap-1 text-sky hover:underline" onClick={() => setShowOtp(true)}>
                    <Eye size={12} /> Show
                  </button>
                )
              }
            />
          ) : null}
          {r.cancelReason ? <Row label={`Cancelled by ${r.cancelledBy ?? "—"}`} value={r.cancelReason} /> : null}
        </Panel>

        <Panel title="Passenger">
          {data.rider ? (
            <>
              <Link href={`/travellers/${data.rider.user_id}`} className="font-semibold text-sky hover:underline">
                {data.rider.name}
              </Link>
              <Row label="Phone" value={<span className="flex items-center gap-2">{data.rider.phone} <CallButton phone={data.rider.phone} name={data.rider.name} kind="Traveller" entity="traveller" entityId={data.rider.user_id} compact /></span>} />
              <Row label="Email" value={data.rider.email ?? "—"} />
              <Row label="Account" value={<Badge value={data.rider.status ?? "active"} />} />
              <Row label="Rides with ROVEYA" value={`${data.rider.rides} booked · ${data.rider.completedRides} completed`} />
              <Row label="Joined" value={when(data.rider.created_at)} />
            </>
          ) : (
            <Empty text="Passenger not found." />
          )}
        </Panel>

        <Panel title="Captain">
          {data.captain ? (
            <>
              <Link href={`/captains/${data.captain.user_id}`} className="font-semibold text-sky hover:underline">
                {data.captain.name}
              </Link>
              <p className="flex items-center gap-1 text-xs muted">
                {data.captain.captain_code} · <Star size={12} className="text-gold" fill="currentColor" /> {Number(data.captain.rating).toFixed(2)}
              </p>
              <Row label="Phone" value={<span className="flex items-center gap-2">{data.captain.phone} <CallButton phone={data.captain.phone} name={data.captain.name} kind="Captain" entity="captain" entityId={data.captain.user_id} compact /></span>} />
              <Row label="Vehicle" value={`${data.captain.vehicle_model ?? "—"} · ${data.captain.vehicle_color ?? ""}`} />
              <Row label="Number plate" value={data.captain.vehicle_no ?? "—"} />
              <Row
                label="Live location"
                value={
                  where?.latitude != null && where.longitude != null ? (
                    <a href={mapLink(where.latitude, where.longitude)} target="_blank" rel="noreferrer" className="text-sky hover:underline">
                      {where.online ? "On duty" : "Off duty"} · seen {ago(where.updated_at)}
                    </a>
                  ) : (
                    <span className="muted">Not shared yet</span>
                  )
                }
              />
            </>
          ) : (
            <Empty text={r.status === "searching" ? "Looking for the nearest captain." : "No captain was assigned."} />
          )}
        </Panel>

        <Panel title="Timeline">
          <ol className="space-y-2.5">
            {STEPS.filter(([key]) => data.times[key]).map(([key, text]) => (
              <li key={key} className="flex items-center justify-between gap-3 text-[13px]">
                <span>{text}</span>
                <span className="muted">{when(data.times[key])}</span>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title="Captains offered this ride" pad={false} className="lg:col-span-2">
          {data.offers.length ? (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Captain</th>
                    <th>Pickup distance</th>
                    <th>Offered</th>
                    <th>Answer</th>
                  </tr>
                </thead>
                <tbody>
                  {data.offers.map((offer) => (
                    <tr key={offer.id}>
                      <td>{offer.captain ? `${offer.captain.name} · ${offer.captain.captain_code}` : "—"}</td>
                      <td className="tabular-nums">{Number(offer.pickup_km).toFixed(1)} km</td>
                      <td className="muted">{when(offer.created_at)}</td>
                      <td>
                        <Badge value={offer.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5">
              <Empty text="No captain has been offered this ride yet." />
            </div>
          )}
        </Panel>

        <Panel title="Ratings and tickets">
          {data.ratings.length ? (
            data.ratings.map((rating) => (
              <div key={rating.by_role} className="mb-3 text-[13px]">
                <p className="flex items-center gap-1">
                  {rating.by_role === "rider" ? "Passenger" : "Captain"}: {rating.stars} <Star size={12} className="text-gold" fill="currentColor" />
                </p>
                {rating.tags.length ? <p className="text-[11px] muted">{rating.tags.join(" · ")}</p> : null}
                {rating.note ? <p className="text-[12px] text-cream/75">“{rating.note}”</p> : null}
              </div>
            ))
          ) : (
            <Empty text="Not rated yet." />
          )}
          {data.tickets.length ? (
            <div className="mt-3 border-t border-line pt-3">
              {data.tickets.map((ticket) => (
                <Link key={ticket.id} href={`/support?ticket=${ticket.id}`} className="flex items-center justify-between py-1 text-[13px] hover:text-gold">
                  {ticket.code} · {label(ticket.topic)} <Badge value={ticket.status} />
                </Link>
              ))}
            </div>
          ) : null}
        </Panel>

        <Panel title="Money movements" pad={false} className="lg:col-span-2">
          {data.ledger.length || data.payments.length ? (
            <ul className="divide-y divide-line">
              {data.payments.map((payment) => (
                <li key={payment.id} className="flex items-center justify-between gap-3 px-5 py-3 text-[13px]">
                  <span>
                    Online payment <Badge value={payment.status} />
                    <span className="block text-[11px] muted">
                      {when(payment.created_at)}
                      {payment.razorpay_payment_id ? ` · ${payment.razorpay_payment_id}` : ""}
                    </span>
                  </span>
                  <span className="tabular-nums">{rs(payment.amount_paise)}</span>
                </li>
              ))}
              {data.ledger.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 px-5 py-3 text-[13px]">
                  <span>
                    {entry.who} · {label(entry.kind)}
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
              <Empty text={can("view.finance") ? "No money has moved for this ride yet." : "Your role does not show money movements."} />
            </div>
          )}
        </Panel>

        <ActivityPanel entries={data.activity} />
      </div>

      {editing ? <EditRide detail={data} onClose={() => setEditing(false)} onSaved={(next) => (setData(next), setEditing(false))} /> : null}
      {assigning ? <AssignCaptain detail={data} onClose={() => setAssigning(false)} onSaved={(next) => (setData(next), setAssigning(false))} /> : null}
    </>
  );
}

function EditRide({ detail, onClose, onSaved }: { detail: Detail; onClose: () => void; onSaved: (next: Detail) => void }) {
  const r = detail.ride;
  const { busy, run } = useAction();
  const [pickupName, setPickup] = useState(r.pickup);
  const [dropName, setDrop] = useState(r.drop);
  const [payment, setPayment] = useState(r.payment);
  const [reason, setReason] = useState("");
  const canPay = r.paymentStatus === "due" && r.payment !== "online" && r.status !== "cancelled" && r.status !== "expired";

  const save = async () => {
    const body: Record<string, string> = { reason };
    if (pickupName.trim() !== r.pickup) body.pickupName = pickupName.trim();
    if (dropName.trim() !== r.drop) body.dropName = dropName.trim();
    if (payment !== r.payment) body.payment = payment;
    const next = await run("save", () => api<Detail>(`/rides/${r.id}`, { method: "PATCH", body }), "Ride updated.");
    if (next) onSaved(next);
  };

  return (
    <Modal title={`Edit ${r.code}`} onClose={onClose} locked={Boolean(busy)}>
      <div className="space-y-4">
        <Field label="Pickup name" hint="Fixes how the place reads. The map point stays the same.">
          <input className="input" value={pickupName} onChange={(event) => setPickup(event.target.value)} />
        </Field>
        <Field label="Drop name">
          <input className="input" value={dropName} onChange={(event) => setDrop(event.target.value)} />
        </Field>
        {canPay ? (
          <div>
            <span className="label">Payment</span>
            <Chips
              value={payment}
              onChange={setPayment}
              options={[
                ["cash", "Cash to captain"],
                ["wallet", "ROVEYA Cash"],
              ]}
            />
            <span className="mt-1 block text-[11px] muted">Changes only while the fare is still due.</span>
          </div>
        ) : null}
        <Field label="Reason for the record">
          <input className="input" placeholder="Passenger called to correct the landmark" value={reason} onChange={(event) => setReason(event.target.value)} />
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

type Candidate = { user_id: string; name: string; phone: string; captain_code: string; vehicle_no: string; vehicle_model: string; rating: number; onDuty: boolean; distanceKm: number | null; seenAt: string | null };

function AssignCaptain({ detail, onClose, onSaved }: { detail: Detail; onClose: () => void; onSaved: (next: Detail) => void }) {
  const r = detail.ride;
  const { busy, run } = useAction();
  const [q, setQ] = useState("");
  const [reason, setReason] = useState("");
  const [pick, setPick] = useState<Candidate | null>(null);
  const { data, error, loading } = useData<{ captains: Candidate[] }>(`/rides/${r.id}/captains${q.trim().length >= 2 ? `?q=${encodeURIComponent(q.trim())}` : ""}`);

  const save = async () => {
    if (!pick) return;
    const next = await run("assign", () => api<Detail>(`/rides/${r.id}`, { body: { action: "assign", captainId: pick.user_id, reason } }), `${r.code} given to ${pick.name}.`);
    if (next) onSaved(next);
  };

  return (
    <Modal title={detail.captain ? `Reassign ${r.code}` : `Assign a captain to ${r.code}`} onClose={onClose} wide locked={Boolean(busy)}>
      <p className="mb-3 text-[12px] muted">Active {r.service} captains who are free right now. On-duty captains nearest the pickup come first.</p>
      <input className="input mb-3" placeholder="Search name, phone or RC code" value={q} onChange={(event) => setQ(event.target.value)} />
      <div className="max-h-72 overflow-y-auto rounded-lg border border-line">
        {error ? (
          <p className="p-4 text-[13px] text-danger">{error}</p>
        ) : loading && !data ? (
          <div className="p-4">
            <Loading rows={3} />
          </div>
        ) : data?.captains.length ? (
          <ul className="divide-y divide-line">
            {data.captains.map((captain) => (
              <li key={captain.user_id}>
                <button type="button" onClick={() => setPick(captain)} className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[13px] ${pick?.user_id === captain.user_id ? "bg-mist" : "hover:bg-mist/50"}`}>
                  <span>
                    <span className="font-medium">{captain.name}</span> <span className="muted">· {captain.captain_code}</span>
                    <span className="block text-[11px] muted">
                      {captain.vehicle_model} · {captain.vehicle_no} · {captain.phone}
                    </span>
                  </span>
                  <span className="text-right text-[11px]">
                    <span className={captain.onDuty ? "text-success" : "muted"}>{captain.onDuty ? "On duty" : "Off duty"}</span>
                    <span className="block muted">{captain.distanceKm != null ? `${captain.distanceKm} km from pickup` : "No location"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-4 text-[13px] muted">No free captain for this vehicle.</p>
        )}
      </div>
      <div className="mt-4">
        <Field label="Reason for the record">
          <input className="input" placeholder="Passenger asked for a captain nearby" value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose} disabled={Boolean(busy)}>
          Close
        </button>
        <button type="button" className="btn btn-gold" disabled={!pick || reason.trim().length < 3 || Boolean(busy)} onClick={() => void save()}>
          {busy ? <Spinner /> : <UserPlus size={14} />} {pick ? `Give ride to ${pick.name}` : "Pick a captain"}
        </button>
      </div>
    </Modal>
  );
}
