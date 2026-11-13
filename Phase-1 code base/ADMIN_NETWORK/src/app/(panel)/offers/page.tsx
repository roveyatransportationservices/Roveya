"use client";

import { useState } from "react";
import { Eye, EyeOff, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { Chips } from "@/components/list";
import { PageHead, useAdmin } from "@/components/Shell";
import { Badge, Empty, Failure, Field, Loading, Modal, Panel, Spinner, useAction, useFeedback } from "@/components/ui";
import { api, useData } from "@/lib/client";
import { dateOnly, num, rs } from "@/lib/format";

type Coupon = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  kind: "flat" | "percent";
  value: number;
  max_discount_paise: number | null;
  min_fare_paise: number;
  vehicles: string[];
  new_riders_only: boolean;
  per_rider_limit: number;
  max_redemptions: number | null;
  redeemed_count: number;
  starts_at: string;
  ends_at: string | null;
  active: boolean;
  listed: boolean;
  seatUses: number;
  discountPaise: number;
};

const SERVICES: [string, string][] = [
  ["seat", "Car seats"],
  ["cab", "Cab"],
  ["auto", "Auto"],
  ["bike", "Bike"],
];

const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 330 * 60000).toISOString().slice(0, 16) : "");
const fromLocal = (value: string) => (value ? new Date(`${value}:00+05:30`).toISOString() : null);

