"use client";

import { use } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Toolbar, useList } from "@/components/list";
import { PageHead } from "@/components/Shell";
import { Avatar, Empty, Failure, Loading, Pager, Panel } from "@/components/ui";
import { dateOnly, num, rs, when } from "@/lib/format";
import { isService, ridersTitle, SERVICE_INFO, type ServiceKey } from "@/lib/services";

type Passenger = { user_id: string; name: string; phone: string; email: string | null; created_at: string; walletPaise: number; bookings: number; completed: number; spentPaise: number; lastAt: string | null };

const LEAD: Record<ServiceKey, string> = {
  bike: "Passengers who have booked a ROVEYA Bike ride.",
  auto: "Passengers who have booked a ROVEYA Auto ride.",
  taxi: "Passengers who have booked a ROVEYA Taxi ride. ROVEYA Taxi is not live yet.",
  carpool: "Travellers who have booked a seat on ROVEYA Carpool Travels.",
};

// ROVEYA Riders: the passengers who travel with each service.
export default function RidersPage({ params }: { params: Promise<{ service: string }> }) {
  const { service } = use(params);
  if (!isService(service)) notFound();
  return <Riders key={service} kind={service} />;
}

function Riders({ kind }: { kind: ServiceKey }) {
  const list = useList<{ travellers: Passenger[]; total: number; size: number }>("/travellers", { kind });
  const rows = list.data?.travellers ?? [];
  const carpool = kind === "carpool";
  return (
    <>
      <PageHead title={ridersTitle(kind)} sub={LEAD[kind]} />
      <Toolbar q={list.q} setQ={list.setQ} placeholder="Name, phone or email" />
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
                  <th>Passenger</th>
                  <th>Email</th>
                  <th>{carpool ? "Bookings" : "Rides"}</th>
                  <th>Completed</th>
                  <th>Spent</th>
                  <th>Last {carpool ? "booking" : "ride"}</th>
                  <th>ROVEYA Cash</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.user_id}>
                    <td>
                      <Link href={`/travellers/${row.user_id}`} className="flex items-center gap-3">
                        <Avatar name={row.name} />
                        <span>
                          <span className="block font-medium text-sky hover:underline">{row.name}</span>
                          <span className="block text-[11px] muted">{row.phone}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="muted">{row.email ?? "—"}</td>
                    <td>{num(row.bookings)}</td>
                    <td>{num(row.completed)}</td>
                    <td className="tabular-nums">{rs(row.spentPaise)}</td>
                    <td className="muted">{row.lastAt ? when(row.lastAt) : "—"}</td>
                    <td className="tabular-nums">{rs(row.walletPaise)}</td>
                    <td className="muted">{dateOnly(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text={list.q ? "No passengers match." : `Nobody has booked ${SERVICE_INFO[kind].name} yet.`} />
        )}
      </Panel>
      {list.data ? <Pager page={list.page} size={list.data.size} total={list.data.total} onPage={list.setPage} /> : null}
    </>
  );
}
