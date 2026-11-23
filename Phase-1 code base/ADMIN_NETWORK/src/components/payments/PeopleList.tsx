"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, List, X } from "lucide-react";
import { Chips, Toolbar } from "@/components/list";
import { PageHead, useAdmin } from "@/components/Shell";
import { Empty, Failure, Loading, Panel, Stat, useAction, useFeedback } from "@/components/ui";
import { api, useData } from "@/lib/client";
import { ago, num, rs, when } from "@/lib/format";
import type { ServiceKey } from "@/lib/services";
import { Flags, PERIODS, payTitle, type Flag, type RoleSlug } from "./shared";

type Person = { id: string; name: string; phone: string; code: string; status: string; balancePaise: number; numbers: Record<string, number>; flags: Flag[]; openCases: number; lastAt: string | null };
type Data = { days: number; totals: Record<string, number>; people: Person[] };
type Payout = { id: string; captain_id: string; amount_paise: number; bank_last4: string; cycle: string | null; auto: boolean; created_at: string; captain: { name: string } | null; bank: { bank_holder: string; ifsc: string; upi: string | null } | null };

export function PeopleList({ role, service }: { role: RoleSlug; service: ServiceKey }) {
  const { can } = useAdmin();
  const { ask } = useFeedback();
  const { busy, run } = useAction();
  const [days, setDays] = useState("30");
  const [show, setShow] = useState<"" | "flagged" | "cases">("");
  const [q, setQ] = useState("");
  const { data, error, loading, reload } = useData<Data>(`/pay/${role}/${service}?days=${days}`, 60000);
  const payouts = useData<{ payouts: Payout[] }>(role === "vado" && can("view.finance") ? "/payouts?status=requested&size=100" : null, 60000);
  const captains = useMemo(() => new Set((data?.people ?? []).map((row) => row.id)), [data]);
  const waiting = (payouts.data?.payouts ?? []).filter((row) => captains.has(row.captain_id));

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.people ?? []).filter((row) => (show === "flagged" ? row.flags.some((flag) => flag.tone !== "sky") : show === "cases" ? row.openCases > 0 : true) && (!needle || `${row.name} ${row.phone} ${row.code}`.toLowerCase().includes(needle)));
  }, [data, show, q]);

  const decide = async (payout: Payout, action: "paid" | "reject") => {
    let reference: string | undefined;
    if (action === "paid") {
      const answer = await ask({ title: `Mark ${rs(payout.amount_paise)} as paid?`, body: `Transfer to ${payout.bank?.bank_holder ?? payout.captain?.name} · ••${payout.bank_last4} · ${payout.bank?.ifsc ?? ""}${payout.bank?.upi ? ` · UPI ${payout.bank.upi}` : ""} first, then enter the bank reference.`, confirm: "Mark paid", input: { label: "Bank UTR / reference", placeholder: "UTR123456789", required: true } });
      if (!answer) return;
      reference = answer;
    } else if (!(await ask({ title: "Reject this payout?", body: `${rs(payout.amount_paise)} goes back to ${payout.captain?.name}'s wallet.`, confirm: "Reject", danger: true }))) return;
    const done = await run(payout.id, () => api(`/payouts/${payout.id}`, { method: "PATCH", body: { action, reference } }), action === "paid" ? "Payout marked paid." : "Payout rejected and returned to the wallet.");
    if (done) {
      void payouts.reload();
      void reload();
    }
  };

  if (error) return <Failure text={error} retry={reload} />;
  const t = data?.totals ?? {};
  const captain = role === "vado";
  const carpool = service === "carpool";

  return (
    <>
      <PageHead
        title={payTitle(role, service)}
        sub={captain ? "Every captain's earnings, commission, cash, wallet and payouts. Warnings point to possible fraud or a payment problem." : carpool ? "Every passenger's seat payments, ROVEYA Cash, cancellation refunds and failed payments. Warnings point to possible fraud or a payment problem." : "Every passenger's ride payments, online payments, ROVEYA Cash, fares still due and failed payments. City rides are paid after the ride, so there are no refunds."}
        actions={
          can("view.finance") ? (
            <>
              {captain ? (
                <Link href="/payouts" className="btn">
                  <List size={14} /> All payouts
                </Link>
              ) : null}
              <Link href="/payments/all" className="btn">
                <List size={14} /> All payments and ledger
              </Link>
            </>
          ) : null
        }
      />
      <div className="mb-4">
        <Chips value={days} onChange={setDays} options={PERIODS} />
      </div>
      {loading || !data ? (
        <Loading rows={8} />
      ) : (
        <>
          <Panel className="mb-5">
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-4 xl:grid-cols-8">
              <Stat label={captain ? "Captains" : "Passengers"} value={num(t.people)} />
              <Stat label="Need a look" value={num(t.flagged)} tone={t.flagged ? "text-danger" : "text-cream"} />
              <Stat label="Open cases" value={num(t.openCases)} tone={t.openCases ? "text-amber" : "text-cream"} />
              {captain ? (
                <>
                  <Stat label="Earned" value={rs(t.earnedPaise)} sub="rides and bonuses" tone="text-gold" />
                  <Stat label="Cash collected" value={rs(t.cashPaise)} sub="by captains on cash rides" />
                  <Stat label="Commission" value={rs(t.commissionPaise)} sub="on cash rides" />
                  <Stat label="Payouts waiting" value={rs(t.payoutWaitingPaise)} sub={`${num(t.payoutWaiting)} requests`} tone="text-sky" />
                  <Stat label="Paid out" value={rs(t.paidOutPaise)} />
                </>
              ) : (
                <>
                  <Stat label="Spent" value={rs(t.spentPaise)} tone="text-gold" />
                  <Stat label="Paid online" value={rs(t.onlinePaise)} />
                  {carpool ? <Stat label="Refunded" value={rs(t.refundPaise)} sub="on cancelled seats" tone="text-amber" /> : <Stat label="Not paid yet" value={rs(t.duePaise)} sub="finished rides still due" tone={t.duePaise ? "text-danger" : "text-cream"} />}
                  <Stat label="ROVEYA Cash added" value={rs(t.topupPaise)} />
                  <Stat label="Failed payments" value={num(t.failedPayments)} tone={t.failedPayments ? "text-danger" : "text-cream"} />
                </>
              )}
            </div>
          </Panel>

          {captain && waiting.length ? (
            <Panel title={`Payouts waiting · ${rs(waiting.reduce((sum, row) => sum + row.amount_paise, 0))}`} pad={false} className="mb-5">
              <ul className="divide-y divide-line">
                {waiting.map((payout) => (
                  <li key={payout.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[13px]">
                    <span>
                      <Link href={`/payments/${role}/${service}/${payout.captain_id}`} className="font-semibold text-gold hover:underline">
                        {payout.captain?.name ?? "Captain"}
                      </Link>
                      <span className="block text-[11px] muted">
                        {payout.bank?.bank_holder} · ••{payout.bank_last4} · {payout.bank?.ifsc}
                        {payout.bank?.upi ? ` · ${payout.bank.upi}` : ""} · {payout.auto ? `${payout.cycle} settlement` : "asked in the app"} · {when(payout.created_at)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">{rs(payout.amount_paise)}</span>
                      {can("money.payouts") ? (
                        <>
                          <button type="button" className="btn btn-gold px-2.5 py-1 text-[12px]" disabled={Boolean(busy)} onClick={() => void decide(payout, "paid")}>
                            <Check size={13} /> Paid
                          </button>
                          <button type="button" className="btn px-2.5 py-1 text-[12px]" disabled={Boolean(busy)} onClick={() => void decide(payout, "reject")}>
                            <X size={13} /> Reject
                          </button>
                        </>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Toolbar q={q} setQ={setQ} placeholder={captain ? "Name, phone or RC code" : "Name or phone"}>
            <Chips
              value={show}
              onChange={(value) => setShow(value as typeof show)}
              options={[
                ["", `All (${num(t.people)})`],
                ["flagged", `Need a look (${num(t.flagged)})`],
                ["cases", `Open cases (${num(t.openCases)})`],
              ]}
            />
          </Toolbar>
          <Panel pad={false}>
            {rows.length ? (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{captain ? "Captain" : "Passenger"}</th>
                      <th>Warnings</th>
                      <th>{captain ? "Trips" : "Rides"}</th>
                      {captain ? (
                        <>
                          <th>Earned</th>
                          <th>Cash collected</th>
                          <th>Payouts</th>
                        </>
                      ) : (
                        <>
                          <th>Spent</th>
                          <th>Online</th>
                          <th>{carpool ? "Refunds" : "Not paid yet"}</th>
                        </>
                      )}
                      <th>Wallet</th>
                      <th>Last money</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <Link href={`/payments/${role}/${service}/${row.id}`} className="font-semibold text-gold hover:underline">
                            {row.name}
                          </Link>
                          <p className="text-[11px] muted">
                            {row.code ? `${row.code} · ` : ""}
                            {row.phone}
                            {row.status !== "active" ? ` · ${row.status}` : ""}
                          </p>
                        </td>
                        <td className="max-w-[320px]">
                          <Flags flags={row.flags} />
                          {row.openCases ? <span className="mt-1 block text-[10.5px] font-semibold text-amber">{row.openCases} open case(s)</span> : null}
                        </td>
                        <td className="tabular-nums">{num(row.numbers.trips)}</td>
                        {captain ? (
                          <>
                            <td className="tabular-nums">{rs(row.numbers.earnedPaise)}</td>
                            <td className="tabular-nums">{rs(row.numbers.cashPaise)}</td>
                            <td className="tabular-nums">
                              {rs(row.numbers.paidOutPaise)}
                              {row.numbers.payoutWaitingPaise ? <span className="block text-[11px] text-sky">{rs(row.numbers.payoutWaitingPaise)} waiting</span> : null}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="tabular-nums">{rs(row.numbers.spentPaise)}</td>
                            <td className="tabular-nums">
                              {rs(row.numbers.onlinePaise)}
                              {row.numbers.failedPayments ? <span className="block text-[11px] text-danger">{row.numbers.failedPayments} failed</span> : null}
                            </td>
                            {carpool ? <td className="tabular-nums">{rs(row.numbers.refundPaise)}</td> : <td className={`tabular-nums ${row.numbers.duePaise ? "text-danger" : ""}`}>{rs(row.numbers.duePaise)}</td>}
                          </>
                        )}
                        <td className={`tabular-nums ${row.balancePaise < 0 ? "text-danger" : ""}`}>{rs(row.balancePaise)}</td>
                        <td className="muted">{row.lastAt ? ago(row.lastAt) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-5">
                <Empty text={data.people.length ? "Nobody matches." : captain ? "No captains in this service yet." : "No passengers have used this service yet."} />
              </div>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
