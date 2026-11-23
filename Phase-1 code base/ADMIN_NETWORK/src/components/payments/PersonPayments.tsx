"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, FolderOpen, UserRound, X } from "lucide-react";
import { Chips } from "@/components/list";
import { PageHead, useAdmin } from "@/components/Shell";
import { Badge, Empty, Failure, Field, Loading, Modal, Panel, Row, Spinner, useAction, useFeedback } from "@/components/ui";
import { WalletAdjust } from "@/components/WalletAdjust";
import { api, useData } from "@/lib/client";
import { label, route, rs, when } from "@/lib/format";
import { SERVICE_INFO, type ServiceKey } from "@/lib/services";
import { Flags, KIND, PERIODS, PURPOSE, payTitle, type Flag, type RoleSlug } from "./shared";

type Note = { at: string; by: string; text: string; status: string };
type Case = { id: number; code: string; kind: "fraud" | "support"; title: string; status: "open" | "watching" | "resolved"; amount_paise: number | null; reference: string | null; notes: Note[]; created_at: string };
type Detail = {
  days: number;
  person: Record<string, string | null>;
  balancePaise: number;
  flags: Flag[];
  ledger: { id: number; kind: string; amount_paise: number; note: string | null; created_at: string; service: string | null; refLabel: string | null; refLink: string | null }[];
  payments: { id: string; purpose: string; status: string; amount_paise: number; razorpay_order_id: string | null; razorpay_payment_id: string | null; created_at: string; stuck: boolean }[];
  rides: { id: string; code: string; vehicle: string; status: string; payment: string; payment_status: string; cancelled_by: string | null; fare_paise: number; discount_paise: number; pickup_name: string; drop_name: string; requested_at: string; started_at: string | null; completed_at: string | null }[];
  bookings: { id: string; pnr: string; status: string; cancelled_by: string | null; total_paise: number; cash_paise: number; refund_paise: number | null; paid_with: string | null; created_at: string }[];
  payouts: { id: string; amount_paise: number; status: string; reference: string | null; bank_last4: string; cycle: string | null; auto: boolean; created_at: string; decided_at: string | null }[];
  seatTrips: { id: string; code: string; status: string; from_city: string; to_city: string; depart_at: string; cancel_reason: string | null }[];
  cases: Case[];
};

const CASE_TONE: Record<Case["status"], string> = { open: "text-danger", watching: "text-amber", resolved: "text-success" };

