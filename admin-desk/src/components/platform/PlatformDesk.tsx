"use client";

import { useCallback, useEffect, useState } from "react";
import { desk } from "@/lib/desk-api";
import { formatMobile } from "@/lib/format";
import { CouponsSection } from "./Coupons";
import { CaptainsSection, PassengersSection } from "./People";
import { SupportSection } from "./Support";
import { TripDetail, TripTable, TripsSection } from "./Trips";
import { Act, Badge, Block, Grid, Pills, Stat, ago, inr, when, type Row } from "./ui";

export type PlatformSection = "live" | "captains" | "passengers" | "trips" | "payouts" | "support" | "coupons" | "fares" | "notify" | "ads" | "audit";

export const platformNav: { id: PlatformSection; label: string; hint: string }[] = [
  { id: "live", label: "Live board", hint: "Captains on duty, rides in progress, and what needs the desk now." },
  { id: "captains", label: "Captains", hint: "Review documents, approve, pause, and see every captain's rides and wallet." },
  { id: "passengers", label: "Passengers", hint: "App passengers, their rides, wallet, coupons, and holds." },
  { id: "trips", label: "City rides", hint: "Every bike, auto, and cab ride. Cancel, refund, or confirm cash." },
  { id: "payouts", label: "Captain payouts", hint: "Captain wallet redemptions waiting for a bank transfer." },
  { id: "support", label: "Support desk", hint: "Claims and questions from passengers and captains." },
  { id: "coupons", label: "Coupons", hint: "Codes the server checks and applies at booking." },
  { id: "fares", label: "Fares and rules", hint: "Rate card, commission, bonuses, and matching rules for the apps." },
  { id: "notify", label: "Notifications", hint: "Send a message to captains or passengers, and see what went out." },
  { id: "ads", label: "Ads", hint: "Campaigns in both apps, advertisers, and ad credit." },
  { id: "audit", label: "Audit log", hint: "Every desk action on the ride platform, with who did it." },
];

export function PlatformSectionView({ section, ceo, onNotice, onOpen }: { section: PlatformSection; ceo: boolean; onNotice: (text: string) => void; onOpen: (section: PlatformSection) => void }) {
  if (section === "live") return <LiveBoard ceo={ceo} onNotice={onNotice} onOpen={onOpen} />;
  if (section === "captains") return <CaptainsSection ceo={ceo} onNotice={onNotice} />;
  if (section === "passengers") return <PassengersSection ceo={ceo} onNotice={onNotice} />;
  if (section === "trips") return <TripsSection ceo={ceo} onNotice={onNotice} />;
  if (section === "payouts") return <Payouts ceo={ceo} onNotice={onNotice} />;
  if (section === "support") return <SupportSection ceo={ceo} onNotice={onNotice} />;
  if (section === "coupons") return <CouponsSection ceo={ceo} onNotice={onNotice} />;
  if (section === "fares") return <Fares ceo={ceo} onNotice={onNotice} />;
  if (section === "notify") return <Notify ceo={ceo} onNotice={onNotice} />;
  if (section === "ads") return <Ads onNotice={onNotice} />;
  return ceo ? <Audit onNotice={onNotice} /> : <p className="text-sm text-[#F6F1DC]/60">Only the CEO can read the audit log.</p>;
}

