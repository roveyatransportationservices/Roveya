"use client";

import { Suspense, use } from "react";
import Link from "next/link";
import { notFound, useSearchParams } from "next/navigation";
import { Star } from "lucide-react";
import { Chips, Toolbar, useList } from "@/components/list";
import { PageHead } from "@/components/Shell";
import { Avatar, Badge, Empty, Failure, Loading, Pager, Panel } from "@/components/ui";
import { dateOnly, rs } from "@/lib/format";
import { layoutInfo } from "@/lib/rules";
import { isService, SERVICE_INFO, vadoTitle, type ServiceKey } from "@/lib/services";

type Captain = {
  user_id: string;
  captain_code: string;
  name: string;
  phone: string;
  city: string;
  status: string;
  rating: number;
  service: string;
  vehicle: string | null;
  vehicle_no: string | null;
  vehicle_model: string | null;
  created_at: string;
  car: { id: string; make_model: string; plate: string; car_class: string; layout_kind: string; status: string } | null;
  walletPaise: number | null;
  trips: { total: number; completed: number };
  docs: { waiting: number; verified: number; rejected: number };
};

const LEAD: Record<ServiceKey, string> = {
  bike: "Bike captains: registrations, documents, vehicles, rides and wallet.",
  auto: "Auto captains: registrations, documents, vehicles, rides and wallet.",
  taxi: "Taxi captains. ROVEYA Taxi is not live yet, so new captains cannot pick it in the app.",
  carpool: "Car seat captains: registrations, documents, cars and seat layouts, trips and wallet.",
};

// ROVEYA Vado: the captains who drive for each service.
export default function VadoPage({ params }: { params: Promise<{ service: string }> }) {
  const { service } = use(params);
  if (!isService(service)) notFound();
  return (
    <Suspense>
      <Vado key={service} kind={service} />
    </Suspense>
  );
}

function Vado({ kind }: { kind: ServiceKey }) {
  const params = useSearchParams();
  const start = params.get("view") ?? params.get("status") ?? "";
  const filters = (view: string) => ({ kind, attention: view === "attention" ? "1" : "", docs: view === "docs" ? "pending" : "", status: ["review", "active", "suspended"].includes(view) ? view : "" });
  const list = useList<{ captains: Captain[]; total: number; size: number }>("/captains", filters(start), 60000);
  const rows = list.data?.captains ?? [];
  const view = list.filters.attention === "1" ? "attention" : list.filters.docs === "pending" ? "docs" : (list.filters.status ?? "");
  const carpool = kind === "carpool";
  return (
    <>
      <PageHead title={vadoTitle(kind)} sub={LEAD[kind]} />
      {SERVICE_INFO[kind].soon ? <p className="mb-4 rounded-md border border-sky/30 bg-sky/10 px-4 py-3 text-[13px] text-sky">ROVEYA Taxi is coming soon. Captains appear here once taxi sign-ups open.</p> : null}
      <Toolbar q={list.q} setQ={list.setQ} placeholder="Name, phone, captain code or city">
        <Chips
          value={view}
          onChange={(value) => {
            const next = filters(value);
            for (const [key, item] of Object.entries(next)) if (key !== "kind") list.setFilter(key, item);
          }}
          options={[
            ["", "All"],
            ["attention", "Needs approval"],
            ["docs", "Documents to verify"],
            ["review", "In review"],
            ["active", "Active"],
            ["suspended", "Suspended"],
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
                  <th>Captain</th>
                  <th>City</th>
                  <th>{carpool ? "Car" : "Vehicle"}</th>
                  <th>Documents</th>
                  <th>{carpool ? "Trips" : "Rides"}</th>
                  <th>Rating</th>
                  <th>Wallet</th>
                  <th>Joined</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.user_id}>
                    <td>
                      <Link href={`/captains/${row.user_id}`} className="flex items-center gap-3">
                        <Avatar name={row.name} />
                        <span>
                          <span className="block font-medium text-sky hover:underline">{row.name}</span>
                          <span className="block text-[11px] muted">
                            {row.captain_code} · {row.phone}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td>{row.city}</td>
                    <td>
                      {carpool ? (
                        row.car ? (
                          <>
                            {row.car.make_model} <span className="muted">· {row.car.plate}</span>
                            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] muted">
                              {layoutInfo(row.car.layout_kind).title} <Badge value={row.car.status} />
                            </p>
                          </>
                        ) : (
                          <span className="muted">No car yet</span>
                        )
                      ) : (
                        <>
                          {row.vehicle_model ?? "—"} <span className="muted">· {row.vehicle_no ?? "—"}</span>
                        </>
                      )}
                    </td>
                    <td className="text-[12px]">
                      {row.docs.waiting ? <span className="font-semibold text-amber">{row.docs.waiting} to verify</span> : <span className="text-success">{row.docs.verified} verified</span>}
                      {row.docs.rejected ? <span className="block text-danger">{row.docs.rejected} rejected</span> : null}
                    </td>
                    <td>
                      {row.trips.completed}/{row.trips.total}
                    </td>
                    <td>
                      <span className="flex items-center gap-1">
                        <Star size={12} className="text-gold" fill="currentColor" /> {Number(row.rating).toFixed(1)}
                      </span>
                    </td>
                    <td className="tabular-nums">{row.walletPaise === null ? "—" : rs(row.walletPaise)}</td>
                    <td className="muted">{dateOnly(row.created_at)}</td>
                    <td>
                      <Badge value={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text={view === "attention" ? "Nobody is waiting for approval." : `No ${SERVICE_INFO[kind].short.toLowerCase()} captains match.`} />
        )}
      </Panel>
      {list.data ? <Pager page={list.page} size={list.data.size} total={list.data.total} onPage={list.setPage} /> : null}
    </>
  );
}
