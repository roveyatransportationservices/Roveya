"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Ban, Check, ExternalLink, Pencil, RotateCcw, ShieldCheck, Star, X } from "lucide-react";
import { AssignButton, CallButton } from "@/components/actions";
import { PageHead, useAdmin } from "@/components/Shell";
import { WalletAdjust } from "@/components/WalletAdjust";
import { Avatar, Badge, Empty, Failure, Field, Loading, Modal, Panel, Row, Spinner, useAction, useFeedback } from "@/components/ui";
import { api, useData } from "@/lib/client";
import { dateOnly, label, route, rs, when } from "@/lib/format";
import { LAYOUTS, layoutInfo, type LayoutKind } from "@/lib/rules";
import { serviceOfCaptain, serviceOfVehicle, vadoTitle } from "@/lib/services";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Detail = {
  captain: Record<string, any>;
  documents: { kind: string; status: string; review_note: string | null; viewUrl: string | null; updated_at: string }[];
  car: Record<string, any> | null;
  plan: { cycle: string; pending_cycle: string | null; period_start: string; period_end: string } | null;
  walletPaise: number | null;
  ledger: { id: number; kind: string; amount_paise: number; note: string | null; created_at: string }[];
  trips: { id: string; code: string; status: string; from_city: string; to_city: string; depart_at: string; seats_total: number; seats_booked: number; fare_paise: number; captain_paid_paise: number; profit_paise: number }[];
  rides: { id: string; code: string; service: string; status: string; pickup: string; drop: string; owedPaise: number; payment: string; paymentStatus: string; requestedAt: string }[];
  payouts: { id: string; amount_paise: number; status: string; reference: string | null; cycle: string | null; created_at: string }[];
  tickets: { id: string; code: string; topic: string; status: string }[];
  stats: { trips: number; completed: number; earnedPaise: number | null; platformPaise: number | null };
};
/* eslint-enable @typescript-eslint/no-explicit-any */

const DOC_NAMES: Record<string, string> = {
  dlFront: "Driving licence · front",
  dlBack: "Driving licence · back",
  aadhaar: "Aadhaar",
  pan: "PAN",
  selfie: "Photo",
  rc: "RC",
  insurance: "Insurance",
  permit: "Permit",
  fitness: "Fitness",
  carFront: "Car · front",
  carBack: "Car · back",
  carInside: "Car · inside",
};

