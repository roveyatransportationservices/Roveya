"use client";

import { useCallback, useEffect, useState } from "react";
import { desk } from "@/lib/desk-api";
import { Act, Badge, Grid, inr, when, type Row } from "./ui";

type Draft = {
  code: string;
  title: string;
  description: string;
  kind: "flat" | "percent";
  value: string;
  maxDiscount: string;
  minFare: string;
  vehicles: string[];
  newRidersOnly: boolean;
  perRiderLimit: string;
  maxRedemptions: string;
  endsAt: string;
  listed: boolean;
};

const blank: Draft = { code: "", title: "", description: "", kind: "flat", value: "", maxDiscount: "", minFare: "0", vehicles: [], newRidersOnly: false, perRiderLimit: "1", maxRedemptions: "", endsAt: "", listed: true };

function rule(coupon: Row) {
  return coupon.kind === "percent" ? `${coupon.value}% off${coupon.maxDiscount ? `, up to ${inr(coupon.maxDiscount)}` : ""}` : `${inr(coupon.value)} off`;
}

export function CouponsSection({ ceo, onNotice }: { ceo: boolean; onNotice: (text: string) => void }) {
  const [coupons, setCoupons] = useState<Row[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    desk<{ coupons: Row[] }>("/coupons")
      .then((result) => setCoupons(result.coupons))
      .catch((error: Error) => onNotice(error.message));
  }, [onNotice]);
  useEffect(load, [load]);

  const save = async () => {
    if (!draft) return;
    const body = {
      ...(editing ? {} : { code: draft.code.trim().toUpperCase() }),
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      kind: draft.kind,
      value: Number(draft.value),
      maxDiscount: draft.maxDiscount ? Number(draft.maxDiscount) : null,
      minFare: Number(draft.minFare || 0),
      vehicles: draft.vehicles,
      newRidersOnly: draft.newRidersOnly,
      perRiderLimit: Number(draft.perRiderLimit || 1),
      maxRedemptions: draft.maxRedemptions ? Number(draft.maxRedemptions) : null,
      endsAt: draft.endsAt ? new Date(`${draft.endsAt}T23:59:00+05:30`).toISOString() : null,
      listed: draft.listed,
    };
    setBusy(true);
    try {
      await desk(editing ? `/coupons/${editing}` : "/coupons", { method: editing ? "PATCH" : "POST", body });
      setDraft(null);
      setEditing(null);
      onNotice("");
      load();
    } catch (error) {
      onNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (coupon: Row, field: "active" | "listed") => {
    try {
      await desk(`/coupons/${coupon.id}`, { method: "PATCH", body: { [field]: !coupon[field] } });
      load();
    } catch (error) {
      onNotice((error as Error).message);
    }
  };

  const edit = (coupon: Row) => {
    setEditing(coupon.id);
    setDraft({
      code: coupon.code,
      title: coupon.title,
      description: coupon.description ?? "",
      kind: coupon.kind,
      value: String(coupon.value),
      maxDiscount: coupon.maxDiscount ? String(coupon.maxDiscount) : "",
      minFare: String(coupon.minFare ?? 0),
      vehicles: coupon.vehicles ?? [],
      newRidersOnly: coupon.new_riders_only,
      perRiderLimit: String(coupon.per_rider_limit),
      maxRedemptions: coupon.max_redemptions ? String(coupon.max_redemptions) : "",
      endsAt: coupon.ends_at ? String(coupon.ends_at).slice(0, 10) : "",
      listed: coupon.listed,
    });
  };

  return (
    <div className="space-y-4">
      {!ceo ? <p className="text-sm text-[#F6F1DC]/60">Only the CEO can create or change coupons.</p> : null}
      {ceo && !draft ? <button type="button" className="btn" onClick={() => setDraft(blank)}>New coupon</button> : null}
      {draft ? (
        <form
          className="panel grid gap-3 p-5 md:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="flex items-center justify-between md:col-span-3">
            <h2 className="display text-3xl">{editing ? `Edit ${draft.code}` : "New coupon"}</h2>
            <button type="button" className="text-xs uppercase tracking-[0.14em] text-[#F6F1DC]/60" onClick={() => { setDraft(null); setEditing(null); }}>Close</button>
          </div>
          <input className="field" placeholder="CODE, e.g. MONSOON30" value={draft.code} disabled={Boolean(editing)} onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} required />
          <input className="field md:col-span-2" placeholder="Title passengers see, e.g. ₹30 off auto rides" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required />
          <input className="field md:col-span-3" placeholder="Short description (optional)" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          <select className="field" value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as Draft["kind"] })}>
            <option value="flat">Flat rupees off</option>
            <option value="percent">Percent off</option>
          </select>
          <input className="field" type="number" min={1} placeholder={draft.kind === "flat" ? "Rupees off" : "Percent off"} value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })} required />
          <input className="field" type="number" min={1} placeholder="Most off in rupees (optional)" value={draft.maxDiscount} onChange={(event) => setDraft({ ...draft, maxDiscount: event.target.value })} />
          <label className="text-xs uppercase tracking-[0.14em] text-[#F6F1DC]/55">Minimum fare ₹<input className="field mt-2" type="number" min={0} value={draft.minFare} onChange={(event) => setDraft({ ...draft, minFare: event.target.value })} /></label>
          <label className="text-xs uppercase tracking-[0.14em] text-[#F6F1DC]/55">Uses per passenger<input className="field mt-2" type="number" min={1} value={draft.perRiderLimit} onChange={(event) => setDraft({ ...draft, perRiderLimit: event.target.value })} /></label>
          <label className="text-xs uppercase tracking-[0.14em] text-[#F6F1DC]/55">Total uses (blank = no limit)<input className="field mt-2" type="number" min={1} value={draft.maxRedemptions} onChange={(event) => setDraft({ ...draft, maxRedemptions: event.target.value })} /></label>
          <label className="text-xs uppercase tracking-[0.14em] text-[#F6F1DC]/55">Last day (blank = no end)<input className="field mt-2" type="date" value={draft.endsAt} onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })} /></label>
          <div className="flex flex-wrap items-center gap-4 text-sm md:col-span-2">
            {["bike", "auto", "cab"].map((vehicle) => (
              <label key={vehicle}>
                <input type="checkbox" className="mr-2" checked={draft.vehicles.includes(vehicle)} onChange={(event) => setDraft({ ...draft, vehicles: event.target.checked ? [...draft.vehicles, vehicle] : draft.vehicles.filter((item) => item !== vehicle) })} />
                {vehicle}
              </label>
            ))}
            <span className="text-xs text-[#F6F1DC]/45">None ticked = every vehicle</span>
          </div>
          <label className="text-sm"><input type="checkbox" className="mr-2" checked={draft.newRidersOnly} onChange={(event) => setDraft({ ...draft, newRidersOnly: event.target.checked })} />First ride only</label>
          <label className="text-sm"><input type="checkbox" className="mr-2" checked={draft.listed} onChange={(event) => setDraft({ ...draft, listed: event.target.checked })} />Show in the app's Offers</label>
          <button className="btn md:col-span-3" disabled={busy}>{busy ? "Saving…" : "Save coupon"}</button>
        </form>
      ) : null}
      <Grid
        head={["Code", "Offer", "Rules", "Used", "Coupon cost", "State", ""]}
        empty="No coupons yet."
        rows={coupons.map((coupon) => [
          <p key="c" className="font-semibold tracking-[0.12em]">{coupon.code}</p>,
          <div key="t">
            <p>{coupon.title}</p>
            <p className="text-xs text-[#F6F1DC]/45">{rule(coupon)}</p>
          </div>,
          <p key="r" className="text-xs leading-5 text-[#F6F1DC]/70">
            From {inr(coupon.minFare)} · {(coupon.vehicles ?? []).length ? coupon.vehicles.join(", ") : "all vehicles"}
            <br />
            {coupon.per_rider_limit} per passenger{coupon.new_riders_only ? " · first ride" : ""}
            <br />
            {coupon.ends_at ? `Ends ${when(coupon.ends_at)}` : "No end date"}
          </p>,
          `${coupon.redeemed_count}${coupon.max_redemptions ? ` / ${coupon.max_redemptions}` : ""}`,
          inr(coupon.spent),
          <div key="s" className="flex flex-col gap-1">
            <Badge value={coupon.active ? "Active" : "Off"} tone={coupon.active ? "good" : "quiet"} />
            {coupon.listed ? null : <span className="text-[10px] text-[#F6F1DC]/45">Hidden from Offers</span>}
          </div>,
          ceo ? (
            <span key="a" className="inline-flex flex-wrap gap-2">
              <Act label="Edit" quiet onClick={() => edit(coupon)} />
              <Act label={coupon.active ? "Switch off" : "Switch on"} quiet onClick={() => void toggle(coupon, "active")} />
            </span>
          ) : null,
        ])}
      />
    </div>
  );
}