function CouponForm({ coupon, onClose, onSaved }: { coupon: Coupon | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    code: coupon?.code ?? "",
    title: coupon?.title ?? "",
    description: coupon?.description ?? "",
    kind: coupon?.kind ?? "flat",
    value: coupon ? String(coupon.kind === "flat" ? coupon.value / 100 : coupon.value) : "",
    maxDiscount: coupon?.max_discount_paise ? String(coupon.max_discount_paise / 100) : "",
    minFare: coupon ? String(coupon.min_fare_paise / 100) : "0",
    services: coupon?.vehicles.length ? coupon.vehicles : ["seat"],
    newRidersOnly: coupon?.new_riders_only ?? false,
    perRiderLimit: String(coupon?.per_rider_limit ?? 1),
    maxRedemptions: coupon?.max_redemptions ? String(coupon.max_redemptions) : "",
    startsAt: toLocal(coupon?.starts_at ?? new Date().toISOString()),
    endsAt: toLocal(coupon?.ends_at ?? null),
    active: coupon?.active ?? true,
    listed: coupon?.listed ?? true,
  });
  const { busy, run } = useAction();
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  const save = async () => {
    const body = {
      code: form.code,
      title: form.title,
      description: form.description,
      kind: form.kind,
      value: Number(form.value),
      maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : null,
      minFare: Number(form.minFare || 0),
      services: form.services,
      newRidersOnly: form.newRidersOnly,
      perRiderLimit: Number(form.perRiderLimit || 1),
      maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
      startsAt: fromLocal(form.startsAt) ?? undefined,
      endsAt: fromLocal(form.endsAt),
      active: form.active,
      listed: form.listed,
    };
    const done = await run("save", () => api(coupon ? `/coupons/${coupon.id}` : "/coupons", { method: coupon ? "PATCH" : "POST", body }), coupon ? "Offer saved." : "Offer created.");
    if (done) onSaved();
  };

  const preview = form.kind === "flat" ? `₹${form.value || 0} off` : `${form.value || 0}% off${form.maxDiscount ? `, up to ₹${form.maxDiscount}` : ""}`;

  return (
    <Modal title={coupon ? `Edit ${coupon.code}` : "New offer"} onClose={onClose} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Promo code" hint="Letters and numbers, 3 to 20.">
          <input className="input uppercase tracking-wider" value={form.code} onChange={(event) => set({ code: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) })} placeholder="DIWALI100" />
        </Field>
        <Field label="Title travellers see">
          <input className="input" value={form.title} onChange={(event) => set({ title: event.target.value })} placeholder="₹100 off Diwali trips" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Line under the title">
            <input className="input" value={form.description} onChange={(event) => set({ description: event.target.value })} placeholder="On bookings of ₹500 or more" />
          </Field>
        </div>
        <Field label="Discount type">
          <div className="flex gap-2">
            {(["flat", "percent"] as const).map((kind) => (
              <button key={kind} type="button" onClick={() => set({ kind })} className={`btn flex-1 ${form.kind === kind ? "border-gold text-gold" : ""}`}>
                {kind === "flat" ? "Flat ₹" : "Percent %"}
              </button>
            ))}
          </div>
        </Field>
        <Field label={form.kind === "flat" ? "Amount off (₹)" : "Percent off"}>
          <input className="input" inputMode="decimal" value={form.value} onChange={(event) => set({ value: event.target.value.replace(/[^\d.]/g, "") })} />
        </Field>
        {form.kind === "percent" ? (
          <Field label="Most it can take off (₹)">
            <input className="input" inputMode="decimal" value={form.maxDiscount} onChange={(event) => set({ maxDiscount: event.target.value.replace(/[^\d.]/g, "") })} placeholder="150" />
          </Field>
        ) : null}
        <Field label="Minimum fare (₹)">
          <input className="input" inputMode="decimal" value={form.minFare} onChange={(event) => set({ minFare: event.target.value.replace(/[^\d.]/g, "") })} />
        </Field>
        <Field label="Uses per traveller">
          <input className="input" inputMode="numeric" value={form.perRiderLimit} onChange={(event) => set({ perRiderLimit: event.target.value.replace(/\D/g, "") })} />
        </Field>
        <Field label="Total uses allowed" hint="Leave empty for no limit.">
          <input className="input" inputMode="numeric" value={form.maxRedemptions} onChange={(event) => set({ maxRedemptions: event.target.value.replace(/\D/g, "") })} />
        </Field>
        <Field label="Starts (IST)">
          <input type="datetime-local" className="input" value={form.startsAt} onChange={(event) => set({ startsAt: event.target.value })} />
        </Field>
        <Field label="Ends (IST)" hint="Leave empty to keep it running.">
          <input type="datetime-local" className="input" value={form.endsAt} onChange={(event) => set({ endsAt: event.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <span className="label">Works on</span>
          <div className="flex flex-wrap gap-2">
            {SERVICES.map(([key, text]) => {
              const on = form.services.includes(key);
              return (
                <button key={key} type="button" onClick={() => set({ services: on ? form.services.filter((item) => item !== key) : [...form.services, key] })} className={`btn ${on ? "border-gold text-gold" : ""}`}>
                  {text}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-5 sm:col-span-2">
          {[
            ["newRidersOnly", "First booking only"],
            ["active", "Switched on"],
            ["listed", "Show in Offers for you (apps and website)"],
          ].map(([key, text]) => (
            <label key={key} className="flex cursor-pointer items-center gap-2 text-[13px]">
              <input type="checkbox" className="h-4 w-4 accent-[#D6A000]" checked={Boolean(form[key as keyof typeof form])} onChange={(event) => set({ [key]: event.target.checked } as Partial<typeof form>)} />
              {text}
            </label>
          ))}
        </div>
      </div>
      <div className="mt-5 rounded-lg border border-dashed border-gold/40 bg-burgundy/20 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gold">Preview</p>
        <p className="mt-1 font-semibold">{form.title || preview}</p>
        <p className="text-xs muted">{form.description || (Number(form.minFare) ? `On fares of ₹${form.minFare} or more` : "Any fare")}</p>
        <p className="mt-2 inline-block rounded border border-dashed border-gold px-2 py-0.5 text-xs font-bold tracking-widest text-gold">{form.code || "CODE"}</p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
        <button type="button" className="btn btn-gold" disabled={busy === "save" || !form.code || !form.title || !Number(form.value) || !form.services.length} onClick={() => void save()}>
          {busy === "save" ? <Spinner /> : null} {coupon ? "Save offer" : "Create offer"}
        </button>
      </div>
    </Modal>
  );
}

export default function OffersPage() {
  const { can } = useAdmin();
  const { ask } = useFeedback();
  const { busy, run } = useAction();
  const [state, setState] = useState("");
  const [editing, setEditing] = useState<Coupon | null | "new">(null);
  const { data, error, loading, reload } = useData<{ coupons: Coupon[] }>(`/coupons${state ? `?state=${state}` : ""}`);
  const allowed = can("offers.manage");

  const toggle = async (coupon: Coupon, patch: { active?: boolean; listed?: boolean }) => {
    const done = await run(coupon.id, () => api(`/coupons/${coupon.id}`, { method: "PATCH", body: patch }), "Offer updated.");
    if (done) void reload();
  };

  const remove = async (coupon: Coupon) => {
    if (!(await ask({ title: `Delete ${coupon.code}?`, body: coupon.redeemed_count || coupon.seatUses ? "This code has been used, so it is switched off and hidden instead, keeping booking history intact." : "This code was never used and will be removed.", confirm: "Delete", danger: true }))) return;
    const done = await run(coupon.id, () => api<{ retired?: boolean }>(`/coupons/${coupon.id}`, { method: "DELETE" }));
    if (done) {
      void reload();
    }
  };

  return (
    <>
      <PageHead
        title="Offers & promo codes"
        sub="Listed offers appear in Offers for you on the ROVEYA app and website."
        actions={
          <>
            <Chips
              value={state}
              onChange={setState}
              options={[
                ["", "All"],
                ["active", "On"],
                ["inactive", "Off"],
              ]}
            />
            {allowed ? (
              <button type="button" className="btn btn-gold" onClick={() => setEditing("new")}>
                <Plus size={14} /> New offer
              </button>
            ) : null}
          </>
        }
      />
      {error ? (
        <Failure text={error} retry={reload} />
      ) : loading || !data ? (
        <Loading rows={6} />
      ) : data.coupons.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.coupons.map((coupon) => {
            const expired = coupon.ends_at && Date.parse(coupon.ends_at) < Date.now();
            return (
              <Panel key={coupon.id} className={coupon.active && !expired ? "" : "opacity-70"}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="inline-block rounded border border-dashed border-gold px-2 py-0.5 text-xs font-bold tracking-widest text-gold">{coupon.code}</p>
                    <p className="mt-2 font-semibold">{coupon.title}</p>
                    <p className="text-xs muted">{coupon.description ?? ""}</p>
                  </div>
                  <Badge value={expired ? "expired" : coupon.active ? "active" : "inactive"}>{expired ? "Ended" : coupon.active ? "On" : "Off"}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                  <span className="muted">Discount</span>
                  <span className="text-right">{coupon.kind === "flat" ? rs(coupon.value) : `${coupon.value}%${coupon.max_discount_paise ? ` up to ${rs(coupon.max_discount_paise)}` : ""}`}</span>
                  <span className="muted">Minimum fare</span>
                  <span className="text-right">{rs(coupon.min_fare_paise)}</span>
                  <span className="muted">Works on</span>
                  <span className="text-right">{coupon.vehicles.length ? coupon.vehicles.map((item) => SERVICES.find(([key]) => key === item)?.[1] ?? item).join(", ") : "Everything"}</span>
                  <span className="muted">Limits</span>
                  <span className="text-right">
                    {coupon.per_rider_limit}/traveller{coupon.max_redemptions ? ` · ${coupon.max_redemptions} total` : ""}
                    {coupon.new_riders_only ? " · first trip" : ""}
                  </span>
                  <span className="muted">Runs</span>
                  <span className="text-right">
                    {dateOnly(coupon.starts_at)} → {coupon.ends_at ? dateOnly(coupon.ends_at) : "no end"}
                  </span>
                  <span className="muted">Used on seats</span>
                  <span className="text-right">
                    {num(coupon.seatUses)} · <span className="text-amber">{rs(coupon.discountPaise)}</span>
                  </span>
                </div>
                {allowed ? (
                  <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-4">
                    <button type="button" className="btn px-2 py-1 text-[11px]" onClick={() => setEditing(coupon)}>
                      <Pencil size={12} /> Edit
                    </button>
                    <button type="button" className="btn px-2 py-1 text-[11px]" disabled={busy === coupon.id} onClick={() => void toggle(coupon, { active: !coupon.active })}>
                      <Power size={12} /> {coupon.active ? "Switch off" : "Switch on"}
                    </button>
                    <button type="button" className="btn px-2 py-1 text-[11px]" disabled={busy === coupon.id} onClick={() => void toggle(coupon, { listed: !coupon.listed })}>
                      {coupon.listed ? <EyeOff size={12} /> : <Eye size={12} />} {coupon.listed ? "Hide" : "Show"} in apps
                    </button>
                    <button type="button" className="btn ml-auto px-2 py-1 text-[11px] text-danger" disabled={busy === coupon.id} onClick={() => void remove(coupon)}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ) : null}
              </Panel>
            );
          })}
        </div>
      ) : (
        <Panel>
          <Empty text="No offers yet. Create the first one." />
        </Panel>
      )}
      {editing ? <CouponForm coupon={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => (setEditing(null), void reload())} /> : null}
    </>
  );
}
