"use client";

import { useState } from "react";
import Link from "next/link";
import { Chips, Toolbar, useList } from "@/components/list";
import { PageHead } from "@/components/Shell";
import { Badge, Empty, Failure, Loading, Pager, Panel, Stat } from "@/components/ui";
import { label, num, rs, when } from "@/lib/format";

type Payment = { id: string; purpose: string; amount_paise: number; status: string; razorpay_order_id: string | null; razorpay_payment_id: string | null; ref_id: string | null; created_at: string; owner: { id: string; name: string; kind: string } | null; pnr: string | null };
type Entry = { id: number; owner_id: string; kind: string; amount_paise: number; ref_type: string | null; ref_id: string | null; note: string | null; created_at: string; owner: { id?: string; name: string; kind: string } | null };

function Payments() {
  const list = useList<{ payments: Payment[]; total: number; size: number; summary: { paidPaise: number; paid: number; failed: number; created: number } }>("/payments", { status: "", purpose: "" });
  const rows = list.data?.payments ?? [];
  const s = list.data?.summary;
  return (
    <>
      {s ? (
        <div className="mb-5 grid gap-4 sm:grid-cols-4">
          <Panel>
            <Stat label="Paid online · 30 days" value={rs(s.paidPaise)} tone="text-gold" />
          </Panel>
          <Panel>
            <Stat label="Successful payments" value={num(s.paid)} tone="text-success" />
          </Panel>
          <Panel>
            <Stat label="Failed" value={num(s.failed)} tone="text-danger" />
          </Panel>
          <Panel>
            <Stat label="Started, not finished" value={num(s.created)} tone="text-amber" />
          </Panel>
        </div>
      ) : null}
      <Toolbar q={list.q} setQ={list.setQ} placeholder="Razorpay order or payment id">
        <Chips
          value={list.filters.status ?? ""}
          onChange={(value) => list.setFilter("status", value)}
          options={[
            ["", "All"],
            ["paid", "Paid"],
            ["created", "Started"],
            ["failed", "Failed"],
          ]}
        />
        <Chips
          value={list.filters.purpose ?? ""}
          onChange={(value) => list.setFilter("purpose", value)}
          options={[
            ["", "Any purpose"],
            ["seat_booking", "Seat bookings"],
            ["wallet_topup", "Wallet top-ups"],
            ["trip", "Taxi trips"],
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
            <Loading rows={8} />
          </div>
        ) : rows.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>For</th>
                  <th>Razorpay</th>
                  <th className="text-right">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="muted">{when(row.created_at)}</td>
                    <td>
                      {row.owner ? (
                        <Link href={row.owner.kind === "Captain" ? `/captains/${row.owner.id}` : `/travellers/${row.owner.id}`} className="hover:text-gold">
                          {row.owner.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                      <p className="text-[11px] muted">{row.owner?.kind}</p>
                    </td>
                    <td>
                      {label(row.purpose)}
                      {row.pnr ? (
                        <Link href={`/bookings/carpool/${row.ref_id}`} className="block text-[11px] text-gold hover:underline">
                          {row.pnr}
                        </Link>
                      ) : null}
                    </td>
                    <td className="text-[11px] muted">
                      {row.razorpay_payment_id ?? "—"}
                      <span className="block">{row.razorpay_order_id}</span>
                    </td>
                    <td className="text-right tabular-nums">{rs(row.amount_paise)}</td>
                    <td>
                      <Badge value={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="No payments match." />
        )}
      </Panel>
      {list.data ? <Pager page={list.page} size={list.data.size} total={list.data.total} onPage={list.setPage} /> : null}
    </>
  );
}

function Ledger() {
  const list = useList<{ entries: Entry[]; total: number; size: number }>("/ledger", { owner: "", kind: "" });
  const rows = list.data?.entries ?? [];
  return (
    <>
      <Toolbar>
        <Chips
          value={list.filters.owner ?? ""}
          onChange={(value) => list.setFilter("owner", value)}
          options={[
            ["", "Traveller and captain wallets"],
            ["platform", "ROVEYA platform wallet"],
          ]}
        />
        <Chips
          value={list.filters.kind ?? ""}
          onChange={(value) => list.setFilter("kind", value)}
          options={[
            ["", "All"],
            ["seat_payment", "Seat payments"],
            ["seat_refund", "Refunds"],
            ["seat_earning", "Captain earnings"],
            ["payout", "Payouts"],
            ["topup", "Top-ups"],
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
            <Loading rows={8} />
          </div>
        ) : rows.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>When</th>
                  <th>Wallet</th>
                  <th>Kind</th>
                  <th>Note</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="muted">{row.id}</td>
                    <td className="muted">{when(row.created_at)}</td>
                    <td>
                      {row.owner?.name ?? row.owner_id.slice(0, 8)}
                      <p className="text-[11px] muted">{row.owner?.kind}</p>
                    </td>
                    <td>{label(row.kind)}</td>
                    <td className="max-w-xs truncate muted">{row.note ?? row.ref_type ?? "—"}</td>
                    <td className={`text-right tabular-nums ${row.amount_paise < 0 ? "text-danger" : "text-success"}`}>{rs(row.amount_paise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="No ledger entries match." />
        )}
      </Panel>
      {list.data ? <Pager page={list.page} size={list.data.size} total={list.data.total} onPage={list.setPage} /> : null}
    </>
  );
}

export default function PaymentsPage() {
  const [tab, setTab] = useState<"payments" | "ledger">("payments");
  return (
    <>
      <PageHead
        title="All payments and ledger"
        sub="Every Razorpay payment and every ROVEYA wallet movement, across all services."
        actions={
          <Chips
            value={tab}
            onChange={(value) => setTab(value as "payments" | "ledger")}
            options={[
              ["payments", "Online payments"],
              ["ledger", "Wallet ledger"],
            ]}
          />
        }
      />
      {tab === "payments" ? <Payments /> : <Ledger />}
    </>
  );
}
