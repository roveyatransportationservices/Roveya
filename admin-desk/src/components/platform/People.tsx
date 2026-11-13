"use client";

import { useCallback, useEffect, useState } from "react";
import { desk } from "@/lib/desk-api";
import { formatMobile } from "@/lib/format";
import { TripDetail, TripTable } from "./Trips";
import { Act, Badge, Block, Drawer, Facts, Grid, Pills, Search, inr, useDebounced, when, WalletBlock, type Row } from "./ui";

const docLabels: Record<string, string> = {
  selfie: "Profile selfie",
  dlFront: "Licence · front",
  dlBack: "Licence · back",
  rc: "Vehicle RC",
  aadhaar: "Aadhaar",
  pan: "PAN",
};

export function CaptainsSection({ ceo, onNotice }: { ceo: boolean; onNotice: (text: string) => void }) {
  const [status, setStatus] = useState("review");
  const [query, setQuery] = useState("");
  const q = useDebounced(query);
  const [captains, setCaptains] = useState<Row[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams({ q });
    if (status !== "all") params.set("status", status);
    desk<{ captains: Row[] }>(`/captains?${params.toString()}`)
      .then((result) => setCaptains(result.captains))
      .catch((error: Error) => onNotice(error.message));
  }, [status, q, onNotice]);

  useEffect(load, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Search value={query} onChange={setQuery} placeholder="Name, phone, captain ID, plate, or city" />
        <Pills value={status} onChange={setStatus} options={[["review", "Waiting for review"], ["active", "Active"], ["suspended", "Paused"], ["all", "All"]]} />
      </div>
      <Grid
        head={["Captain", "Phone", "Vehicle", "Documents", "Status", "Joined"]}
        empty={status === "review" ? "No captains are waiting for review." : "No captains match."}
        onOpen={(index) => setOpen(captains[index].user_id)}
        rows={captains.map((captain) => {
          const docs = (captain.captain_documents ?? []) as Row[];
          const verified = docs.filter((doc) => doc.status === "verified").length;
          const rejected = docs.filter((doc) => doc.status === "rejected").length;
          return [
            <div key="n">
              <p className="font-medium">{captain.name} {captain.online ? <span className="ml-1 text-[10px] text-[#E0B23A]">● online</span> : null}</p>
              <p className="text-xs text-[#F6F1DC]/45">{captain.captain_code} · {captain.city}</p>
            </div>,
            formatMobile(captain.phone),
            `${captain.vehicle} · ${captain.vehicle_no}`,
            `${docs.length}/6 uploaded · ${verified} verified${rejected ? ` · ${rejected} to redo` : ""}`,
            <Badge key="s" value={captain.status === "review" ? "In review" : captain.status === "suspended" ? "Suspended" : "Active"} />,
            when(captain.created_at),
          ];
        })}
      />
      {open ? <CaptainDetail id={open} ceo={ceo} onNotice={onNotice} onClose={() => setOpen(null)} onChanged={load} /> : null}
    </div>
  );
}

