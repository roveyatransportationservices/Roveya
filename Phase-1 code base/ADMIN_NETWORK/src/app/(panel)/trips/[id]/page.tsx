"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Ban, CheckCheck, CircleDot as Steering, MapPin, Play, Save } from "lucide-react";
import { AssignButton, CallButton } from "@/components/actions";
import { PageHead, useAdmin } from "@/components/Shell";
import { Badge, Empty, Failure, Loading, Panel, Row, Spinner, useAction, useFeedback } from "@/components/ui";
import { api, useData } from "@/lib/client";
import { label, route, rs, when } from "@/lib/format";
import { isCaptainChair, layoutInfo } from "@/lib/rules";

type Seat = { seat_id: string; label: string; seat_row: number; seat_col: number; is_window: boolean; price_paise: number; state: string; gender: string | null; booking_id: string | null; offline_note: string | null };
type Detail = {
  trip: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  captain: { id: string; name: string; phone: string } | null;
  seats: Seat[];
  bookings: { id: string; pnr: string; status: string; seat_ids: string[]; paid_paise: number; profit_paise: number; refund_paise: number; phone: string; created_at: string; rider: { id: string; name: string } | null }[];
  position: { latitude: number; longitude: number; speed_kmh: number; updated_at: string } | null;
  incidents: { id: string; code: string; kind: string; status: string; created_at: string }[];
};