export default function CaptainPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useAdmin();
  const { ask } = useFeedback();
  const { busy, run } = useAction();
  const { data, error, loading, reload, setData } = useData<Detail>(`/captains/${id}`);
  const [editing, setEditing] = useState(false);
  const [carEditing, setCarEditing] = useState(false);

  if (error) return <Failure text={error} retry={reload} />;
  if (loading || !data) return <Loading rows={10} />;
  const c = data.captain;
  const city = c.service === "taxi";

  const decide = async (action: "approve" | "suspend" | "reinstate") => {
    let note: string | null = null;
    if (action === "suspend") {
      note = await ask({ title: `Suspend ${c.name}?`, body: city ? "They go offline and cannot take rides until reinstated." : "They go offline and cannot publish trips until reinstated.", confirm: "Suspend", danger: true, input: { label: "Reason the captain will see", required: true } });
      if (!note) return;
    } else if (
      !(await ask({
        title: action === "approve" ? `Approve ${c.name}?` : `Reinstate ${c.name}?`,
        body: action === "approve" ? (city ? "Uploaded documents are marked verified and they can go on duty." : "Uploaded documents are marked verified and the car goes live.") : city ? "They can go on duty again." : "They can publish trips again.",
        confirm: action === "approve" ? "Approve" : "Reinstate",
      }))
    )
      return;
    const next = await run(action, () => api<Detail>(`/captains/${id}`, { method: "PATCH", body: { action, note: note ?? undefined } }), "Captain updated.");
    if (next) setData(next);
  };

  const reviewDoc = async (kind: string, status: "verified" | "rejected") => {
    let note: string | undefined;
    if (status === "rejected") {
      const answer = await ask({ title: `Reject ${DOC_NAMES[kind] ?? kind}?`, body: "The captain sees this note and uploads it again.", confirm: "Reject", danger: true, input: { label: "What to fix", placeholder: "Photo is blurred, retake it in daylight", required: true } });
      if (!answer) return;
      note = answer;
    }
    const done = await run(`doc-${kind}`, () => api(`/captains/${id}/documents`, { method: "PATCH", body: { kind, status, note } }), status === "verified" ? "Document verified." : "Document rejected.");
    if (done) void reload();
  };

  const decideCar = async (action: "approve" | "reject") => {
    let note: string | undefined;
    if (action === "reject") {
      const answer = await ask({ title: "Reject this car?", body: "The captain sees the note and fixes the car details.", confirm: "Reject car", danger: true, input: { label: "What to fix", required: true } });
      if (!answer) return;
      note = answer;
    }
    const done = await run(`car-${action}`, () => api(`/cars/${data.car!.id}`, { method: "PATCH", body: { action, note } }), action === "approve" ? "Car approved." : "Car rejected.");
    if (done) void reload();
  };

  const setCycle = async (cycle: string) => {
    const next = await run("cycle", () => api<Detail>(`/captains/${id}`, { method: "PATCH", body: { payoutCycle: cycle } }), "Payout plan updated.");
    if (next) setData(next);
  };

  return (
    <>
      <Link href={`/vado/${serviceOfCaptain(c)}`} className="mb-3 inline-flex items-center gap-1.5 text-xs muted hover:text-gold">
        <ArrowLeft size={14} /> {vadoTitle(serviceOfCaptain(c))}
      </Link>
      <PageHead
        title={c.name}
        sub={`${c.captain_code} · ${c.phone} · joined ${dateOnly(c.created_at)}`}
        actions={
          <>
            <CallButton phone={c.phone} name={c.name} kind="Captain" entity="captain" entityId={id} />
            <AssignButton title={c.status === "review" ? `Verify documents of ${c.name}` : `Follow up with captain ${c.name}`} entity="captain" entityId={id} link={`/captains/${id}`} />
            {can("captains.edit") ? (
              <button type="button" className="btn" onClick={() => setEditing(true)}>
                <Pencil size={14} /> Edit
              </button>
            ) : null}
            {can("captains.review") ? (
              <>
              {c.status === "review" ? (
                <button type="button" className="btn btn-gold" disabled={Boolean(busy)} onClick={() => void decide("approve")}>
                  {busy === "approve" ? <Spinner /> : <ShieldCheck size={14} />} Approve captain
                </button>
              ) : null}
              {c.status === "active" ? (
                <button type="button" className="btn btn-danger" disabled={Boolean(busy)} onClick={() => void decide("suspend")}>
                  <Ban size={14} /> Suspend
                </button>
              ) : null}
              {c.status === "suspended" ? (
                <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => void decide("reinstate")}>
                  <RotateCcw size={14} /> Reinstate
                </button>
              ) : null}
              </>
            ) : null}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Profile" action={<Badge value={c.status} />}>
          <div className="mb-3 flex items-center gap-3">
            <Avatar name={c.name} size={44} />
            <div>
              <p className="font-semibold">{c.name}</p>
              <p className="flex items-center gap-1 text-xs muted">
                <Star size={12} className="text-gold" fill="currentColor" /> {Number(c.rating).toFixed(2)} · {c.gender}
              </p>
            </div>
          </div>
          <Row label="City" value={c.city} />
          <Row label="Email" value={c.email ?? "—"} />
          <Row label="Date of birth" value={dateOnly(c.dob)} />
          <Row label="Bank" value={`${c.bank_holder} · ••${c.bank_last4} · ${c.ifsc}`} />
          <Row label="UPI" value={c.upi ?? "—"} />
          <Row label="Phone" value={<span className="flex items-center gap-2">{c.phone} <CallButton phone={c.phone} name={c.name} kind="Captain" entity="captain" entityId={id} compact /></span>} />
          <Row label="Emergency" value={<span className="flex items-center gap-2">{`${c.emergency_name} · ${c.emergency_phone}`} <CallButton phone={c.emergency_phone} name={c.emergency_name} kind="Contact" entity="captain" entityId={id} compact /></span>} />
          {c.status_note ? <Row label="Status note" value={c.status_note} /> : null}
          <Row label="Approved" value={when(c.approved_at)} />
        </Panel>

        {city ? (
          <Panel title="Vehicle" action={<Badge value={c.vehicle} />}>
            <Row label="Service" value={c.vehicle === "bike" ? "ROVEYA Bike" : c.vehicle === "auto" ? "ROVEYA Auto" : "Cab"} />
            <Row label="Model" value={c.vehicle_model ?? "—"} />
            <Row label="Number plate" value={c.vehicle_no ?? "—"} />
            <Row label="Colour · year" value={`${c.vehicle_color ?? "—"} · ${c.vehicle_year ?? "—"}`} />
          </Panel>
        ) : (
        <Panel title="Car" action={data.car ? <Badge value={data.car.status} /> : null}>
          {data.car ? (
            <>
              <Row label="Car" value={data.car.make_model} />
              <Row label="Class" value={data.car.car_class} />
              <Row label="Layout" value={`${layoutInfo(data.car.layout_kind).title} · ${(data.car.seats as unknown[]).length} for travellers`} />
              <Row label="Number plate" value={data.car.plate} />
              <Row label="Colour · year" value={`${data.car.color} · ${data.car.year}`} />
              <Row label="AC" value={data.car.ac ? "Yes" : "No"} />
              <Row label="Seat names" value={(data.car.seats as { label: string }[]).map((seat) => seat.label).join(", ")} />
              <Row label="Amenities" value={(data.car.amenities as string[]).join(", ") || "—"} />
              {data.car.review_note ? <Row label="Review note" value={data.car.review_note} /> : null}
              {can("captains.edit") || can("captains.review") ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {can("captains.edit") ? (
                    <button type="button" className="btn" onClick={() => setCarEditing(true)}>
                      <Pencil size={14} /> Edit car
                    </button>
                  ) : null}
                  {can("captains.review") && data.car.status !== "active" ? (
                    <button type="button" className="btn btn-gold" disabled={Boolean(busy)} onClick={() => void decideCar("approve")}>
                      <Check size={14} /> Approve car
                    </button>
                  ) : null}
                  {can("captains.review") && data.car.status !== "rejected" ? (
                    <button type="button" className="btn btn-danger" disabled={Boolean(busy)} onClick={() => void decideCar("reject")}>
                      <X size={14} /> Reject car
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <Empty text="This captain has not added a car yet." />
          )}
        </Panel>
        )}

        <Panel title={data.walletPaise === null ? "Trips" : "Money"}>
          {data.walletPaise !== null ? <Row label="Wallet balance" value={rs(data.walletPaise)} tone="font-semibold text-gold" /> : null}
          <Row label="Trips completed" value={`${data.stats.completed}/${data.stats.trips}`} />
          {data.stats.earnedPaise !== null ? <Row label="Earned (last 40 trips)" value={rs(data.stats.earnedPaise)} /> : null}
          {data.stats.platformPaise !== null ? <Row label="ROVEYA earned from them" value={rs(data.stats.platformPaise)} /> : null}
          <div className="my-3 border-t border-line" />
          <p className="mb-2 text-[11px] muted">Payout cycle</p>
          <div className="flex gap-1">
            {["daily", "weekly", "monthly"].map((cycle) => (
              <button key={cycle} type="button" disabled={!(can("captains.edit") || can("money.payouts")) || busy === "cycle"} onClick={() => void setCycle(cycle)} className={`btn flex-1 capitalize ${data.plan?.cycle === cycle ? "border-gold text-gold" : data.plan?.pending_cycle === cycle ? "border-amber text-amber" : ""}`}>
                {cycle}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] muted">
            {data.plan ? `Current period ends ${when(data.plan.period_end)}${data.plan.pending_cycle ? `, then ${data.plan.pending_cycle}` : ""}.` : "No plan yet. Weekly applies by default."}
          </p>
          {can("money.wallets") && data.walletPaise !== null ? (
            <div className="mt-4">
              <WalletAdjust ownerId={id} name={c.name} balance={data.walletPaise} onDone={() => void reload()} />
            </div>
          ) : null}
        </Panel>

        <Panel title="Documents" className="lg:col-span-3">
          {data.documents.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {data.documents.map((doc) => (
                <div key={doc.kind} className="rounded-lg border border-line bg-night p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13px] font-medium">{DOC_NAMES[doc.kind] ?? doc.kind}</p>
                    <Badge value={doc.status} />
                  </div>
                  {doc.viewUrl ? (
                    <a href={doc.viewUrl} target="_blank" rel="noreferrer" className="mt-2 block overflow-hidden rounded border border-line">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={doc.viewUrl} alt={DOC_NAMES[doc.kind] ?? doc.kind} className="h-28 w-full object-cover" />
                    </a>
                  ) : (
                    <p className="mt-2 flex h-28 items-center justify-center rounded border border-dashed border-line text-[11px] muted">No photo</p>
                  )}
                  {doc.review_note ? <p className="mt-2 text-[11px] text-amber">{doc.review_note}</p> : null}
                  <div className="mt-2 flex items-center gap-1.5">
                    {doc.viewUrl ? (
                      <a href={doc.viewUrl} target="_blank" rel="noreferrer" className="btn px-2 py-1 text-[11px]">
                        <ExternalLink size={12} /> Open
                      </a>
                    ) : null}
                    {can("captains.review") && doc.status !== "verified" ? (
                      <button type="button" className="btn px-2 py-1 text-[11px] text-success" disabled={Boolean(busy)} onClick={() => void reviewDoc(doc.kind, "verified")}>
                        <Check size={12} /> Verify
                      </button>
                    ) : null}
                    {can("captains.review") && doc.status !== "rejected" ? (
                      <button type="button" className="btn px-2 py-1 text-[11px] text-danger" disabled={Boolean(busy)} onClick={() => void reviewDoc(doc.kind, "rejected")}>
                        <X size={12} /> Reject
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty text="No documents uploaded yet." />
          )}
        </Panel>

        {city ? (
          <Panel title="City rides" className={data.walletPaise === null ? "lg:col-span-3" : "lg:col-span-2"} pad={false}>
            {data.rides.length ? (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Ride</th>
                      <th>Pickup → drop</th>
                      <th>Requested</th>
                      <th>Fare</th>
                      <th>Payment</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rides.map((ride) => (
                      <tr key={ride.id}>
                        <td>
                          <Link href={`/bookings/${serviceOfVehicle(c.vehicle)}/${ride.id}`} className="font-semibold text-gold hover:underline">
                            {ride.code}
                          </Link>
                          <p className="text-[10px] muted">{ride.service}</p>
                        </td>
                        <td className="max-w-[260px] truncate">
                          {ride.pickup} → {ride.drop}
                        </td>
                        <td className="muted">{when(ride.requestedAt)}</td>
                        <td className="tabular-nums">{rs(ride.owedPaise)}</td>
                        <td className="capitalize">
                          {ride.payment} <Badge value={ride.paymentStatus} />
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
                <Empty text="No rides yet." />
              </div>
            )}
          </Panel>
        ) : (
        <Panel title="Trips" className={data.walletPaise === null ? "lg:col-span-3" : "lg:col-span-2"} pad={false}>
          {data.trips.length ? (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Trip</th>
                    <th>Route</th>
                    <th>Departs</th>
                    <th>Seats</th>
                    <th>Paid to captain</th>
                    <th>ROVEYA earns</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trips.map((trip) => (
                    <tr key={trip.id}>
                      <td>
                        <Link href={`/trips/${trip.id}`} className="font-semibold text-gold hover:underline">
                          {trip.code}
                        </Link>
                      </td>
                      <td>{route(trip.from_city, trip.to_city)}</td>
                      <td className="muted">{when(trip.depart_at)}</td>
                      <td>
                        {trip.seats_booked}/{trip.seats_total}
                      </td>
                      <td className="tabular-nums">{rs(trip.captain_paid_paise)}</td>
                      <td className="tabular-nums text-gold">{rs(trip.profit_paise)}</td>
                      <td>
                        <Badge value={trip.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5">
              <Empty text="No trips published yet." />
            </div>
          )}
        </Panel>
        )}

        <Panel title="Wallet history and payouts" pad={false} className={data.walletPaise === null ? "hidden" : ""}>
          {data.ledger.length || data.payouts.length ? (
            <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
              {data.payouts.map((payout) => (
                <li key={payout.id} className="flex items-center justify-between gap-3 px-5 py-3 text-[13px]">
                  <span>
                    Payout {payout.cycle ? `· ${payout.cycle}` : ""} <Badge value={payout.status} />
                    <span className="block text-[11px] muted">
                      {when(payout.created_at)}
                      {payout.reference ? ` · UTR ${payout.reference}` : ""}
                    </span>
                  </span>
                  <span className="tabular-nums">{rs(payout.amount_paise)}</span>
                </li>
              ))}
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
      </div>

      {editing ? <EditCaptain captain={c} onClose={() => setEditing(false)} onSaved={(next) => (setData(next), setEditing(false))} id={id} /> : null}
      {carEditing && data.car ? <EditCar car={data.car} onClose={() => setCarEditing(false)} onSaved={() => (setCarEditing(false), void reload())} /> : null}
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EditCaptain({ id, captain, onClose, onSaved }: { id: string; captain: Record<string, any>; onClose: () => void; onSaved: (detail: Detail) => void }) {
  const [form, setForm] = useState({ name: captain.name ?? "", email: captain.email ?? "", city: captain.city ?? "", upi: captain.upi ?? "", emergencyName: captain.emergency_name ?? "", emergencyPhone: captain.emergency_phone ?? "" });
  const { busy, run } = useAction();
  const save = async () => {
    const next = await run("save", () => api<Detail>(`/captains/${id}`, { method: "PATCH", body: form }), "Captain saved.");
    if (next) onSaved(next);
  };
  const field = (key: keyof typeof form, name: string) => (
    <Field label={name}>
      <input className="input" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
    </Field>
  );
  return (
    <Modal title="Edit captain" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("name", "Name")}
        {field("email", "Email")}
        {field("city", "City")}
        {field("upi", "UPI")}
        {field("emergencyName", "Emergency contact")}
        {field("emergencyPhone", "Emergency phone")}
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EditCar({ car, onClose, onSaved }: { car: Record<string, any>; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ makeModel: car.make_model ?? "", carClass: car.car_class ?? "SUV", plate: car.plate ?? "", color: car.color ?? "", year: String(car.year ?? ""), ac: Boolean(car.ac), amenities: (car.amenities ?? []).join(", "), layout: (car.layout_kind ?? "seat4") as LayoutKind });
  const { busy, run } = useAction();
  const save = async () => {
    const body = { makeModel: form.makeModel, carClass: form.carClass, plate: form.plate, color: form.color, year: Number(form.year), ac: form.ac, amenities: form.amenities.split(",").map((item: string) => item.trim()).filter(Boolean), layout: form.layout };
    const done = await run("save", () => api(`/cars/${car.id}`, { method: "PATCH", body }), "Car saved.");
    if (done) onSaved();
  };
  return (
    <Modal title="Edit car" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Car name">
          <input className="input" value={form.makeModel} onChange={(event) => setForm({ ...form, makeModel: event.target.value })} />
        </Field>
        <Field label="Class">
          <select className="input" value={form.carClass} onChange={(event) => setForm({ ...form, carClass: event.target.value })}>
            {["Hatchback", "Sedan", "SUV", "Premium SUV", "Traveller"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </Field>
        <Field label="Number plate">
          <input className="input uppercase" value={form.plate} onChange={(event) => setForm({ ...form, plate: event.target.value.toUpperCase() })} />
        </Field>
        <Field label="Colour">
          <input className="input" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} />
        </Field>
        <Field label="Year">
          <input className="input" inputMode="numeric" value={form.year} onChange={(event) => setForm({ ...form, year: event.target.value.replace(/\D/g, "").slice(0, 4) })} />
        </Field>
        <Field label="AC">
          <select className="input" value={form.ac ? "yes" : "no"} onChange={(event) => setForm({ ...form, ac: event.target.value === "yes" })}>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Amenities" hint="Separate with commas.">
          <input className="input" value={form.amenities} onChange={(event) => setForm({ ...form, amenities: event.target.value })} />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Seat layout" hint={form.layout !== car.layout_kind ? "Changing it resets seat names to the standard ones. Trips already published keep their seats." : "Match the car photos. Travellers book from this map."}>
          <select className="input" value={form.layout} onChange={(event) => setForm({ ...form, layout: event.target.value as LayoutKind })}>
            {LAYOUTS.map((item) => (
              <option key={item.kind} value={item.kind}>
                {item.title} · {item.line}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
        <button type="button" className="btn btn-gold" disabled={busy === "save"} onClick={() => void save()}>
          {busy === "save" ? <Spinner /> : null} Save car
        </button>
      </div>
    </Modal>
  );
}