function LiveBoard({ ceo, onNotice, onOpen }: { ceo: boolean; onNotice: (text: string) => void; onOpen: (section: PlatformSection) => void }) {
  const [live, setLive] = useState<Row | null>(null);
  const [summary, setSummary] = useState<Row | null>(null);
  const [trip, setTrip] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([desk<Row>("/live"), desk<Row>("/overview?days=7")])
      .then(([board, overview]) => {
        setLive(board);
        setSummary(overview);
      })
      .catch((error: Error) => onNotice(error.message));
  }, [onNotice]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  if (!live || !summary) return <p className="text-sm text-[#F6F1DC]/55">Loading the live board…</p>;
  const online = live.online as Record<string, number>;
  const totals = summary.totals as Row;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Captains on duty" value={summary.live.captainsOnline} />
        <Stat label="Rides in progress" value={summary.live.openTrips} onClick={() => onOpen("trips")} />
        <Stat label="Captains to review" value={summary.live.captainsInReview} onClick={() => onOpen("captains")} />
        <Stat label="Support waiting" value={summary.live.openTickets} onClick={() => onOpen("support")} />
        <Stat label="Payouts to send" value={summary.live.pendingPayouts} onClick={() => onOpen("payouts")} />
        <Stat label="Ride value · 7 days" value={inr(totals.gmv)} />
        <Stat label="Rides done · 7 days" value={Number(totals.trips_completed ?? 0)} />
        <Stat label="Coupon cost · 7 days" value={inr(totals.discounts)} />
      </div>
      <p className="text-sm text-[#F6F1DC]/60">
        On duty now: {online.bike ?? 0} bike · {online.auto ?? 0} auto · {online.cab ?? 0} cab. Unmatched in 7 days: {Number(totals.trips_unmatched ?? 0)}. ROVEYA account balance {inr(summary.platformBalance)}.
        {ceo ? ` Event consumers behind by ${(summary.consumers as Row[]).map((row) => `${row.consumer} ${row.lag}`).join(", ")}.` : ""}
      </p>
      <Block title="Rides in progress">
        <TripTable trips={live.openTrips} onOpen={setTrip} empty="No rides in progress right now." />
      </Block>
      <Block title="Captains on duty">
        <Grid
          head={["Captain", "Vehicle", "Ride", "Last seen", "Map"]}
          empty="No captain is on duty."
          rows={(live.onlineCaptains as Row[]).map((row) => [
            <div key="c">
              <p className="font-medium">{row.captains?.name ?? "Captain"}</p>
              <p className="text-xs text-[#F6F1DC]/45">{row.captains?.captain_code} · {formatMobile(row.captains?.phone ?? "")}</p>
            </div>,
            row.vehicle,
            <Badge key="b" value={row.busy ? "On a ride" : "Free"} tone={row.busy ? "good" : undefined} />,
            ago(row.updated_at),
            row.latitude ? <a key="m" className="text-[#E0B23A] underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${row.latitude},${row.longitude}`}>Open map</a> : "—",
          ])}
        />
      </Block>
      {trip ? <TripDetail id={trip} ceo={ceo} onNotice={onNotice} onClose={() => setTrip(null)} onChanged={load} /> : null}
    </div>
  );
}