function CaptainDetail({ id, ceo, onClose, onNotice, onChanged }: { id: string; ceo: boolean; onClose: () => void; onNotice: (text: string) => void; onChanged: () => void }) {
  const [data, setData] = useState<Row | null>(null);
  const [trip, setTrip] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    desk<Row>(`/captains/${id}`)
      .then(setData)
      .catch((error: Error) => onNotice(error.message));
  }, [id, onNotice]);
  useEffect(load, [load]);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      onNotice("");
      load();
      onChanged();
    } catch (error) {
      onNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const decide = (action: "approve" | "suspend" | "reinstate") => {
    let note: string | undefined;
    if (action === "suspend") {
      note = window.prompt("Why is this captain paused? They see this message.")?.trim();
      if (!note) return;
    }
    void run(() => desk(`/captains/${id}`, { body: { action, note } }));
  };

  const review = (kind: string, action: "verify" | "reject") => {
    let note: string | undefined;
    if (action === "reject") {
      note = window.prompt("What should the captain fix? For example: Photo is blurred, retake in daylight.")?.trim();
      if (!note) return;
    }
    void run(() => desk(`/captains/${id}/documents/${kind}`, { body: { action, note } }));
  };

  if (!data) return <Drawer title="Loading captain…" onClose={onClose}><p className="text-sm text-[#F6F1DC]/55">One moment.</p></Drawer>;
  const captain = data.captain as Row;
  const documents = new Map((data.documents as Row[]).map((doc) => [doc.kind, doc]));

  return (
    <Drawer
      kicker={`${captain.captain_code} · ${captain.status}`}
      title={captain.name}
      onClose={onClose}
      actions={
        <>
          {captain.status === "review" ? <Act label="Approve captain" disabled={busy} onClick={() => decide("approve")} /> : null}
          {captain.status === "suspended" ? <Act label="Reinstate" disabled={busy} onClick={() => decide("reinstate")} /> : null}
          {captain.status !== "suspended" ? <Act label="Pause account" quiet disabled={busy} onClick={() => decide("suspend")} /> : null}
          <a className="btn-quiet" href={`tel:+91${captain.phone}`}>Call {formatMobile(captain.phone)}</a>
        </>
      }
    >
      {captain.status_note ? <p className="rounded-2xl border border-[#D6A000]/40 bg-[#241018] px-4 py-3 text-sm text-[#E0B23A]">Paused: {captain.status_note}</p> : null}
      <Facts
        items={[
          ["Vehicle", `${captain.vehicle} · ${captain.vehicle_model} · ${captain.vehicle_color} · ${captain.vehicle_year}`],
          ["Number plate", captain.vehicle_no],
          ["City", captain.city],
          ["Date of birth", `${captain.dob} · ${captain.gender}`],
          ["Email", captain.email ?? "—"],
          ["Rating", `${captain.rating} ★`],
          ["Bank", `${captain.bank_holder} · ••${captain.bank_last4} · ${captain.ifsc}`],
          ["UPI", captain.upi ?? "—"],
          ["Emergency contact", `${captain.emergency_name} · ${formatMobile(captain.emergency_phone)}`],
          ["On duty now", data.presence?.online ? `Yes · since ${when(data.presence.online_since)}` : "No"],
          ["Completed rides", data.stats.completed],
          ["Earned (recent rides)", inr(data.stats.earned)],
        ]}
      />
      <Block title="Documents">
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(docLabels).map(([kind, label]) => {
            const doc = documents.get(kind);
            return (
              <article key={kind} className="panel p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{label}</p>
                  <Badge value={doc ? doc.status : "missing"} tone={doc ? undefined : "quiet"} />
                </div>
                {doc?.viewUrl ? (
                  <a href={doc.viewUrl} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={doc.viewUrl} alt={label} className="mt-3 h-40 w-full rounded-2xl border border-[#D6A000]/25 object-cover" />
                  </a>
                ) : (
                  <p className="mt-3 text-xs text-[#F6F1DC]/45">Not uploaded yet.</p>
                )}
                {doc?.review_note ? <p className="mt-2 text-xs text-[#E0B23A]">{doc.review_note}</p> : null}
                {doc ? (
                  <div className="mt-3 flex gap-2">
                    <Act label="Verify" disabled={busy || doc.status === "verified"} onClick={() => review(kind, "verify")} />
                    <Act label="Ask again" quiet disabled={busy} onClick={() => review(kind, "reject")} />
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </Block>
      <WalletBlock wallet={data.wallet} ceo={ceo} onAdjust={(amount, note) => run(() => desk(`/wallets/${id}`, { body: { amount, note } }))} />
      <Block title="Recent rides">
        <TripTable trips={data.trips} onOpen={setTrip} empty="No rides yet." />
      </Block>
      <Block title="Payouts">
        <Grid head={["Requested", "Amount", "Status", "UTR"]} rows={(data.payouts as Row[]).map((payout) => [when(payout.created_at), inr(payout.amount), <Badge key="s" value={payout.status} />, payout.reference ?? "—"])} empty="No payouts yet." />
      </Block>
      <Block title="What passengers said">
        <Grid head={["When", "Ride", "Stars", "Note"]} rows={(data.ratings as Row[]).map((rating) => [when(rating.created_at), rating.trips?.code ?? "—", "★".repeat(rating.stars), rating.note ?? ((rating.tags ?? []).join(", ") || "—")])} empty="No ratings yet." />
      </Block>
      {trip ? <TripDetail id={trip} ceo={ceo} onNotice={onNotice} onClose={() => setTrip(null)} /> : null}
    </Drawer>
  );
}

export function PassengersSection({ ceo, onNotice }: { ceo: boolean; onNotice: (text: string) => void }) {
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const q = useDebounced(query);
  const [riders, setRiders] = useState<Row[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams({ q });
    if (status !== "all") params.set("status", status);
    desk<{ riders: Row[] }>(`/riders?${params.toString()}`)
      .then((result) => setRiders(result.riders))
      .catch((error: Error) => onNotice(error.message));
  }, [status, q, onNotice]);
  useEffect(load, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Search value={query} onChange={setQuery} placeholder="Name, phone, or email" />
        <Pills value={status} onChange={setStatus} options={[["all", "All"], ["active", "Active"], ["blocked", "On hold"]]} />
      </div>
      <Grid
        head={["Passenger", "Phone", "Email", "Status", "Joined"]}
        empty="No passengers match."
        onOpen={(index) => setOpen(riders[index].user_id)}
        rows={riders.map((rider) => [rider.name, formatMobile(rider.phone), rider.email ?? "—", <Badge key="s" value={rider.status === "blocked" ? "Blocked" : "Active"} />, when(rider.created_at)])}
      />
      {open ? <PassengerDetail id={open} ceo={ceo} onNotice={onNotice} onClose={() => setOpen(null)} onChanged={load} /> : null}
    </div>
  );
}

function PassengerDetail({ id, ceo, onClose, onNotice, onChanged }: { id: string; ceo: boolean; onClose: () => void; onNotice: (text: string) => void; onChanged: () => void }) {
  const [data, setData] = useState<Row | null>(null);
  const [trip, setTrip] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    desk<Row>(`/riders/${id}`)
      .then(setData)
      .catch((error: Error) => onNotice(error.message));
  }, [id, onNotice]);
  useEffect(load, [load]);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      onNotice("");
      load();
      onChanged();
    } catch (error) {
      onNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const hold = (action: "block" | "unblock") => {
    let note: string | undefined;
    if (action === "block") {
      note = window.prompt("Why is this passenger on hold?")?.trim();
      if (!note) return;
    }
    void run(() => desk(`/riders/${id}`, { body: { action, note } }));
  };

  if (!data) return <Drawer title="Loading passenger…" onClose={onClose}><p className="text-sm text-[#F6F1DC]/55">One moment.</p></Drawer>;
  const rider = data.rider as Row;

  return (
    <Drawer
      kicker={`Passenger · ${rider.status}`}
      title={rider.name}
      onClose={onClose}
      actions={
        <>
          {rider.status === "blocked" ? <Act label="Lift the hold" disabled={busy} onClick={() => hold("unblock")} /> : <Act label="Put on hold" quiet disabled={busy} onClick={() => hold("block")} />}
          <a className="btn-quiet" href={`tel:+91${rider.phone}`}>Call {formatMobile(rider.phone)}</a>
        </>
      }
    >
      {rider.status_note ? <p className="rounded-2xl border border-[#D6A000]/40 bg-[#241018] px-4 py-3 text-sm text-[#E0B23A]">On hold: {rider.status_note}</p> : null}
      <Facts
        items={[
          ["Phone", formatMobile(rider.phone)],
          ["Email", rider.email ?? "—"],
          ["Joined", when(rider.created_at)],
          ["Completed rides", data.stats.completed],
          ["Cancelled by them", data.stats.cancelled],
          ["Spent (recent rides)", inr(data.stats.spent)],
        ]}
      />
      <WalletBlock wallet={data.wallet} ceo={ceo} onAdjust={(amount, note) => run(() => desk(`/wallets/${id}`, { body: { amount, note } }))} />
      <Block title="Rides">
        <TripTable trips={data.trips} onOpen={setTrip} empty="No rides yet." />
      </Block>
      <Block title="Coupons used">
        <Grid head={["When", "Code", "Ride", "Discount", "Status"]} rows={(data.coupons as Row[]).map((row) => [when(row.created_at), row.coupons?.code ?? "—", row.trips?.code ?? "—", inr(row.discount), <Badge key="s" value={row.status} />])} empty="No coupons used." />
      </Block>
      <Block title="Online payments">
        <Grid head={["When", "For", "Amount", "Status"]} rows={(data.payments as Row[]).map((row) => [when(row.created_at), row.purpose, inr(row.amount), <Badge key="s" value={row.status} />])} empty="No online payments." />
      </Block>
      {trip ? <TripDetail id={trip} ceo={ceo} onNotice={onNotice} onClose={() => setTrip(null)} /> : null}
    </Drawer>
  );
}
