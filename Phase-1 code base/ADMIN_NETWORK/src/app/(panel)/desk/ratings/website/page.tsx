"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CarFront, Eye, EyeOff, Pencil, QrCode, Search, Star, Trash2 } from "lucide-react";
import { Chips } from "@/components/list";
import { PageHead, useAdmin } from "@/components/Shell";
import { Badge, Empty, Failure, Field, Loading, Modal, Panel, Spinner, useAction, useFeedback } from "@/components/ui";
import { api, useData } from "@/lib/client";
import { ago, when } from "@/lib/format";

type Review = {
  id: string;
  name: string;
  role: string | null;
  route: string | null;
  seat: string | null;
  rating: number;
  quote: string;
  image_url: string | null;
  source: "admin" | "ride" | "seat_booking" | "car_scan";
  car_plate: string | null;
  mobile: string | null;
  consent: boolean;
  published: boolean;
  created_at: string;
};

const WEBSITE = (process.env.NEXT_PUBLIC_WEBSITE_URL || "http://localhost:3005").replace(/\/$/, "");
const SOURCES: Record<Review["source"], string> = { car_scan: "Car QR scanner", seat_booking: "App rating", ride: "Ride rating", admin: "Added by team" };

function Stars({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5 text-gold" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} size={13} className={star <= value ? "fill-current" : "opacity-25"} />
      ))}
    </span>
  );
}

function EditReview({ review, onClose, onSaved }: { review: Review; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: review.name, role: review.role ?? "", route: review.route ?? "", seat: review.seat ?? "", quote: review.quote, image_url: review.image_url ?? "" });
  const { busy, run } = useAction();
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });
  const save = async () => {
    const done = await run("save", () => api(`/reviews/${review.id}`, { method: "PATCH", body: form }), "Review saved.");
    if (done) onSaved();
  };
  return (
    <Modal title={`Edit review from ${review.name}`} onClose={onClose} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name shown on the website">
          <input className="input" value={form.name} onChange={(event) => set({ name: event.target.value })} maxLength={60} />
        </Field>
        <Field label="Line under the name" hint="For example: Software engineer, weekly commute">
          <input className="input" value={form.role} onChange={(event) => set({ role: event.target.value })} maxLength={60} />
        </Field>
        <Field label="Route">
          <input className="input" value={form.route} onChange={(event) => set({ route: event.target.value })} placeholder="Hyderabad → Khammam" maxLength={80} />
        </Field>
        <Field label="Seat">
          <input className="input" value={form.seat} onChange={(event) => set({ seat: event.target.value })} placeholder="Window seat M1" maxLength={40} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Review">
            <textarea className="input min-h-28" value={form.quote} onChange={(event) => set({ quote: event.target.value })} maxLength={600} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Photo link (optional)" hint="Leave empty and the website uses one of the ROVEYA travel photos.">
            <input className="input" value={form.image_url} onChange={(event) => set({ image_url: event.target.value })} placeholder="https://" />
          </Field>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-gold" disabled={busy === "save"} onClick={() => void save()}>
          {busy === "save" ? <Spinner /> : null} Save
        </button>
      </div>
    </Modal>
  );
}

function CarSticker({ onClose }: { onClose: () => void }) {
  const [plate, setPlate] = useState("");
  const clean = plate.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  const link = `${WEBSITE}/feedback/sticker${clean ? `?car=${clean}` : ""}`;
  return (
    <Modal title="Print the in-car QR scanner" onClose={onClose}>
      <p className="text-sm muted">Each car gets its own sticker, so every review shows which car the traveller sat in. Print it, laminate it and fix it to the back of the front seat.</p>
      <div className="mt-4">
        <Field label="Car number" hint="As on the RC, for example TS09AB1234. Leave empty for a general sticker.">
          <input className="input uppercase tracking-wider" value={plate} onChange={(event) => setPlate(event.target.value)} placeholder="TS09AB1234" />
        </Field>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
        <a className="btn btn-gold" href={link} target="_blank" rel="noreferrer">
          <QrCode size={14} /> Open printable sticker
        </a>
      </div>
    </Modal>
  );
}