function Payouts({ ceo, onNotice }: { ceo: boolean; onNotice: (text: string) => void }) {
  const [status, setStatus] = useState("requested");
  const [payouts, setPayouts] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    desk<{ payouts: Row[] }>(`/payouts?status=${status}`)
      .then((result) => setPayouts(result.payouts))
      .catch((error: Error) => onNotice(error.message));
  }, [status, onNotice]);
  useEffect(load, [load]);

  const decide = async (payout: Row, action: "paid" | "reject") => {
    const reference = action === "paid" ? window.prompt(`Bank transfer reference (UTR) for ${inr(payout.amount)} to ${payout.captains?.name}?`)?.trim() : undefined;
    if (action === "paid" && !reference) return;
    if (action === "reject" && !window.confirm("Return this amount to the captain's wallet?")) return;
    setBusy(payout.id);
    try {
      await desk(`/payouts/${payout.id}`, { body: { action, reference } });
      onNotice("");
      load();
    } catch (error) {
      onNotice((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <Pills value={status} onChange={setStatus} options={[["requested", "To send"], ["paid", "Sent"], ["rejected", "Returned"]]} />
      {!ceo && status === "requested" ? <p className="text-sm text-[#F6F1DC]/60">Only the CEO can mark payouts as sent.</p> : null}
      <Grid
        head={["Captain", "Amount", "Bank", "Requested", status === "requested" ? "" : "Reference"]}
        empty={status === "requested" ? "No payouts are waiting." : "Nothing here yet."}
        rows={payouts.map((payout) => [
          <div key="c">
            <p className="font-medium">{payout.captains?.name}</p>
            <p className="text-xs text-[#F6F1DC]/45">{payout.captains?.captain_code} · {formatMobile(payout.captains?.phone ?? "")}</p>
          </div>,
          <p key="a" className="font-semibold">{inr(payout.amount)}</p>,
          `${payout.captains?.bank_holder ?? ""} · ••${payout.bank_last4} · ${payout.captains?.ifsc ?? ""}`,
          when(payout.created_at),
          status === "requested" ? (
            ceo ? (
              <span key="d" className="inline-flex gap-2">
                <Act label="Mark sent" disabled={busy === payout.id} onClick={() => void decide(payout, "paid")} />
                <Act label="Return" quiet disabled={busy === payout.id} onClick={() => void decide(payout, "reject")} />
              </span>
            ) : null
          ) : (
            payout.reference ?? "—"
          ),
        ])}
      />
    </div>
  );
}

function Fares({ ceo, onNotice }: { ceo: boolean; onNotice: (text: string) => void }) {
  const [settings, setSettings] = useState<Row[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    desk<{ settings: Row[] }>("/settings")
      .then((result) => {
        setSettings(result.settings);
        setValues(Object.fromEntries(result.settings.map((row) => [row.key, String(row.value)])));
      })
      .catch((error: Error) => onNotice(error.message));
  }, [onNotice]);

  const changed = settings.filter((row) => values[row.key] !== String(row.value));
  const fare = (vehicle: string, km: number) => Math.max(Number(values[`fare_${vehicle}_min`] ?? 0), Math.round(Number(values[`fare_${vehicle}_base`] ?? 0) + Number(values[`fare_${vehicle}_per_km`] ?? 0) * km));

  const save = async () => {
    setBusy(true);
    try {
      const result = await desk<{ settings: Row[] }>("/settings", { method: "PATCH", body: { values: Object.fromEntries(changed.map((row) => [row.key, Number(values[row.key])])) } });
      setSettings(result.settings);
      onNotice("Saved. New quotes use these numbers within 30 seconds.");
    } catch (error) {
      onNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const groups = [...new Set(settings.map((row) => row.group as string))];
  return (
    <div className="space-y-5">
      {!ceo ? <p className="text-sm text-[#F6F1DC]/60">Only the CEO can change fares and rules.</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <article key={group} className="panel space-y-3 p-5">
            <p className="kicker">{group}</p>
            {settings.filter((row) => row.group === group).map((row) => (
              <label key={row.key} className="flex items-center justify-between gap-4 text-sm">
                <span>{row.label} <span className="text-xs text-[#F6F1DC]/45">({row.unit}, {row.min}–{row.max})</span></span>
                <input type="number" step="any" disabled={!ceo} className="field max-w-[8rem]" value={values[row.key] ?? ""} onChange={(event) => setValues({ ...values, [row.key]: event.target.value })} />
              </label>
            ))}
          </article>
        ))}
      </div>
      {values.fare_bike_base !== undefined ? (
        <p className="text-sm text-[#F6F1DC]/65">
          With these numbers a 5 km ride costs bike {inr(fare("bike", 5))}, auto {inr(fare("auto", 5))}, cab {inr(fare("cab", 5))}. A 12 km ride: bike {inr(fare("bike", 12))}, auto {inr(fare("auto", 12))}, cab {inr(fare("cab", 12))}.
        </p>
      ) : null}
      {ceo ? <button type="button" className="btn" disabled={busy || !changed.length} onClick={() => void save()}>{busy ? "Saving…" : changed.length ? `Save ${changed.length} change${changed.length > 1 ? "s" : ""}` : "No changes"}</button> : null}
    </div>
  );
}

function Notify({ ceo, onNotice }: { ceo: boolean; onNotice: (text: string) => void }) {
  const [audience, setAudience] = useState("captains_online");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Row[]>([]);

  const load = useCallback(() => {
    desk<{ log: Row[] }>("/notify")
      .then((result) => setLog(result.log))
      .catch((error: Error) => onNotice(error.message));
  }, [onNotice]);
  useEffect(load, [load]);

  const send = async () => {
    if (!window.confirm("Send this notification now?")) return;
    setBusy(true);
    try {
      const result = await desk<{ people: number; devices: number }>("/notify", { body: { audience, title: title.trim(), body: body.trim() } });
      onNotice(`Sent to ${result.people} people on ${result.devices} phones.`);
      setTitle("");
      setBody("");
      load();
    } catch (error) {
      onNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {ceo ? (
        <form
          className="panel grid max-w-3xl gap-3 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <Pills value={audience} onChange={setAudience} options={[["captains_online", "Captains on duty"], ["captains_all", "All captains"], ["riders_all", "All passengers"]]} />
          <input className="field" maxLength={60} placeholder="Title, e.g. Rain bonus is live" value={title} onChange={(event) => setTitle(event.target.value)} required />
          <textarea className="field" maxLength={180} rows={3} placeholder="Message, up to 180 characters" value={body} onChange={(event) => setBody(event.target.value)} required />
          <button className="btn" disabled={busy || title.trim().length < 3 || body.trim().length < 3}>{busy ? "Sending…" : "Send notification"}</button>
        </form>
      ) : (
        <p className="text-sm text-[#F6F1DC]/60">Only the CEO can send group notifications. Ride and support updates go out on their own.</p>
      )}
      <Block title="Recently sent">
        <Grid head={["When", "App", "Kind", "Message", "Phones"]} rows={log.map((row) => [when(row.created_at), row.app, row.kind, <div key="m"><p>{row.title}</p><p className="text-xs text-[#F6F1DC]/45">{row.body}</p></div>, row.devices])} empty="Nothing has been sent yet." />
      </Block>
    </div>
  );
}

function Ads({ onNotice }: { onNotice: (text: string) => void }) {
  const [campaigns, setCampaigns] = useState<Row[]>([]);
  const [advertisers, setAdvertisers] = useState<Row[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const load = useCallback(() => {
    Promise.all([desk<{ campaigns: Row[] }>("/ads/campaigns"), desk<{ advertisers: Row[] }>("/ads/advertisers")])
      .then(([one, two]) => {
        setCampaigns(one.campaigns);
        setAdvertisers(two.advertisers);
      })
      .catch((error: Error) => onNotice(error.message));
  }, [onNotice]);
  useEffect(load, [load]);

  const setStatus = async (id: string, status: string) => {
    try {
      await desk(`/ads/campaigns/${id}`, { method: "PATCH", body: { status } });
      load();
    } catch (error) {
      onNotice((error as Error).message);
    }
  };

  const topup = async (advertiser: Row) => {
    const amount = Number(window.prompt(`Ad credit for ${advertiser.name}, in rupees (100 to 50,000)`));
    if (!amount) return;
    try {
      const result = await desk<{ checkout: { checkoutUrl: string } }>(`/ads/advertisers/${advertiser.id}/topup`, { body: { amount } });
      window.open(result.checkout.checkoutUrl, "_blank", "noopener");
      onNotice("A Razorpay page opened. The credit lands once the payment goes through.");
    } catch (error) {
      onNotice((error as Error).message);
    }
  };

  const addAdvertiser = async () => {
    try {
      await desk("/ads/advertisers", { body: { name: name.trim(), contactEmail: email.trim() || undefined } });
      setName("");
      setEmail("");
      load();
    } catch (error) {
      onNotice((error as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <Block title="Campaigns">
        <Grid
          head={["Campaign", "Price", "Budget", "Spent", "Views / clicks", "Status"]}
          empty="No campaigns yet."
          rows={campaigns.map((campaign) => [
            <div key="n">
              <p className="font-medium">{campaign.name}</p>
              <p className="text-xs text-[#F6F1DC]/45">{campaign.advertisers?.name} · {(campaign.ad_creatives ?? []).length} creatives</p>
            </div>,
            `${inr(campaign.bid)} ${campaign.pricing === "cpm" ? "per 1,000 views" : "per click"}`,
            `${inr(campaign.dailyBudget)} a day · ${inr(campaign.totalBudget)} total`,
            inr(campaign.spent),
            `${campaign.impressions} / ${campaign.clicks} · ${campaign.ctr}%`,
            <select key="s" className="field py-2" value={campaign.status} onChange={(event) => void setStatus(campaign.id, event.target.value)}>
              {["draft", "active", "paused", "ended"].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>,
          ])}
        />
      </Block>
      <Block title="Advertisers">
        <form
          className="panel mb-3 grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim().length >= 2) void addAdvertiser();
          }}
        >
          <input className="field" placeholder="Advertiser name" value={name} onChange={(event) => setName(event.target.value)} />
          <input className="field" placeholder="Contact email (optional)" value={email} onChange={(event) => setEmail(event.target.value)} />
          <button className="btn">Add advertiser</button>
        </form>
        <Grid
          head={["Advertiser", "Contact", "Ad credit", ""]}
          rows={advertisers.map((advertiser) => [advertiser.name, advertiser.contact_email ?? "—", inr(advertiser.balance), <Act key="t" label="Add credit" quiet onClick={() => void topup(advertiser)} />])}
          empty="No advertisers yet."
        />
      </Block>
    </div>
  );
}

function Audit({ onNotice }: { onNotice: (text: string) => void }) {
  const [entries, setEntries] = useState<Row[]>([]);
  useEffect(() => {
    desk<{ entries: Row[] }>("/audit")
      .then((result) => setEntries(result.entries))
      .catch((error: Error) => onNotice(error.message));
  }, [onNotice]);
  return (
    <Grid
      head={["When", "Who", "Action", "Record", "Details"]}
      empty="No desk actions yet."
      rows={entries.map((entry) => [
        when(entry.created_at),
        entry.admin_users ? `${entry.admin_users.name} · ${entry.admin_users.role}` : "—",
        entry.action,
        `${entry.entity} · ${String(entry.entity_id).slice(0, 13)}`,
        <code key="d" className="block max-w-md truncate text-xs text-[#F6F1DC]/60">{JSON.stringify(entry.new_data ?? {})}</code>,
      ])}
    />
  );
}