export default function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useAdmin();
  const { ask } = useFeedback();
  const { busy, run } = useAction();
  const { data, error, loading, reload, setData } = useData<Detail>(`/trips/${id}`, 30000);
  const [prices, setPrices] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data) setPrices(Object.fromEntries(data.seats.map((seat) => [seat.seat_id, String(seat.price_paise / 100)])));
  }, [data]);

  if (error) return <Failure text={error} retry={reload} />;
  if (loading || !data) return <Loading rows={10} />;
  const t = data.trip;
  const editable = can("trips.manage") && t.status === "scheduled";
  const rows = Math.max(0, ...data.seats.map((seat) => seat.seat_row)) + 1;
  const changed = data.seats.filter((seat) => seat.state === "available" && Number(prices[seat.seat_id]) !== seat.price_paise / 100);

  const act = async (action: "cancel" | "start" | "complete") => {
    let reason: string | null = "yes";
    if (action === "cancel") {
      reason = await ask({ title: `Cancel ${t.code}?`, body: `Every traveller on this trip gets a full refund to ROVEYA Cash. ${data.bookings.filter((b) => b.status === "confirmed").length} confirmed bookings are affected.`, confirm: "Cancel trip", danger: true, input: { label: "Reason travellers will see", placeholder: "Car breakdown", required: true } });
    } else {
      reason = await ask({ title: action === "start" ? "Start this trip?" : "Complete this trip?", body: action === "start" ? "Travellers are told the car has left." : "Seat fares less commission go to the captain's wallet now.", confirm: action === "start" ? "Start trip" : "Complete trip" });
    }
    if (!reason) return;
    const next = await run(action, () => api<Detail>(`/trips/${id}`, { body: { action, reason: action === "cancel" ? reason : undefined } }), action === "cancel" ? "Trip cancelled and refunded." : action === "start" ? "Trip started." : "Trip completed and captain paid.");
    if (next) setData(next);
  };

  const savePrices = async () => {
    const next = await run("prices", () => api<Detail & { repriced: string[] }>(`/trips/${id}`, { method: "PATCH", body: { seats: changed.map((seat) => ({ seatId: seat.seat_id, price: Number(prices[seat.seat_id]) })) } }), "Seat prices updated.");
    if (next) setData(next);
  };

  const freeOffline = async (seat: Seat) => {
    if (!(await ask({ title: `Free seat ${seat.label}?`, body: "The captain marked this seat as sold outside the app. Freeing it opens it for booking in the ROVEYA app and website again.", confirm: "Free seat" }))) return;
    const next = await run(`free-${seat.seat_id}`, () => api<Detail>(`/trips/${id}`, { method: "PATCH", body: { unblock: [seat.seat_id] } }), "Seat is open for booking again.");
    if (next) setData(next);
  };

  const toggleWomen = async () => {
    const next = await run("women", () => api<Detail>(`/trips/${id}`, { method: "PATCH", body: { womenFriendly: !t.women_friendly } }), "Trip updated.");
    if (next) setData(next);
  };

  const seatAt = (row: number, col: number) => data.seats.find((seat) => seat.seat_row === row && seat.seat_col === col);

  return (
    <>
      <Link href="/trips" className="mb-3 inline-flex items-center gap-1.5 text-xs muted hover:text-gold">
        <ArrowLeft size={14} /> Carpool trips
      </Link>
      <PageHead
        title={`${t.code} · ${route(t.from_city, t.to_city)}`}
        sub={`Departs ${when(t.depart_at)} · arrives ${when(t.arrive_at)}`}
        actions={
          <>
            {data.captain ? <CallButton phone={data.captain.phone} name={data.captain.name} kind="Captain" entity="trip" entityId={id} /> : null}
            <AssignButton title={`Check on ${t.code} · ${route(t.from_city, t.to_city)}`} entity="trip" entityId={id} link={`/trips/${id}`} />
            {can("trips.manage") ? (
            <>
              {t.status === "scheduled" ? (
                <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => void act("start")}>
                  {busy === "start" ? <Spinner /> : <Play size={14} />} Start
                </button>
              ) : null}
              {t.status === "scheduled" || t.status === "on_trip" ? (
                <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => void act("complete")}>
                  {busy === "complete" ? <Spinner /> : <CheckCheck size={14} />} Complete
                </button>
              ) : null}
              {t.status === "scheduled" ? (
                <button type="button" className="btn btn-danger" disabled={Boolean(busy)} onClick={() => void act("cancel")}>
                  {busy === "cancel" ? <Spinner /> : <Ban size={14} />} Cancel trip
                </button>
              ) : null}
            </>
            ) : null}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Trip" action={<Badge value={t.status} />}>
          <Row
            label="Captain"
            value={
              data.captain ? (
                <Link href={`/captains/${data.captain.id}`} className="text-sky hover:underline">
                  {data.captain.name} · {data.captain.phone}
                </Link>
              ) : (
                "—"
              )
            }
          />
          <Row label="Car" value={`${t.make_model} · ${t.car_class}`} />
          <Row label="Number plate" value={t.plate} />
          <Row label="Base fare" value={rs(t.base_fare_paise)} />
          <Row
            label="Women friendly"
            value={
              editable ? (
                <button type="button" onClick={() => void toggleWomen()} className={`rounded px-2 py-0.5 text-[11px] font-semibold ${t.women_friendly ? "bg-rose/20 text-rose" : "bg-cream/10 text-cream/60"}`}>
                  {busy === "women" ? "…" : t.women_friendly ? "Yes · switch off" : "No · switch on"}
                </button>
              ) : t.women_friendly ? (
                "Yes"
              ) : (
                "No"
              )
            }
          />
          {t.cancel_reason ? <Row label="Cancel reason" value={t.cancel_reason} /> : null}
          <div className="my-2 border-t border-line" />
          <p className="mb-1 text-[11px] muted">Boarding points</p>
          {(t.boarding ?? []).map((stop: { id: string; name: string; landmark: string }) => (
            <p key={stop.id} className="flex items-start gap-1.5 text-[13px]">
              <MapPin size={13} className="mt-0.5 shrink-0 text-gold" /> {stop.name} <span className="muted">· {stop.landmark}</span>
            </p>
          ))}
          <p className="mb-1 mt-2 text-[11px] muted">Drop points</p>
          {(t.drops ?? []).map((stop: { id: string; name: string; landmark: string }) => (
            <p key={stop.id} className="flex items-start gap-1.5 text-[13px]">
              <MapPin size={13} className="mt-0.5 shrink-0 text-rose" /> {stop.name} <span className="muted">· {stop.landmark}</span>
            </p>
          ))}
        </Panel>

        <Panel title="Seat map and prices" action={editable && changed.length ? <button type="button" className="btn btn-gold px-2.5 py-1 text-[11px]" disabled={busy === "prices"} onClick={() => void savePrices()}>{busy === "prices" ? <Spinner /> : <Save size={13} />} Save {changed.length}</button> : null}>
          <div className="mx-auto w-full max-w-[280px] rounded-[2rem] border border-line bg-night p-4">
            <p className="mb-3 text-center text-[9px] tracking-[0.3em] muted">FRONT</p>
            <div className="space-y-2.5">
              {Array.from({ length: rows }, (_, row) => (
                <div key={row} className="grid grid-cols-3 gap-2.5">
                  {[0, 1, 2].map((col) => {
                    if (row === 0 && col === 2) {
                      return (
                        <div key={col} className="flex h-[70px] flex-col items-center justify-center rounded-xl border border-line bg-raised text-[10px] muted">
                          <Steering size={18} />
                          Captain
                        </div>
                      );
                    }
                    const seat = seatAt(row, col);
                    if (!seat) {
                      const chairs = data.seats.some((item) => item.seat_row === row && isCaptainChair(t.layout_kind ?? "", item.seat_row));
                      return (
                        <div key={col} className="flex items-center justify-center">
                          {chairs ? <span className="-rotate-90 text-[8px] font-semibold tracking-[0.3em] muted">AISLE</span> : null}
                        </div>
                      );
                    }
                    const taken = seat.state !== "available";
                    const chair = isCaptainChair(t.layout_kind ?? "", seat.seat_row);
                    return (
                      <div
                        key={col}
                        title={seat.state === "blocked" ? `Sold outside the app${seat.offline_note ? ` · ${seat.offline_note}` : ""}` : undefined}
                        className={`relative flex h-[70px] flex-col items-center justify-center rounded-xl border px-1 ${seat.state === "booked" ? (seat.gender === "Female" ? "border-rose/40 bg-rose/15" : "border-sky/30 bg-sky/10") : seat.state === "blocked" ? "border-dashed border-sky/60 bg-sky/5" : seat.state === "held" ? "border-amber/40 bg-amber/10" : "border-line bg-panel"}`}
                      >
                        {chair ? (
                          <>
                            <span className="absolute left-1 top-4 h-8 w-[3px] rounded-full bg-gold/40" />
                            <span className="absolute right-1 top-4 h-8 w-[3px] rounded-full bg-gold/40" />
                          </>
                        ) : null}
                        <span className="text-[10px] font-semibold">
                          {seat.label}
                          {chair ? " · C" : seat.is_window ? " · W" : ""}
                        </span>
                        {editable && !taken ? (
                          <input
                            className="mt-1 w-full rounded border border-line bg-night px-1 py-0.5 text-center text-[11px] tabular-nums outline-none focus:border-gold"
                            inputMode="numeric"
                            value={prices[seat.seat_id] ?? ""}
                            onChange={(event) => setPrices({ ...prices, [seat.seat_id]: event.target.value.replace(/[^\d]/g, "") })}
                            aria-label={`Price for seat ${seat.label}`}
                          />
                        ) : (
                          <span className="mt-0.5 text-[11px] tabular-nums">{rs(seat.price_paise)}</span>
                        )}
                        {seat.state === "blocked" && can("trips.manage") && (t.status === "scheduled" || t.status === "on_trip") ? (
                          <button type="button" className="text-[9px] text-sky underline" disabled={busy === `free-${seat.seat_id}`} onClick={() => void freeOffline(seat)}>
                            Outside · free
                          </button>
                        ) : (
                          <span className={`text-[9px] ${seat.state === "available" ? "text-success" : seat.state === "blocked" ? "text-sky" : seat.gender === "Female" ? "text-rose" : "muted"}`}>
                            {seat.state === "booked" ? (seat.gender === "Female" ? "Woman" : "Booked") : seat.state === "blocked" ? (seat.gender === "Female" ? "Outside · F" : "Outside") : seat.state}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <p className="mt-3 text-center text-[11px] muted">
            {t.layout_kind ? `${layoutInfo(t.layout_kind).title} · ` : ""}
            {editable ? "Only open seats can be repriced. Booked fares never change." : "Prices lock once the trip leaves."}
          </p>
          {t.seats_offline ? <p className="mt-1 text-center text-[11px] text-sky">{t.seats_offline} seat{t.seats_offline > 1 ? "s" : ""} sold outside the app by the captain (dashed). They show as booked to travellers.</p> : null}
        </Panel>

        <Panel title="Earnings">
          <Row label="Seats sold in the app" value={`${t.seats_booked}/${t.seats_total}`} />
          {t.seats_offline ? <Row label="Sold outside the app" value={t.seats_offline} tone="text-sky" /> : null}
          <Row label="Confirmed bookings" value={t.bookings} />
          <Row label="Seat fares" value={rs(t.fare_paise)} />
          <Row label="Collected" value={rs(t.collected_paise)} />
          <Row label="Captain share" value={rs(t.captain_share_paise)} />
          <Row label="Paid to captain wallet" value={rs(t.captain_paid_paise)} />
          <Row label="Commission" value={rs(t.commission_paise)} tone="text-sky" />
          <Row label="ROVEYA earns" value={rs(t.profit_paise)} tone="font-semibold text-gold" />
          {data.position ? (
            <>
              <div className="my-2 border-t border-line" />
              <Row label="Last position" value={`${data.position.latitude.toFixed(4)}, ${data.position.longitude.toFixed(4)}`} />
              <Row label="Speed" value={`${Math.round(data.position.speed_kmh)} km/h · ${when(data.position.updated_at)}`} />
              <a className="btn mt-2 w-full" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${data.position.latitude}&mlon=${data.position.longitude}#map=14/${data.position.latitude}/${data.position.longitude}`}>
                Open on map
              </a>
            </>
          ) : null}
          {data.incidents.length ? <div className="my-2 border-t border-line" /> : null}
          {data.incidents.map((incident) => (
            <Row key={incident.id} label={`${incident.code} · ${label(incident.kind)}`} value={<Badge value={incident.status} />} />
          ))}
        </Panel>

        <Panel title="Bookings on this trip" className="lg:col-span-3" pad={false}>
          {data.bookings.length ? (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>PNR</th>
                    <th>Traveller</th>
                    <th>Seats</th>
                    <th>Paid</th>
                    <th>Refund</th>
                    <th>ROVEYA earns</th>
                    <th>Status</th>
                    <th>Booked</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bookings.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Link href={`/bookings/carpool/${row.id}`} className="font-semibold text-gold hover:underline">
                          {row.pnr}
                        </Link>
                      </td>
                      <td>
                        {row.rider?.name ?? "—"} <span className="muted">· {row.phone}</span>
                      </td>
                      <td>{row.seat_ids.join(", ")}</td>
                      <td className="tabular-nums">{rs(row.paid_paise)}</td>
                      <td className="tabular-nums">{row.refund_paise ? rs(row.refund_paise) : "—"}</td>
                      <td className="tabular-nums text-gold">{rs(row.profit_paise)}</td>
                      <td>
                        <Badge value={row.status} />
                      </td>
                      <td className="muted">{when(row.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5">
              <Empty text="No bookings on this trip yet." />
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