export function PersonPayments({ role, service, id }: { role: RoleSlug; service: ServiceKey; id: string }) {
  const { can } = useAdmin();
  const { ask } = useFeedback();
  const { busy, run } = useAction();
  const [days, setDays] = useState("30");
  const [opening, setOpening] = useState(false);
  const { data, error, loading, reload, setData } = useData<Detail>(`/pay/${role}/${service}/${id}?days=${days}`, 60000);

  if (error) return <Failure text={error} retry={reload} />;
  if (loading || !data) return <Loading rows={10} />;
  const p = data.person;
  const captain = role === "vado";
  const handle = can("money.wallets") || can("support.reply");
  const name = p.name || (captain ? "Captain" : "Passenger");

  const decide = async (payout: Detail["payouts"][number], action: "paid" | "reject") => {
    let reference: string | undefined;
    if (action === "paid") {
      const answer = await ask({ title: `Mark ${rs(payout.amount_paise)} as paid?`, body: `Transfer to ${p.bank_holder ?? name} · ••${payout.bank_last4} · ${p.ifsc ?? ""} first, then enter the bank reference.`, confirm: "Mark paid", input: { label: "Bank UTR / reference", required: true } });
      if (!answer) return;
      reference = answer;
    } else if (!(await ask({ title: "Reject this payout?", body: `${rs(payout.amount_paise)} goes back to the wallet.`, confirm: "Reject", danger: true }))) return;
    const done = await run(payout.id, () => api(`/payouts/${payout.id}`, { method: "PATCH", body: { action, reference } }), action === "paid" ? "Payout marked paid." : "Payout rejected.");
    if (done) void reload();
  };

  const moveCase = async (item: Case, status: Case["status"]) => {
    const note = await ask({ title: `${item.code}: ${status === "resolved" ? "resolve" : status === "watching" ? "keep watching" : status === "open" ? "reopen" : "add a note"}`, body: item.title, confirm: "Save", input: { label: "Note for the record", required: true } });
    if (!note) return;
    const done = await run(`case-${item.id}`, () => api(`/pay/cases/${item.id}`, { method: "PATCH", body: { status, note } }), "Case updated.");
    if (done) void reload();
  };

  return (
    <>
      <Link href={`/payments/${role}/${service}`} className="mb-3 inline-flex items-center gap-1.5 text-xs muted hover:text-gold">
        <ArrowLeft size={14} /> {payTitle(role, service)}
      </Link>
      <PageHead
        title={`${name} · payments`}
        sub={`${captain ? `${p.captain_code} · ` : ""}${p.phone} · ${p.status ?? "active"} · ${SERVICE_INFO[service].name}`}
        actions={
          <>
            <Link href={captain ? `/captains/${p.user_id}` : `/travellers/${p.user_id}`} className="btn">
              <UserRound size={14} /> Profile
            </Link>
            {can("money.wallets") ? <WalletAdjust ownerId={String(p.user_id)} name={name} balance={data.balancePaise} onDone={(balancePaise) => (setData({ ...data, balancePaise }), void reload())} /> : null}
            {handle ? (
              <button type="button" className="btn btn-gold" onClick={() => setOpening(true)}>
                <FolderOpen size={14} /> Open a case
              </button>
            ) : null}
          </>
        }
      />
      <div className="mb-4">
        <Chips value={days} onChange={setDays} options={PERIODS} />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        <Panel title="Wallet and warnings">
          <Row label={captain ? "Captain wallet" : "ROVEYA Cash"} value={<span className={`font-semibold ${data.balancePaise < 0 ? "text-danger" : "text-gold"}`}>{rs(data.balancePaise)}</span>} />
          {captain ? <Row label="Bank" value={p.bank_last4 ? `${p.bank_holder} · ••${p.bank_last4} · ${p.ifsc}${p.upi ? ` · ${p.upi}` : ""}` : "—"} /> : <Row label="Email" value={p.email ?? "—"} />}
          <div className="mt-3 border-t border-line pt-3">
            {data.flags.length ? (
              <ul className="space-y-2">
                {data.flags.map((flag) => (
                  <li key={flag.key}>
                    <Flags flags={[flag]} />
                    <p className="mt-0.5 text-[12px] muted">{flag.detail}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-success">No warnings in the last {data.days} days.</p>
            )}
          </div>
        </Panel>

        <Panel title="Cases" pad={false} className="lg:col-span-2">
          {data.cases.length ? (
            <ul className="divide-y divide-line">
              {data.cases.map((item) => (
                <li key={item.id} className="px-5 py-3 text-[13px]">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p>
                      <span className="font-semibold">{item.code}</span> · <Badge value={item.kind === "fraud" ? "urgent" : "scheduled"}>{item.kind === "fraud" ? "Fraud" : "Support"}</Badge> <span className="font-medium">{item.title}</span>
                      <span className={`ml-2 text-[11px] font-semibold uppercase ${CASE_TONE[item.status]}`}>{item.status}</span>
                    </p>
                    {handle ? (
                      <span className="flex gap-1.5">
                        {item.status !== "resolved" ? (
                          <>
                            <button type="button" className="btn px-2 py-0.5 text-[11px]" disabled={Boolean(busy)} onClick={() => void moveCase(item, item.status)}>
                              Add note
                            </button>
                            {item.status === "open" ? (
                              <button type="button" className="btn px-2 py-0.5 text-[11px]" disabled={Boolean(busy)} onClick={() => void moveCase(item, "watching")}>
                                Watch
                              </button>
                            ) : null}
                            <button type="button" className="btn btn-gold px-2 py-0.5 text-[11px]" disabled={Boolean(busy)} onClick={() => void moveCase(item, "resolved")}>
                              Resolve
                            </button>
                          </>
                        ) : (
                          <button type="button" className="btn px-2 py-0.5 text-[11px]" disabled={Boolean(busy)} onClick={() => void moveCase(item, "open")}>
                            Reopen
                          </button>
                        )}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[11px] muted">
                    {item.amount_paise ? `${rs(item.amount_paise)} · ` : ""}
                    {item.reference ? `${item.reference} · ` : ""}opened {when(item.created_at)}
                  </p>
                  <ol className="mt-2 space-y-1 border-l border-line pl-3">
                    {item.notes.map((note, index) => (
                      <li key={index} className="text-[12px]">
                        <span className="muted">
                          {when(note.at)} · {note.by} · {note.status}:
                        </span>{" "}
                        {note.text}
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <Empty text="No cases yet. Open one when something needs following up: a suspected fraud or a payment problem to fix." />
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2 [&>*]:min-w-0">
        <Panel title="Wallet history" pad={false}>
          {data.ledger.length ? (
            <div className="max-h-[520px] overflow-y-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>What</th>
                    <th>For</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ledger.map((line) => (
                    <tr key={line.id}>
                      <td className="muted">{when(line.created_at)}</td>
                      <td>
                        {KIND[line.kind] ?? label(line.kind)}
                        {line.note ? <span className="block text-[11px] muted">{line.note}</span> : null}
                      </td>
                      <td className="text-[12px]">
                        {line.refLink ? (
                          <Link href={line.refLink} className="text-sky hover:underline">
                            {line.refLabel}
                          </Link>
                        ) : (
                          <span className="muted">{line.refLabel ?? "—"}</span>
                        )}
                        {line.service ? <span className="block text-[10px] muted">{SERVICE_INFO[line.service as ServiceKey]?.name ?? line.service}</span> : null}
                      </td>
                      <td className={`text-right tabular-nums ${line.amount_paise < 0 ? "text-danger" : "text-success"}`}>{rs(line.amount_paise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5">
              <Empty text="No wallet movements yet." />
            </div>
          )}
        </Panel>

        {captain ? (
          <Panel title="Payouts" pad={false}>
            {data.payouts.length ? (
              <ul className="divide-y divide-line">
                {data.payouts.map((payout) => (
                  <li key={payout.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[13px]">
                    <span>
                      <span className="font-semibold tabular-nums">{rs(payout.amount_paise)}</span> <Badge value={payout.status} />
                      <span className="block text-[11px] muted">
                        {payout.auto ? `${payout.cycle} settlement` : "asked in the app"} · ••{payout.bank_last4} · {when(payout.created_at)}
                        {payout.reference ? ` · UTR ${payout.reference}` : ""}
                      </span>
                    </span>
                    {payout.status === "requested" && can("money.payouts") ? (
                      <span className="flex gap-2">
                        <button type="button" className="btn btn-gold px-2.5 py-1 text-[12px]" disabled={Boolean(busy)} onClick={() => void decide(payout, "paid")}>
                          <Check size={13} /> Paid
                        </button>
                        <button type="button" className="btn px-2.5 py-1 text-[12px]" disabled={Boolean(busy)} onClick={() => void decide(payout, "reject")}>
                          <X size={13} /> Reject
                        </button>
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-5">
                <Empty text="No payouts yet." />
              </div>
            )}
          </Panel>
        ) : (
          <Panel title="Online payments" pad={false}>
            {data.payments.length ? (
              <ul className="divide-y divide-line">
                {data.payments.map((payment) => (
                  <li key={payment.id} className="flex items-center justify-between gap-3 px-5 py-3 text-[13px]">
                    <span>
                      {PURPOSE[payment.purpose] ?? label(payment.purpose)} <Badge value={payment.status === "created" ? "pending" : payment.status} />
                      {payment.stuck ? <span className="ml-1 text-[11px] font-semibold text-sky">Not finished</span> : null}
                      <span className="block text-[11px] muted">
                        {when(payment.created_at)} · {payment.razorpay_payment_id ?? payment.razorpay_order_id ?? "no Razorpay order"}
                      </span>
                    </span>
                    <span className="tabular-nums">{rs(payment.amount_paise)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-5">
                <Empty text="No online payments yet." />
              </div>
            )}
          </Panel>
        )}

        {data.rides.length ? (
          <Panel title={captain ? "Rides driven" : "Rides taken"} pad={false} className="xl:col-span-2">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Ride</th>
                    <th>When</th>
                    <th>Pickup → drop</th>
                    <th>Fare</th>
                    <th>Payment</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rides.map((ride) => {
                    const quick = ride.started_at && ride.completed_at && Date.parse(ride.completed_at) - Date.parse(ride.started_at) < 120000;
                    return (
                      <tr key={ride.id}>
                        <td>
                          <Link href={`/bookings/${service}/${ride.id}`} className="font-semibold text-gold hover:underline">
                            {ride.code}
                          </Link>
                          {quick ? <span className="block text-[10px] font-semibold text-danger">Under 2 minutes</span> : null}
                        </td>
                        <td className="muted">{when(ride.requested_at)}</td>
                        <td className="max-w-[260px] truncate text-[12px]">
                          {ride.pickup_name} → {ride.drop_name}
                        </td>
                        <td className="tabular-nums">{rs(ride.fare_paise - (ride.discount_paise ?? 0))}</td>
                        <td className="capitalize">
                          {ride.payment} <Badge value={ride.payment_status} />
                        </td>
                        <td>
                          <Badge value={ride.status} />
                          {ride.cancelled_by ? <span className="block text-[10px] muted">by {ride.cancelled_by}</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        ) : null}

        {data.bookings.length ? (
          <Panel title="Seat bookings" pad={false} className="xl:col-span-2">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>PNR</th>
                    <th>Booked</th>
                    <th>Paid</th>
                    <th>Paid with</th>
                    <th>Refund</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bookings.map((booking) => (
                    <tr key={booking.id}>
                      <td>
                        <Link href={`/bookings/carpool/${booking.id}`} className="font-semibold text-gold hover:underline">
                          {booking.pnr}
                        </Link>
                      </td>
                      <td className="muted">{when(booking.created_at)}</td>
                      <td className="tabular-nums">{rs(booking.total_paise + booking.cash_paise)}</td>
                      <td>{booking.paid_with ?? "—"}</td>
                      <td className="tabular-nums">{booking.refund_paise ? rs(booking.refund_paise) : "—"}</td>
                      <td>
                        <Badge value={booking.status} />
                        {booking.cancelled_by ? <span className="block text-[10px] muted">by {booking.cancelled_by}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ) : null}

        {data.seatTrips.length ? (
          <Panel title="Carpool trips" pad={false} className="xl:col-span-2">
            <ul className="divide-y divide-line">
              {data.seatTrips.map((trip) => (
                <li key={trip.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px]">
                  <Link href={`/trips/${trip.id}`} className="hover:text-gold">
                    <span className="font-semibold text-gold">{trip.code}</span> · {route(trip.from_city, trip.to_city)} · {when(trip.depart_at)}
                    {trip.cancel_reason ? <span className="block text-[11px] muted">{trip.cancel_reason}</span> : null}
                  </Link>
                  <Badge value={trip.status} />
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
      </div>

      {opening ? <OpenCase role={role} service={service} ownerId={String(p.user_id)} name={name} onClose={() => setOpening(false)} onDone={() => (setOpening(false), void reload())} /> : null}
    </>
  );
}

function OpenCase({ role, service, ownerId, name, onClose, onDone }: { role: RoleSlug; service: ServiceKey; ownerId: string; name: string; onClose: () => void; onDone: () => void }) {
  const { busy, run } = useAction();
  const [kind, setKind] = useState<"fraud" | "support">("support");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const save = async () => {
    const done = await run("case", () => api("/pay/cases", { body: { ownerId, role: role === "vado" ? "captain" : "rider", service, kind, title, note, amount: amount ? Number(amount) : undefined, reference: reference || undefined } }), "Case opened.");
    if (done) onDone();
  };
  return (
    <Modal title={`Open a case on ${name}`} onClose={onClose} locked={Boolean(busy)}>
      <div className="space-y-4">
        <div>
          <span className="label">Kind</span>
          <Chips
            value={kind}
            onChange={(value) => setKind(value as "fraud" | "support")}
            options={[
              ["support", "Payment problem (support)"],
              ["fraud", "Suspected fraud"],
            ]}
          />
        </div>
        <Field label="Title">
          <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={kind === "fraud" ? "Fake short rides for bonuses" : "Paid online, seats not confirmed"} />
        </Field>
        <Field label="What happened">
          <textarea className="input min-h-24" value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount involved (₹, optional)">
            <input className="input" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))} />
          </Field>
          <Field label="Reference (optional)" hint="Ride code, PNR or Razorpay ID">
            <input className="input" value={reference} onChange={(event) => setReference(event.target.value)} />
          </Field>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose} disabled={Boolean(busy)}>
          Close
        </button>
        <button type="button" className="btn btn-gold" disabled={Boolean(busy) || title.trim().length < 3 || note.trim().length < 3} onClick={() => void save()}>
          {busy ? <Spinner /> : null} Open case
        </button>
      </div>
    </Modal>
  );
}
