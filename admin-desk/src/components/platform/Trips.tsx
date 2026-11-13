"use client";

import { useCallback, useEffect, useState } from "react";
import { desk } from "@/lib/desk-api";
import { formatMobile } from "@/lib/format";
import { Act, Badge, Block, Drawer, Facts, Grid, Pills, Search, ago, inr, useDebounced, when, type Row } from "./ui";

const vehicleName: Record<string, string> = { bike: "Bike", auto: "Auto", cab: "Cab" };

export function TripsSection({ ceo, onNotice }: { ceo: boolean; onNotice: (text: string) => void }) {
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState("7d");
  const [vehicle, setVehicle] = useState("all");
  const [query, setQuery] = useState("");
  const q = useDebounced(query);
  const [trips, setTrips] = useState<Row[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams({ range, q });
    if (status !== "all") params.set("status", status);
    if (vehicle !== "all") params.set("vehicle", vehicle);
    desk<{ trips: Row[] }>(`/trips?${params.toString()}`)
      .then((result) => setTrips(result.trips))
      .catch((error: Error) => onNotice(error.message));
  }, [status, range, vehicle, q, onNotice]);

  useEffect(load, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <Search value={query} onChange={setQuery} placeholder="Ride ID, place, or a 10-digit phone" />
        <div className="flex flex-wrap gap-3">
          <Pills value={status} onChange={setStatus} options={[["all", "All"], ["open", "Live"], ["completed", "Completed"], ["cancelled", "Cancelled"], ["expired", "Unmatched"]]} />
          <Pills value={range} onChange={setRange} options={[["today", "Today"], ["7d", "7 days"], ["all", "All time"]]} />
          <Pills value={vehicle} onChange={setVehicle} options={[["all", "All"], ["bike", "Bike"], ["auto", "Auto"], ["cab", "Cab"]]} />
        </div>
      </div>
      <TripTable trips={trips} onOpen={setOpen} />
      {open ? <TripDetail id={open} ceo={ceo} onNotice={onNotice} onClose={() => setOpen(null)} onChanged={load} /> : null}
    </div>
  );
}

export function TripTable({ trips, onOpen, empty }: { trips: Row[]; onOpen: (id: string) => void; empty?: string }) {
  return (
    <Grid
      head={["Ride", "Route", "Passenger", "Captain", "Fare", "Status"]}
      empty={empty ?? "No rides match these filters."}
      onOpen={(index) => onOpen(trips[index].id)}
      rows={trips.map((trip) => [
        <div key="r">
          <p className="font-medium">{trip.code}</p>
          <p className="text-xs text-[#F6F1DC]/45">{vehicleName[trip.vehicle] ?? trip.vehicle} · {when(trip.requestedAt)}</p>
        </div>,
        <div key="p" className="max-w-[16rem]">
          <p className="truncate">{trip.pickup}</p>
          <p className="truncate text-xs text-[#F6F1DC]/45">to {trip.drop}</p>
        </div>,
        trip.rider ? `${trip.rider.name} · ${formatMobile(trip.rider.phone)}` : "—",
        trip.captain ? `${trip.captain.name} · ${trip.captain.captain_code}` : "—",
        <div key="f">
          <p>{inr(trip.payable)}</p>
          {trip.discount ? <p className="text-xs text-[#F6F1DC]/45">coupon −{inr(trip.discount)}</p> : null}
          <p className="text-xs text-[#F6F1DC]/45">{trip.payment} · {trip.paymentStatus}</p>
        </div>,
        <Badge key="s" value={String(trip.status)} />,
      ])}
    />
  );
}