export default function WebsiteReviewsPage() {
  const { can } = useAdmin();
  const { ask } = useFeedback();
  const { busy, run } = useAction();
  const [state, setState] = useState("pending");
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Review | null>(null);
  const [sticker, setSticker] = useState(false);
  const params = new URLSearchParams(Object.entries({ state, source, q }).filter(([, value]) => value));
  const { data, error, loading, reload } = useData<{ reviews: Review[]; waiting: number }>(`/reviews?${params.toString()}`);
  const allowed = can("support.reply");

  const publish = async (review: Review) => {
    if (!review.published && !review.consent && !(await ask({ title: "Publish without consent?", body: `${review.name} did not tick "show my review on the website". Publish only if you have their permission.`, confirm: "Publish anyway" }))) return;
    const done = await run(review.id, () => api(`/reviews/${review.id}`, { method: "PATCH", body: { published: !review.published } }), review.published ? "Hidden from the website." : "Live on the website.");
    if (done) void reload();
  };

  const remove = async (review: Review) => {
    if (!(await ask({ title: `Delete the review from ${review.name}?`, body: "It is removed for good and cannot be brought back.", confirm: "Delete", danger: true }))) return;
    const done = await run(review.id, () => api(`/reviews/${review.id}`, { method: "DELETE" }), "Review deleted.");
    if (done) void reload();
  };

  return (
    <>
      <Link href="/desk/ratings/riders/carpool" className="mb-3 inline-flex items-center gap-1.5 text-xs muted hover:text-gold">
        <ArrowLeft size={13} /> ROVEYA Rider Carpool Rating and Review
      </Link>
      <PageHead
        title="Website reviews"
        sub={`Carpool rider reviews you publish appear in "Journeys worth sharing" on the ROVEYA website.${data ? ` ${data.waiting} waiting for review.` : ""}`}
        actions={
          <>
            <Chips
              value={state}
              onChange={setState}
              options={[
                ["pending", "Waiting"],
                ["published", "Live"],
                ["", "All"],
              ]}
            />
            <Chips
              value={source}
              onChange={setSource}
              options={[
                ["", "All sources"],
                ["car_scan", "Car QR"],
                ["seat_booking", "App"],
              ]}
            />
            <button type="button" className="btn btn-gold" onClick={() => setSticker(true)}>
              <QrCode size={14} /> Car QR sticker
            </button>
          </>
        }
      />
      <div className="mb-4 flex max-w-md items-center gap-2 rounded-md border border-line bg-panel px-3">
        <Search size={14} className="muted" />
        <input className="w-full bg-transparent py-2 text-sm outline-none" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search name, words, route, car or mobile" />
      </div>
      {error ? (
        <Failure text={error} retry={reload} />
      ) : loading || !data ? (
        <Loading rows={6} />
      ) : data.reviews.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.reviews.map((review) => (
            <Panel key={review.id} className={review.published ? "" : "border-amber/30"}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{review.name}</p>
                  <p className="truncate text-xs muted">{review.role || review.route || "No route given"}</p>
                </div>
                <Badge value={review.published ? "active" : "pending"}>{review.published ? "Live" : "Waiting"}</Badge>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <Stars value={review.rating} />
                <span className="text-[11px] muted" title={when(review.created_at)}>
                  {ago(review.created_at)}
                </span>
              </div>
              <p className="mt-3 text-[13px] leading-6 text-cream/85">&ldquo;{review.quote}&rdquo;</p>
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                <span className="muted">From</span>
                <span className="text-right">{SOURCES[review.source] ?? review.source}</span>
                {review.route ? (
                  <>
                    <span className="muted">Route</span>
                    <span className="text-right">{review.route}</span>
                  </>
                ) : null}
                {review.seat ? (
                  <>
                    <span className="muted">Seat</span>
                    <span className="text-right">{review.seat}</span>
                  </>
                ) : null}
                {review.car_plate ? (
                  <>
                    <span className="muted">Car</span>
                    <span className="flex items-center justify-end gap-1 font-semibold tracking-wider">
                      <CarFront size={12} className="text-gold" /> {review.car_plate}
                    </span>
                  </>
                ) : null}
                {review.mobile ? (
                  <>
                    <span className="muted">Mobile</span>
                    <a className="text-right text-gold" href={`tel:+91${review.mobile}`}>
                      {review.mobile}
                    </a>
                  </>
                ) : null}
                <span className="muted">Website consent</span>
                <span className={`text-right ${review.consent ? "text-success" : "text-amber"}`}>{review.consent ? "Yes" : "No"}</span>
              </div>
              {allowed ? (
                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-4">
                  <button type="button" className={`btn px-2 py-1 text-[11px] ${review.published ? "" : "btn-gold"}`} disabled={busy === review.id} onClick={() => void publish(review)}>
                    {review.published ? <EyeOff size={12} /> : <Eye size={12} />} {review.published ? "Hide from website" : "Publish"}
                  </button>
                  <button type="button" className="btn px-2 py-1 text-[11px]" onClick={() => setEditing(review)}>
                    <Pencil size={12} /> Edit
                  </button>
                  <button type="button" className="btn ml-auto px-2 py-1 text-[11px] text-danger" disabled={busy === review.id} onClick={() => void remove(review)} aria-label="Delete review">
                    <Trash2 size={12} />
                  </button>
                </div>
              ) : null}
            </Panel>
          ))}
        </div>
      ) : (
        <Panel>
          <Empty text={state === "pending" ? "No reviews waiting. New ones from the car QR scanner and the app land here." : "No reviews here yet."} />
        </Panel>
      )}
      {editing ? <EditReview review={editing} onClose={() => setEditing(null)} onSaved={() => (setEditing(null), void reload())} /> : null}
      {sticker ? <CarSticker onClose={() => setSticker(false)} /> : null}
    </>
  );
}
