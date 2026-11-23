"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Plus } from "lucide-react";
import { Chips, Toolbar, useList } from "@/components/list";
import { PageHead, useAdmin } from "@/components/Shell";
import { Badge, Empty, Failure, Field, Loading, Modal, Pager, Panel, Spinner, useAction } from "@/components/ui";
import { api, useData } from "@/lib/client";
import { downloadCsv, route, rs, when } from "@/lib/format";
import { bookingsTitle } from "@/lib/services";
import { PassengerField, type Passenger } from "./shared";

type Booking = {
  id: string;
  pnr: string;
  status: string;
  trip_id: string;
  trip_code: string;
  from_city: string;
  to_city: string;
  depart_at: string;
  seats: number;
  seat_ids: string[];
  paid_paise: number;
  fare_paise: number;
  gst_paise: number;
  discount_paise: number;
  refund_paise: number;
  profit_paise: number;
  paid_with: string | null;
  phone: string;
  created_at: string;
  rider: { id: string; name: string } | null;
  captain: { id: string; name: string } | null;
};

export function CarpoolList({ initialStatus = "" }: { initialStatus?: string }) {
  const { can } = useAdmin();
  const [creating, setCreating] = useState(false);
  const list = useList<{ bookings: Booking[]; total: number; page: number; size: number }>("/bookings", { status: initialStatus });
  const rows = list.data?.bookings ?? [];

  return (
    <>
      <PageHead
        title={bookingsTitle("carpool")}
        sub="Every Carpool Travels seat booking, from the ROVEYA app, the website and the desk."
        actions={
          <>
            <button
              type="button"
              className="btn"
              disabled={!rows.length}
              onClick={() => downloadCsv("roveya-carpool-bookings", rows.map((row) => ({ pnr: row.pnr, status: row.status, trip: row.trip_code, route: route(row.from_city, row.to_city), departs: row.depart_at, traveller: row.rider?.name, phone: row.phone, seats: row.seat_ids.join(" "), fare: row.fare_paise / 100, gst: row.gst_paise / 100, discount: row.discount_paise / 100, paid: row.paid_paise / 100, refund: row.refund_paise / 100, profit: row.profit_paise / 100, paid_with: row.paid_with, booked: row.created_at })))}
            >
              <Download size={14} /> Export page
            </button>
            {can("bookings.manage") && can("view.trips") ? (
              <button type="button" className="btn btn-gold" onClick={() => setCreating(true)}>
                <Plus size={14} /> New booking
              </button>
            ) : null}
          </>
        }
      />
      <Toolbar q={list.q} setQ={list.setQ} placeholder="PNR, phone or trip code">
        <Chips
          value={list.filters.status ?? ""}
          onChange={(value) => list.setFilter("status", value)}
          options={[
            ["", "All"],
            ["confirmed", "Confirmed"],
            ["completed", "Completed"],
            ["pending", "Paying"],
            ["cancelled", "Cancelled"],
            ["expired", "Expired"],
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
                  <th>PNR</th>
                  <th>Traveller</th>
                  <th>Trip</th>
                  <th>Departs</th>
                  <th>Seats</th>
                  <th>Paid</th>
                  <th>ROVEYA earns</th>
                  <th>Status</th>
                  <th>Booked</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/bookings/carpool/${row.id}`} className="font-semibold text-gold hover:underline">
                        {row.pnr}
                      </Link>
                    </td>
                    <td>
                      {row.rider ? (
                        <Link href={`/travellers/${row.rider.id}`} className="hover:text-gold">
                          {row.rider.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                      <p className="text-[11px] muted">{row.phone}</p>
                    </td>
                    <td>
                      <Link href={`/trips/${row.trip_id}`} className="hover:text-gold">
                        {route(row.from_city, row.to_city)}
                      </Link>
                      <p className="text-[11px] muted">
                        {row.trip_code} · {row.captain?.name ?? ""}
                      </p>
                    </td>
                    <td className="muted">{when(row.depart_at)}</td>
                    <td>{row.seat_ids.join(", ")}</td>
                    <td className="tabular-nums">
                      {rs(row.paid_paise)}
                      {row.refund_paise ? <p className="text-[11px] text-amber">refund {rs(row.refund_paise)}</p> : null}
                    </td>
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
          <Empty text="No bookings match." />
        )}
      </Panel>
      {list.data ? <Pager page={list.page} size={list.data.size} total={list.data.total} onPage={list.setPage} /> : null}
      {creating ? <NewSeatBooking onClose={() => setCreating(false)} /> : null}
    </>
  );
}

type TripLine = { id: string; code: string; from_city: string; to_city: string; depart_at: string; captain_name?: string; plate?: string; status: string };
type Stop = { id: string; name: string; landmark?: string; offsetMin?: number };
type Seat = { seat_id: string; label: string; seat_row: number; seat_col: number; is_window: boolean; price_paise: number; state: string; gender: string | null };
type TripDetail = { trip: TripLine & { boarding: Stop[]; drops: Stop[]; women_friendly: boolean }; seats: Seat[] };
type Person = { name: string; age: string; gender: "Male" | "Female" };

// A free seat right beside a woman in the same row is for women only (the database enforces this too).
const womenOnly = (seat: Seat, seats: Seat[]) => seats.some((other) => other.seat_row === seat.seat_row && Math.abs(other.seat_col - seat.seat_col) === 1 && other.state !== "available" && other.gender === "Female");

function NewSeatBooking({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { busy, run } = useAction();
  const trips = useData<{ trips: TripLine[] }>("/trips?status=scheduled&sort=upcoming&size=50");
  const [tripId, setTripId] = useState("");
  const detail = useData<TripDetail>(tripId ? `/trips/${tripId}` : null);
  const [picked, setPicked] = useState<string[]>([]);
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [boardingId, setBoarding] = useState("");
  const [dropId, setDrop] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [passenger, setPassenger] = useState<Passenger | null>(null);
  const [secured, setSecured] = useState(false);
  const [payment, setPayment] = useState<"desk_cash" | "wallet">("desk_cash");

  const seats = useMemo(() => detail.data?.seats ?? [], [detail.data]);
  const rows = useMemo(() => [...new Set(seats.map((seat) => seat.seat_row))].sort((a, b) => a - b), [seats]);
  const fare = picked.reduce((sum, id) => sum + (seats.find((seat) => seat.seat_id === id)?.price_paise ?? 0), 0);
  const filled = picked.every((id) => people[id] && people[id].name.trim().length >= 2 && Number(people[id].age) >= 1 && Number(people[id].age) <= 99);
  const ready = Boolean(tripId && picked.length && filled && boardingId && dropId && passenger && (!passenger.status || passenger.status === "active"));

  const chooseTrip = (id: string) => {
    setTripId(id);
    setPicked([]);
    setPeople({});
    setBoarding("");
    setDrop("");
  };

  const toggle = (seat: Seat) => {
    if (seat.state !== "available") return;
    setPicked((current) => (current.includes(seat.seat_id) ? current.filter((id) => id !== seat.seat_id) : current.length >= 4 ? current : [...current, seat.seat_id]));
    setPeople((current) => (current[seat.seat_id] ? current : { ...current, [seat.seat_id]: { name: picked.length === 0 && passenger ? passenger.name : "", age: "", gender: womenOnly(seat, seats) ? "Female" : "Male" } }));
  };

  const setPerson = (id: string, patch: Partial<Person>) => setPeople((current) => ({ ...current, [id]: { ...current[id]!, ...patch } }));

  const submit = async () => {
    const body = { tripId, phone, email, secured, payment, boardingId, dropId, travellers: picked.map((id) => ({ seatId: id, name: people[id]!.name.trim(), age: Number(people[id]!.age), gender: people[id]!.gender })) };
    const result = await run("create", () => api<{ booking: { id: string; pnr: string } }>("/bookings", { body }), "Seats booked and confirmed.");
    if (result) router.push(`/bookings/carpool/${result.booking.id}`);
  };

  const trip = detail.data?.trip;
  return (
    <Modal title="New Carpool Travels booking" onClose={onClose} wide locked={Boolean(busy)}>
      <div className="space-y-4">
        <Field label="Trip">
          <select className="input" value={tripId} onChange={(event) => chooseTrip(event.target.value)}>
            <option value="">{trips.loading ? "Loading trips…" : trips.data?.trips.length ? "Pick a scheduled trip" : "No scheduled trips"}</option>
            {(trips.data?.trips ?? []).map((line) => (
              <option key={line.id} value={line.id}>
                {line.code} · {route(line.from_city, line.to_city)} · {when(line.depart_at)}
                {line.captain_name ? ` · ${line.captain_name}` : ""}
              </option>
            ))}
          </select>
        </Field>

        {tripId ? (
          detail.error ? (
            <Failure text={detail.error} retry={detail.reload} />
          ) : !trip ? (
            <Loading rows={3} />
          ) : (
            <>
              <div>
                <span className="label">Seats (up to 4)</span>
                <div className="inline-flex flex-col gap-2 rounded-lg border border-line p-3">
                  {rows.map((row) => (
                    <div key={row} className="flex gap-2">
                      {[0, 1, 2].map((col) => {
                        const seat = seats.find((item) => item.seat_row === row && item.seat_col === col);
                        if (!seat) return <span key={col} className="h-12 w-16" />;
                        const on = picked.includes(seat.seat_id);
                        const free = seat.state === "available";
                        const ladies = free && womenOnly(seat, seats);
                        return (
                          <button
                            key={col}
                            type="button"
                            disabled={!free}
                            onClick={() => toggle(seat)}
                            className={`h-12 w-16 rounded-md border text-[11px] leading-tight transition ${on ? "border-gold bg-gold text-ink" : free ? (ladies ? "border-rose/60 text-rose hover:bg-mist" : "border-line hover:bg-mist") : "cursor-not-allowed border-line opacity-40"}`}
                            title={free ? (ladies ? "Women only" : "Available") : seat.state === "held" ? "Being booked" : "Booked"}
                          >
                            <span className="block font-semibold">{seat.label}</span>
                            <span className="block">{free ? rs(seat.price_paise) : seat.gender === "Female" ? "Woman" : "Taken"}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-[11px] muted">Pink seats sit beside a woman traveller and are for women only.</p>
              </div>

              {picked.length ? (
                <div className="space-y-2">
                  <span className="label">Travellers</span>
                  {picked.map((id) => (
                    <div key={id} className="grid grid-cols-[3rem_1fr_5rem_8rem] items-center gap-2">
                      <span className="font-semibold text-gold">{seats.find((seat) => seat.seat_id === id)?.label ?? id}</span>
                      <input className="input" placeholder="Full name" value={people[id]?.name ?? ""} onChange={(event) => setPerson(id, { name: event.target.value })} />
                      <input className="input" placeholder="Age" inputMode="numeric" maxLength={2} value={people[id]?.age ?? ""} onChange={(event) => setPerson(id, { age: event.target.value.replace(/\D/g, "") })} />
                      <select className="input" value={people[id]?.gender ?? "Male"} onChange={(event) => setPerson(id, { gender: event.target.value as Person["gender"] })}>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Boarding point">
                  <select className="input" value={boardingId} onChange={(event) => setBoarding(event.target.value)}>
                    <option value="">Pick boarding</option>
                    {trip.boarding.map((stop) => (
                      <option key={stop.id} value={stop.id}>
                        {stop.name}
                        {stop.landmark ? ` · ${stop.landmark}` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Drop point">
                  <select className="input" value={dropId} onChange={(event) => setDrop(event.target.value)}>
                    <option value="">Pick drop</option>
                    {trip.drops.map((stop) => (
                      <option key={stop.id} value={stop.id}>
                        {stop.name}
                        {stop.landmark ? ` · ${stop.landmark}` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </>
          )
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <PassengerField phone={phone} setPhone={setPhone} onPassenger={setPassenger} />
          <Field label="Email for the ticket (optional)">
            <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <span className="label">Payment</span>
            <Chips
              value={payment}
              onChange={(value) => setPayment(value as "desk_cash" | "wallet")}
              options={[
                ["desk_cash", "Cash at the desk"],
                ["wallet", "ROVEYA Cash"],
              ]}
            />
          </div>
          <label className="mt-5 flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={secured} onChange={(event) => setSecured(event.target.checked)} /> Secure your trip (₹19 a seat)
          </label>
        </div>
        {picked.length ? (
          <p className="text-[12px] muted">
            Seat fare {rs(fare)} for {picked.length} seat{picked.length > 1 ? "s" : ""}. GST and Secure your trip are added when the booking is saved.
          </p>
        ) : null}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose} disabled={Boolean(busy)}>
          Close
        </button>
        <button type="button" className="btn btn-gold" disabled={!ready || Boolean(busy)} onClick={() => void submit()}>
          {busy ? <Spinner /> : null} Book seats
        </button>
      </div>
    </Modal>
  );
}
