"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Plus } from "lucide-react";
import { Chips, Toolbar, useList } from "@/components/list";
import { PageHead, useAdmin } from "@/components/Shell";
import { Badge, Empty, Failure, Loading, Modal, Pager, Panel, Spinner, useAction } from "@/components/ui";
import { api } from "@/lib/client";
import { downloadCsv, rs, when } from "@/lib/format";
import { bookingsTitle, SERVICE_INFO, type ServiceKey } from "@/lib/services";
import { PassengerField, PlaceField, type Passenger, type Place } from "./shared";

type Person = { id: string; name: string; phone: string; code?: string } | null;
type Ride = {
  id: string;
  code: string;
  vehicle: string;
  service: string;
  status: string;
  pickup: string;
  drop: string;
  distanceKm: number;
  owedPaise: number;
  discountPaise: number;
  payment: string;
  paymentStatus: string;
  requestedAt: string;
  rider: Person;
  captain: Person;
};

export function RideList({ service, initialStatus = "" }: { service: Exclude<ServiceKey, "carpool">; initialStatus?: string }) {
  const info = SERVICE_INFO[service];
  const { can } = useAdmin();
  const [creating, setCreating] = useState(false);
  const list = useList<{ rides: Ride[]; total: number; size: number }>("/rides", { vehicle: info.vehicle ?? "", status: initialStatus }, 30000);
  const rows = list.data?.rides ?? [];
  const base = `/bookings/${service}`;

  return (
    <>
      <PageHead
        title={bookingsTitle(service)}
        sub={info.soon ? `${info.name} is coming soon. Rides booked once it opens show up here.` : `Every ${info.name} ride, from the passenger app and the desk.`}
        actions={
          <>
            <button
              type="button"
              className="btn"
              disabled={!rows.length}
              onClick={() => downloadCsv(`roveya-${service}-bookings`, rows.map((row) => ({ ride: row.code, status: row.status, pickup: row.pickup, drop: row.drop, km: row.distanceKm, requested: row.requestedAt, passenger: row.rider?.name, passenger_phone: row.rider?.phone, captain: row.captain?.name, captain_code: row.captain?.code, fare: row.owedPaise / 100, payment: row.payment, payment_status: row.paymentStatus })))}
            >
              <Download size={14} /> Export page
            </button>
            {can("rides.manage") && !info.soon ? (
              <button type="button" className="btn btn-gold" onClick={() => setCreating(true)}>
                <Plus size={14} /> New booking
              </button>
            ) : null}
          </>
        }
      />
      <Toolbar q={list.q} setQ={list.setQ} placeholder="Ride code, place or 10-digit phone">
        <Chips
          value={list.filters.status ?? ""}
          onChange={(value) => list.setFilter("status", value)}
          options={[
            ["", "All"],
            ["open", "In progress"],
            ["completed", "Completed"],
            ["cancelled", "Cancelled"],
            ["expired", "No captain"],
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
                  <th>Ride</th>
                  <th>Pickup → drop</th>
                  <th>Requested</th>
                  <th>Passenger</th>
                  <th>Captain</th>
                  <th>Fare</th>
                  <th>Payment</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((ride) => (
                  <tr key={ride.id}>
                    <td>
                      <Link href={`${base}/${ride.id}`} className="font-semibold text-gold hover:underline">
                        {ride.code}
                      </Link>
                    </td>
                    <td className="max-w-[280px]">
                      <p className="truncate">{ride.pickup}</p>
                      <p className="truncate text-[11px] muted">
                        → {ride.drop} · {ride.distanceKm.toFixed(1)} km
                      </p>
                    </td>
                    <td className="muted">{when(ride.requestedAt)}</td>
                    <td>
                      {ride.rider ? (
                        <Link href={`/travellers/${ride.rider.id}`} className="hover:text-gold">
                          {ride.rider.name}
                          <span className="block text-[11px] muted">{ride.rider.phone}</span>
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {ride.captain ? (
                        <Link href={`/captains/${ride.captain.id}`} className="hover:text-gold">
                          {ride.captain.name}
                          <span className="block text-[11px] muted">{ride.captain.code}</span>
                        </Link>
                      ) : (
                        <span className="muted">Not assigned</span>
                      )}
                    </td>
                    <td className="tabular-nums">
                      {rs(ride.owedPaise)}
                      {ride.discountPaise ? <span className="block text-[11px] text-rose">−{rs(ride.discountPaise)} coupon</span> : null}
                    </td>
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
          <Empty text={info.soon ? `No ${info.name} rides yet. ${info.name} is coming soon.` : `No ${info.name} rides match.`} />
        )}
      </Panel>
      {list.data ? <Pager page={list.page} size={list.data.size} total={list.data.total} onPage={list.setPage} /> : null}
      {creating ? <NewRide service={service} onClose={() => setCreating(false)} /> : null}
    </>
  );
}

type Quote = { km: number; etaMin: number; farePaise: number; bonusPaise: number };

function NewRide({ service, onClose }: { service: "bike" | "auto" | "taxi"; onClose: () => void }) {
  const info = SERVICE_INFO[service];
  const router = useRouter();
  const { busy, run } = useAction();
  const [phone, setPhone] = useState("");
  const [passenger, setPassenger] = useState<Passenger | null>(null);
  const [pickup, setPickup] = useState<Place | null>(null);
  const [drop, setDrop] = useState<Place | null>(null);
  const [payment, setPayment] = useState<"cash" | "upi" | "online">("cash");
  const [quote, setQuote] = useState<{ value: Quote | null; error: string }>({ value: null, error: "" });
  const requestKey = useRef(`desk${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`);

  useEffect(() => {
    if (!pickup || !drop) {
      setQuote({ value: null, error: "" });
      return;
    }
    api<{ quote: Quote }>(`/desk?vehicle=${info.vehicle}&from=${pickup.latitude},${pickup.longitude}&to=${drop.latitude},${drop.longitude}`)
      .then(({ quote: value }) => setQuote({ value, error: "" }))
      .catch((failure: Error) => setQuote({ value: null, error: failure.message }));
  }, [pickup, drop, info.vehicle]);

  const ready = Boolean(passenger && !passenger.openRide && pickup && drop && quote.value);

  const submit = async () => {
    if (!pickup || !drop) return;
    const result = await run("create", () => api<{ ride: { id: string; code: string } }>("/rides", { body: { vehicle: info.vehicle, phone, pickup: { name: pickup.name, latitude: pickup.latitude, longitude: pickup.longitude }, drop: { name: drop.name, latitude: drop.latitude, longitude: drop.longitude }, payment, requestKey: requestKey.current } }), "Ride booked. Offering it to the nearest captain.");
    if (result) router.push(`/bookings/${service}/${result.ride.id}`);
  };

  return (
    <Modal title={`New ${info.name} booking`} onClose={onClose} locked={Boolean(busy)}>
      <div className="space-y-4">
        <PassengerField phone={phone} setPhone={setPhone} onPassenger={setPassenger} />
        <PlaceField label="Pickup" value={pickup} onChange={setPickup} />
        <PlaceField label="Drop" value={drop} onChange={setDrop} />
        <div>
          <span className="label">Payment</span>
          <Chips
            value={payment}
            onChange={(value) => setPayment(value as "cash" | "upi" | "online")}
            options={[
              ["cash", "Cash to captain"],
              ["upi", "UPI to captain"],
              ["online", "Online payment"],
            ]}
          />
        </div>
        {quote.value ? (
          <div className="rounded-lg border border-line px-4 py-3 text-[13px]">
            <p className="flex justify-between">
              <span>Fare</span>
              <span className="font-semibold text-gold">{rs(quote.value.farePaise)}</span>
            </p>
            <p className="text-[11px] muted">
              About {quote.value.km.toFixed(1)} km · {quote.value.etaMin} min{quote.value.bonusPaise ? ` · peak-hour captain bonus ${rs(quote.value.bonusPaise)}` : ""}
            </p>
          </div>
        ) : quote.error ? (
          <p className="text-[12px] text-danger">{quote.error}</p>
        ) : null}
        {passenger?.openRide ? <p className="text-[12px] text-amber">This passenger already has {passenger.openRide.code} in progress. Finish or cancel it first.</p> : null}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose} disabled={Boolean(busy)}>
          Close
        </button>
        <button type="button" className="btn btn-gold" disabled={!ready || Boolean(busy)} onClick={() => void submit()}>
          {busy ? <Spinner /> : null} Book ride
        </button>
      </div>
    </Modal>
  );
}
