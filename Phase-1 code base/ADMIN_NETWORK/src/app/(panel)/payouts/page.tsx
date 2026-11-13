"use client";

import Link from "next/link";
import { Check, Download, X } from "lucide-react";
import { Chips, Toolbar, useList } from "@/components/list";
import { PageHead, useAdmin } from "@/components/Shell";
import { Badge, Empty, Failure, Loading, Pager, Panel, Stat, useAction, useFeedback } from "@/components/ui";
import { api } from "@/lib/client";
import { downloadCsv, num, rs, when } from "@/lib/format";

type Payout = {
  id: string;
  captain_id: string;
  amount_paise: number;
  bank_last4: string;
  status: string;
  reference: string | null;
  cycle: string | null;
  period_start: string | null;
  period_end: string | null;
  auto: boolean;
  created_at: string;
  decided_at: string | null;
  captain: { name: string; phone: string; code?: string } | null;
  bank: { bank_holder: string; ifsc: string; upi: string | null } | null;
};

export default function PayoutsPage() {
  const { can } = useAdmin();
  const { ask } = useFeedback();
  const { busy, run } = useAction();
  const list = useList<{ payouts: Payout[]; total: number; size: number; openPaise: number; openCount: number }>("/payouts", { status: "requested" }, 60000);
  const rows = list.data?.payouts ?? [];

  const decide = async (payout: Payout, action: "paid" | "reject") => {
    let reference: string | undefined;
    if (action === "paid") {
      const answer = await ask({ title: `Mark ${rs(payout.amount_paise)} as paid?`, body: `Transfer to ${payout.bank?.bank_holder ?? payout.captain?.name} · ••${payout.bank_last4} · ${payout.bank?.ifsc ?? ""} first, then enter the bank reference.`, confirm: "Mark paid", input: { label: "Bank UTR / reference", placeholder: "UTR123456789", required: true } });
      if (!answer) return;
      reference = answer;
    } else if (!(await ask({ title: "Reject this payout?", body: `${rs(payout.amount_paise)} goes back to ${payout.captain?.name}'s wallet for the next settlement.`, confirm: "Reject", danger: true }))) return;
    const done = await run(payout.id, () => api(`/payouts/${payout.id}`, { method: "PATCH", body: { action, reference } }), action === "paid" ? "Payout marked paid." : "Payout rejected and returned to wallet.");
    if (done) void list.reload();
  };

  return (
    <>
      <PageHead
        title="All captain payouts"
        sub="Settlements created on each captain's daily, weekly or monthly cycle."
        actions={
          <button type="button" className="btn" disabled={!rows.length} onClick={() => downloadCsv("roveya-payouts", rows.map((row) => ({ captain: row.captain?.name, code: row.captain?.code, account_holder: row.bank?.bank_holder, ifsc: row.bank?.ifsc, account_last4: row.bank_last4, upi: row.bank?.upi, amount: row.amount_paise / 100, cycle: row.cycle, status: row.status, created: row.created_at })))}>
            <Download size={14} /> Bank sheet
          </button>
        }
      />
      {list.data ? (
        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <Panel>
            <Stat label="Waiting to be paid" value={rs(list.data.openPaise)} tone="text-gold" sub={`${num(list.data.openCount)} payouts`} />
          </Panel>
        </div>
      ) : null}
      <Toolbar>
        <Chips
          value={list.filters.status ?? ""}
          onChange={(value) => list.setFilter("status", value)}
          options={[
            ["requested", "Waiting"],
            ["paid", "Paid"],
            ["rejected", "Rejected"],
            ["", "All"],
          ]}
        />
      </Toolbar>
      <Panel pad={false}>
        {list.error ? (
          <div className="p-5">
            <Failure text={list.error} retry={list.reload} />
          </div>
        ) : list.loading && !list.data ? (
          <div className="p-5">
            <Loading rows={6} />
          </div>
        ) : rows.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Captain</th>
                  <th>Bank</th>
                  <th>Cycle</th>
                  <th className="text-right">Amount</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/captains/${row.captain_id}`} className="font-medium text-sky hover:underline">
                        {row.captain?.name ?? "—"}
                      </Link>
                      <p className="text-[11px] muted">
                        {row.captain?.code} · {row.captain?.phone}
                      </p>
                    </td>
                    <td>
                      {row.bank?.bank_holder} · ••{row.bank_last4}
                      <p className="text-[11px] muted">
                        {row.bank?.ifsc}
                        {row.bank?.upi ? ` · ${row.bank.upi}` : ""}
                      </p>
                    </td>
                    <td className="capitalize">
                      {row.cycle ?? "Manual"}
                      {row.period_end ? <p className="text-[11px] muted">to {when(row.period_end)}</p> : null}
                    </td>
                    <td className="text-right font-semibold tabular-nums">{rs(row.amount_paise)}</td>
                    <td className="muted">{when(row.created_at)}</td>
                    <td>
                      <Badge value={row.status} />
                      {row.reference ? <p className="text-[11px] muted">UTR {row.reference}</p> : null}
                    </td>
                    <td className="text-right">
                      {row.status === "requested" && can("money.payouts") ? (
                        <div className="flex justify-end gap-1.5">
                          <button type="button" className="btn px-2 py-1 text-[11px] text-success" disabled={busy === row.id} onClick={() => void decide(row, "paid")}>
                            <Check size={12} /> Paid
                          </button>
                          <button type="button" className="btn px-2 py-1 text-[11px] text-danger" disabled={busy === row.id} onClick={() => void decide(row, "reject")}>
                            <X size={12} /> Reject
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="No payouts here." />
        )}
      </Panel>
      {list.data ? <Pager page={list.page} size={list.data.size} total={list.data.total} onPage={list.setPage} /> : null}
    </>
  );
}