export function TripDetail({ id, ceo, onClose, onNotice, onChanged }: { id: string; ceo: boolean; onClose: () => void; onNotice: (text: string) => void; onChanged?: () => void }) {
  const [data, setData] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    desk<Row>(`/trips/${id}`)
      .then(setData)
      .catch((error: Error) => onNotice(error.message));
  }, [id, onNotice]);

  const act = async (action: "cancel" | "refund" | "mark_paid", question: string) => {
    const reason = window.prompt(question);
    if (!reason || reason.trim().length < 3) return;
    setBusy(true);
    try {
      setData(await desk<Row>(`/trips/${id}`, { body: { action, reason: reason.trim() } }));
      onChanged?.();
      onNotice("");
    } catch (error) {
      onNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <Drawer title="Loading ride…" onClose={onClose}><p className="text-sm text-[#F6F1DC]/55">One moment.</p></Drawer>;
  const trip = data.trip as Row;
  const live = ["searching", "assigned", "arrived", "on_trip"].includes(trip.status);
  const refundable = trip.paymentStatus === "paid" && trip.payment !== "cash";
  const cashDue = trip.payment === "cash" && trip.status === "completed" && trip.paymentStatus !== "paid";

  return (
    <Drawer
      kicker={`${vehicleName[trip.vehicle] ?? trip.vehicle} ride · ${trip.status.replaceAll("_", " ")}`}
      title={trip.code}
      onClose={onClose}
      actions={
        <>
          {live ? <Act label="Cancel ride" disabled={busy} onClick={() => void act("cancel", "Why is the desk cancelling this ride? The passenger sees this.")} /> : null}
          {refundable ? <Act label={ceo ? "Refund to wallet" : "Refund (CEO only)"} disabled={busy || !ceo} onClick={() => void act("refund", "Reason for the refund? It shows in the passenger's wallet.")} /> : null}
          {cashDue ? <Act label="Mark cash collected" disabled={busy} onClick={() => void act("mark_paid", "How was the cash confirmed?")} /> : null}
        </>
      }
    >
      <Facts
        items={[
          ["Pickup", trip.pickup],
          ["Drop", trip.drop],
          ["Distance", `${trip.distanceKm} km · ${trip.raw.route_source ?? "estimate"} route`],
          ["Requested", when(trip.requestedAt)],
          ["Passenger", trip.raw.riders ? `${trip.raw.riders.name} · ${formatMobile(trip.raw.riders.phone)}` : "—"],
          ["Captain", trip.raw.captains ? `${trip.raw.captains.name} · ${trip.raw.captains.captain_code} · ${trip.raw.captains.vehicle_no}` : "Not assigned"],
          ["Full fare", inr(trip.fare)],
          ["Coupon", data.coupon ? `${data.coupon.coupons?.code ?? ""} −${inr(data.coupon.discount)} (${data.coupon.status})` : "None"],
          ["Passenger pays", `${inr(trip.payable)} · ${trip.payment} · ${trip.paymentStatus}`],
          ["Captain bonus", inr(trip.bonus)],
          ["Cancelled", trip.cancelledBy ? `${trip.cancelledBy}: ${trip.cancelReason ?? ""}` : "—"],
          ["Completed", when(trip.completedAt)],
        ]}
      />
      <Block title="Timeline">
        <Grid head={["When", "Event"]} rows={(data.timeline as Row[]).map((event) => [when(event.created_at), event.topic])} empty="No events yet." />
      </Block>
      <Block title="Offers to captains">
        <Grid head={["Captain", "Pickup", "Result", "Sent"]} rows={(data.offers as Row[]).map((offer) => [offer.captains ? `${offer.captains.name} · ${offer.captains.captain_code}` : "—", `${offer.pickup_km} km`, <Badge key="s" value={offer.status} />, `${when(offer.created_at)} · ${ago(offer.created_at)}`])} empty="No captain has been offered this ride." />
      </Block>
      <Block title="Money">
        <Grid head={["Account", "Entry", "Amount", "When"]} rows={(data.ledger as Row[]).map((line) => [line.who, line.kind, inr(line.amount), when(line.created_at)])} empty="No ledger lines yet. They appear when the ride settles." />
      </Block>
      {(data.payments as Row[]).length ? (
        <Block title="Online payments">
          <Grid head={["Amount", "Status", "Razorpay", "When"]} rows={(data.payments as Row[]).map((payment) => [inr(payment.amount), <Badge key="s" value={payment.status} />, payment.razorpay_payment_id ?? payment.razorpay_order_id ?? "—", when(payment.created_at)])} />
        </Block>
      ) : null}
      {(data.ratings as Row[]).length ? (
        <Block title="Ratings">
          <Grid head={["By", "Stars", "Tags", "Note"]} rows={(data.ratings as Row[]).map((rating) => [rating.by_role === "rider" ? "Passenger" : "Captain", "★".repeat(rating.stars), (rating.tags ?? []).join(", ") || "—", rating.note ?? "—"])} />
        </Block>
      ) : null}
    </Drawer>
  );
}
