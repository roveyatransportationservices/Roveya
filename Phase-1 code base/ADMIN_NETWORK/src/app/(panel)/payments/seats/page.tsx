"use client";

import { useState } from "react";
import Link from "next/link";
import { List } from "lucide-react";
import { Chips } from "@/components/list";
import { Flags, PERIODS, type Flag } from "@/components/payments/shared";
import { PageHead, useAdmin } from "@/components/Shell";
import { Badge, Empty, Failure, Loading, Panel, Stat } from "@/components/ui";
import { useData } from "@/lib/client";
import { num, route, rs, when } from "@/lib/format";

type Attempt = { id: string; status: string; amountPaise: number; orderId: string | null; paymentId: string | null; at: string };
type Booking = { id: string; pnr: string; status: string; trip_id: string; trip_code: string; from_city: string; to_city: string; depart_at: string; rider_id: string; riderName: string | null; phone: string; seats: number; paid_with: string | null; paid_paise: number; refund_paise: number | null; created_at: string; attempts: Attempt[]; issues: Flag[] };
type Data = { days: number; totals: { bookings: number; problems: number; paidPaise: number; refundPaise: number; online: number; wallet: number; desk: number }; bookings: Booking[] };

export default function SeatPaymentsPage() {
  const { can } = useAdmin();
  const [days, setDays] = useState("30");
  const [problems, setProblems] = useState("1");
  const { data, error, loading, reload } = useData<Data>(`/pay/seats?days=${days}${problems === "1" ? "&problems=1" : ""}`, 60000);
  if (error) return <Failure text={error} retry={reload} />;
  const t = data?.totals;
  return (
    <>
      <PageHead
        title="Seat Payments"
        sub="Every Carpool Travels seat payment: online (Razorpay), ROVEYA Cash and cash at the desk. Problems show first so support can fix them."
        actions={
          can("view.finance") ? (
            <Link href="/payments/all" className="btn">
              <List size={14} /> All payments and ledger
            </Link>
          ) : null
        }
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <Chips value={days} onChange={setDays} options={PERIODS} />
        <Chips
          value={problems}
          onChange={setProblems}
          options={[
            ["1", `Problems${t ? ` (${t.problems})` : ""}`],
            ["", `All bookings${t ? ` (${t.bookings})` : ""}`],
          ]}
        />
      </div>
      {loading || !data || !t ? (
        <Loading rows={8} />
      ) : (
        <>
          <Panel className="mb-5">
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-4 xl:grid-cols-7">
              <Stat label="Bookings" value={num(t.bookings)} />
              <Stat label="Problems" value={num(t.problems)} tone={t.problems ? "text-danger" : "text-cream"} />
              <Stat label="Collected" value={rs(t.paidPaise)} tone="text-gold" />
              <Stat label="Refunded" value={rs(t.refundPaise)} tone="text-amber" />
              <Stat label="Paid online" value={num(t.online)} />
              <Stat label="ROVEYA Cash" value={num(t.wallet)} />
              <Stat label="Desk cash" value={num(t.desk)} />
            </div>
          </Panel>
          <Panel pad={false}>
            {data.bookings.length ? (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>PNR</th>
                      <th>Traveller</th>
                      <th>Trip</th>
                      <th>Paid</th>
                      <th>Online tries</th>
                      <th>Status</th>
                      <th>Problems</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bookings.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <Link href={`/bookings/carpool/${row.id}`} className="font-semibold text-gold hover:underline">
                            {row.pnr}
                          </Link>
                          <span className="block text-[11px] muted">{when(row.created_at)}</span>
                        </td>
                        <td>
                          <Link href={`/payments/riders/carpool/${row.rider_id}`} className="hover:text-gold">
                            {row.riderName ?? "Traveller"}
                          </Link>
                          <span className="block text-[11px] muted">{row.phone}</span>
                        </td>
                        <td>
                          {route(row.from_city, row.to_city)}
                          <span className="block text-[11px] muted">
                            {row.trip_code} · {when(row.depart_at)}
                          </span>
                        </td>
                        <td className="tabular-nums">
                          {rs(row.paid_paise)}
                          <span className="block text-[11px] muted">{row.paid_with ?? "not paid"}</span>
                          {row.refund_paise ? <span className="block text-[11px] text-amber">refund {rs(row.refund_paise)}</span> : null}
                        </td>
                        <td className="text-[12px]">
                          {row.attempts.length
                            ? row.attempts.map((attempt) => (
                                <span key={attempt.id} className="block">
                                  <Badge value={attempt.status === "created" ? "pending" : attempt.status} /> <span className="muted">{attempt.paymentId ?? attempt.orderId}</span>
                                </span>
                              ))
                            : <span className="muted">—</span>}
                        </td>
                        <td>
                          <Badge value={row.status} />
                        </td>
                        <td className="max-w-[280px]">
                          <Flags flags={row.issues} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-5">
                <Empty text={problems ? "No seat payment problems in this period." : "No seat bookings in this period."} />
              </div>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
