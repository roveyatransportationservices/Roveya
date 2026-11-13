"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, Car, CheckCircle2, Expand, FileQuestion, ShieldCheck, UserCheck, XCircle } from "lucide-react";
import { CallButton } from "@/components/actions";
import { PageHead, useAdmin } from "@/components/Shell";
import { Badge, Empty, Failure, Loading, Modal, Panel, Row, Spinner, useAction, useFeedback } from "@/components/ui";
import { api, useData } from "@/lib/client";
import { dateOnly, label, when } from "@/lib/format";
import type { ServiceKey } from "@/lib/services";
import { expiryText, typedDate } from "./dates";
import { DESK_SERVICES } from "./DeskQueue";
import { SlaTimer, useNow } from "./Timer";

type Doc = { kind: string; title: string; required: boolean; status: string; note: string | null; updatedAt: string | null; viewUrl: string | null; expires?: boolean; expiresOn?: string | null };
type Detail = {
  minutes: number;
  service: ServiceKey;
  serviceName: string;
  captain: Record<string, string | null>;
  dueAt: string;
  documents: Doc[];
  car: Record<string, string | number | boolean | string[] | null> | null;
  state: { missing: string[]; rejected: string[]; toCheck: string[]; verified: number; need: number; waitingOnVado: boolean; ready: boolean };
  claim: { admin_id: string; admin_name: string; claimed_at: string } | null;
  trail: { id: number; admin_email: string | null; action: string; detail: Record<string, unknown>; at: string }[];
};

const ACTION: Record<string, string> = {
  "desk.claim": "Opened the file",
  "document.verified": "Verified a document",
  "document.rejected": "Asked for a new photo",
  "car.approve": "Approved the car",
  "car.reject": "Asked to fix the car",
  "captain.approve": "Approved the Vado",
  "captain.decline": "Declined the registration",
  "captain.suspend": "Suspended",
};

export function DeskReview({ service, id }: { service: ServiceKey; id: string }) {
  const { admin, can } = useAdmin();
  const router = useRouter();
  const { ask, toast } = useFeedback();
  const { busy, run } = useAction();
  const now = useNow();
  const [zoom, setZoom] = useState<Doc | null>(null);
  const { data, error, loading, reload, setData } = useData<Detail>(`/desk/vado/${id}`, 15000);
  const claimed = useRef(false);
  const manage = can("captains.review");

  // Opening the file claims it so the rest of the desk sees who is on it; leaving lets it go.
  useEffect(() => {
    if (!manage) return;
    if (!data || claimed.current || data.captain.status !== "review") return;
    if (data.claim && data.claim.admin_id !== admin.id) return;
    claimed.current = true;
    void api<Detail>(`/desk/vado/${id}`, { body: { action: "claim" } }).then(setData).catch(() => undefined);
  }, [data, admin.id, id, manage, setData]);
  useEffect(
    () => () => {
      if (claimed.current) void api(`/desk/vado/${id}`, { body: { action: "release" } }).catch(() => undefined);
    },
    [id],
  );

  if (error) return <Failure text={error} retry={reload} />;
  if (loading || !data) return <Loading rows={10} />;
  const c = data.captain;
  const open = c.status === "review";
  const theirs = data.claim && data.claim.admin_id !== admin.id;

  const act = async (key: string, body: Record<string, unknown>, done: string) => {
    const next = await run(key, () => api<Detail>(`/desk/vado/${id}`, { body }), done);
    if (next) setData(next);
    return next;
  };
  const verifyDoc = async (doc: Doc) => {
    if (!doc.expires) return act(doc.kind, { action: "doc", kind: doc.kind, status: "verified" }, `${doc.title} verified.`);
    const typed = await ask({ title: `Verify ${doc.title}`, body: "Type the expiry date printed on it. The Vado is reminded before it runs out, and driving pauses if it expires.", confirm: "Verify", input: { label: "Valid until (DD/MM/YYYY)", placeholder: "31/12/2030", required: true } });
    if (!typed) return null;
    const expiresOn = typedDate(typed);
    if (!expiresOn) {
      toast("Type the date as DD/MM/YYYY, for example 31/12/2030.", "bad");
      return null;
    }
    return act(doc.kind, { action: "doc", kind: doc.kind, status: "verified", expiresOn }, `${doc.title} verified, valid until ${expiryText(expiresOn)}.`);
  };
  const rejectDoc = async (doc: Doc) => {
    const note = await ask({ title: `Ask for a new ${doc.title}?`, body: "The Vado sees this message in the captain app and uploads again.", confirm: "Send", danger: true, input: { label: "What should they fix?", placeholder: "Photo is blurred, licence number not readable", required: true } });
    if (note) await act(doc.kind, { action: "doc", kind: doc.kind, status: "rejected", note }, "Request sent to the Vado.");
  };
  const car = async (status: "verified" | "rejected") => {
    if (status === "verified") return act("car", { action: "car", status }, "Car approved.");
    const note = await ask({ title: "Ask the Vado to fix the car?", body: "They see this in the app.", confirm: "Send", danger: true, input: { label: "What should they fix?", required: true } });
    if (note) await act("car", { action: "car", status, note }, "Request sent to the Vado.");
  };
  const approve = async () => {
    const yes = await ask({ title: `Approve ${c.name}?`, body: "Their account opens at once. They can go on duty and take rides from the next moment.", confirm: "Approve Vado" });
    if (!yes) return;
    const next = await act("approve", { action: "approve" }, `${c.name} is approved and can start now.`);
    if (next) claimed.current = false;
  };
  const decline = async () => {
    const note = await ask({ title: `Decline ${c.name}'s registration?`, body: "Use this only when the person cannot drive with ROVEYA. To fix a photo, ask for a new photo instead.", confirm: "Decline", danger: true, input: { label: "Reason the Vado will see", required: true } });
    if (!note) return;
    const next = await act("decline", { action: "decline", note }, "Registration declined.");
    if (next) {
      claimed.current = false;
      router.push(`/desk/verify/${service}`);
    }
  };
  const takeOver = async () => {
    const yes = await ask({ title: "Take over this file?", body: `${data.claim?.admin_name} opened it first. Take over only if they are away.`, confirm: "Take over" });
    if (!yes) return;
    claimed.current = true;
    await act("claim", { action: "claim", force: true }, "You are now checking this Vado.");
  };

  return (
    <>
      <Link href={`/desk/verify/${service}`} className="mb-3 inline-flex items-center gap-1.5 text-xs muted hover:text-gold">
        <ArrowLeft size={14} /> {DESK_SERVICES.find((item) => item.key === service)?.label} verification
      </Link>
      <PageHead
        title={String(c.name)}
        sub={`${c.captain_code} · ${data.serviceName} · ${c.city ?? "—"} · registered ${when(c.created_at)}`}
        actions={
          <>
            <CallButton phone={c.phone} name={String(c.name)} kind="Captain" entity="captain" entityId={id} />
            {manage && open ? (
              <>
                <button type="button" className="btn btn-danger" disabled={Boolean(busy)} onClick={() => void decline()}>
                  {busy === "decline" ? <Spinner /> : <Ban size={14} />} Decline
                </button>
                <button type="button" className="btn btn-gold" disabled={Boolean(busy) || !data.state.ready} title={data.state.ready ? "" : "Verify every required document first"} onClick={() => void approve()}>
                  {busy === "approve" ? <Spinner /> : <ShieldCheck size={14} />} Approve Vado
                </button>
              </>
            ) : null}
          </>
        }
      />

      {theirs && open ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-sky/40 bg-sky/10 px-4 py-3 text-[13px] text-sky">
          <span className="flex items-center gap-2">
            <UserCheck size={15} /> {data.claim?.admin_name} is checking this Vado (since {when(data.claim?.claimed_at)}).
          </span>
          {manage ? (
            <button type="button" className="btn px-2.5 py-1 text-[12px]" onClick={() => void takeOver()}>
              Take over
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mb-5 grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        <Panel title="Time to verify">
          {open ? (
            <>
              <SlaTimer registeredAt={String(c.created_at)} dueAt={data.dueAt} paused={data.state.waitingOnVado} big now={now} />
              <p className="mt-3 text-[12px] muted">
                {data.minutes} minutes from registering. The Vado sees the same clock in the captain app.
              </p>
            </>
          ) : (
            <div className="text-[13px]">
              <Badge value={c.status === "active" ? "active" : "suspended"}>{c.status === "active" ? "Approved" : label(String(c.status))}</Badge>
              {c.approved_at ? <p className="mt-2 muted">Approved {when(c.approved_at)} · took {Math.round((Date.parse(String(c.approved_at)) - Date.parse(String(c.created_at))) / 60000)} min</p> : null}
              {c.status_note ? <p className="mt-2 muted">{c.status_note}</p> : null}
            </div>
          )}
          <div className="mt-4 space-y-1 border-t border-line pt-3 text-[12px]">
            <p className="flex items-center gap-2">
              <CheckCircle2 size={13} className="text-success" /> {data.state.verified} of {data.state.need} required documents verified
            </p>
            {data.state.toCheck.length ? <p className="text-gold">{data.state.toCheck.length} waiting for your check</p> : null}
            {data.state.missing.length ? <p className="text-amber">Not uploaded yet: {data.state.missing.map((kind) => data.documents.find((doc) => doc.kind === kind)?.title ?? kind).join(", ")}</p> : null}
            {data.state.rejected.length ? <p className="text-amber">Waiting for a new photo: {data.state.rejected.map((kind) => data.documents.find((doc) => doc.kind === kind)?.title ?? kind).join(", ")}</p> : null}
          </div>
        </Panel>
        <Panel title="Vado details">
          <Row label="Phone" value={c.phone} />
          <Row label="Email" value={c.email ?? "—"} />
          <Row label="Date of birth" value={dateOnly(c.dob)} />
          <Row label="Gender" value={c.gender ?? "—"} />
          <Row label="City" value={c.city ?? "—"} />
          <Row label="Emergency contact" value={`${c.emergency_name ?? "—"} · ${c.emergency_phone ?? ""}`} />
        </Panel>
        <Panel title={service === "carpool" ? "Car" : "Vehicle and bank"}>
          {service === "carpool" ? (
            data.car ? (
              <>
                <Row label="Car" value={`${data.car.make_model} · ${data.car.car_class}`} />
                <Row label="Number plate" value={String(data.car.plate)} />
                <Row label="Colour · year" value={`${data.car.color} · ${data.car.year}`} />
                <Row label="Seats" value={String(data.car.layout_kind)} />
                <Row label="Car status" value={<Badge value={String(data.car.status)} />} />
                {manage && open && data.car.status !== "active" ? (
                  <div className="mt-3 flex gap-2">
                    <button type="button" className="btn btn-gold flex-1 px-2 py-1 text-[12px]" disabled={Boolean(busy)} onClick={() => void car("verified")}>
                      <Car size={13} /> Approve car
                    </button>
                    <button type="button" className="btn flex-1 px-2 py-1 text-[12px]" disabled={Boolean(busy)} onClick={() => void car("rejected")}>
                      <XCircle size={13} /> Ask to fix
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <Empty text="The Vado has not added the car yet." />
            )
          ) : (
            <>
              <Row label="Vehicle" value={`${c.vehicle_model ?? "—"} · ${c.vehicle_color ?? ""}`} />
              <Row label="Number plate" value={c.vehicle_no ?? "—"} />
              <Row label="Year" value={c.vehicle_year ?? "—"} />
            </>
          )}
          <Row label="Bank" value={c.bank_last4 ? `${c.bank_holder} · ••${c.bank_last4} · ${c.ifsc}` : "—"} />
        </Panel>
      </div>

      <Panel title="Documents" className="mb-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.documents.map((doc) => (
            <div key={doc.kind} className={`rounded-lg border p-3 ${doc.status === "uploaded" ? "border-gold/50" : doc.status === "rejected" ? "border-amber/50" : doc.status === "verified" ? "border-success/40" : "border-line"}`}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="text-[13px] font-semibold">
                  {doc.title}
                  {!doc.required ? <span className="ml-1 text-[10px] font-normal muted">optional</span> : null}
                </p>
                <Badge value={doc.status === "uploaded" ? "pending" : doc.status === "missing" ? "inactive" : doc.status}>{doc.status === "uploaded" ? "To check" : doc.status === "missing" ? "Not uploaded" : label(doc.status)}</Badge>
              </div>
              {doc.viewUrl ? (
                <button type="button" onClick={() => setZoom(doc)} className="group relative block w-full overflow-hidden rounded-md border border-line bg-night">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={doc.viewUrl} alt={doc.title} className="h-40 w-full object-contain" />
                  <span className="absolute right-2 top-2 rounded bg-black/60 p-1 text-cream opacity-0 transition group-hover:opacity-100">
                    <Expand size={14} />
                  </span>
                </button>
              ) : (
                <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-line text-[12px] muted">
                  <FileQuestion size={16} className="mr-1.5" /> {doc.status === "missing" ? "Waiting for the Vado to upload" : "No image stored"}
                </div>
              )}
              {doc.note ? <p className="mt-2 text-[11px] text-amber">Asked: {doc.note}</p> : null}
              {doc.expires ? (
                <p className={`mt-2 text-[11px] ${doc.expiresOn ? (doc.expiresOn < new Date().toISOString().slice(0, 10) ? "text-danger" : "muted") : "text-amber"}`}>
                  {doc.expiresOn ? `Valid until ${expiryText(doc.expiresOn)}` : "Expiry date is asked when you verify it"}
                </p>
              ) : null}
              {manage && open && (doc.status === "uploaded" || doc.status === "verified") ? (
                <div className="mt-2 flex gap-2">
                  {doc.status !== "verified" ? (
                    <button type="button" className="btn btn-gold flex-1 px-2 py-1 text-[12px]" disabled={Boolean(busy)} onClick={() => void verifyDoc(doc)}>
                      {busy === doc.kind ? <Spinner /> : <CheckCircle2 size={13} />} Verified
                    </button>
                  ) : null}
                  <button type="button" className="btn flex-1 px-2 py-1 text-[12px]" disabled={Boolean(busy)} onClick={() => void rejectDoc(doc)}>
                    <XCircle size={13} /> Ask for a new photo
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="What happened" pad={false}>
        {data.trail.length ? (
          <ul className="divide-y divide-line">
            {data.trail.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 text-[13px]">
                <span>
                  {ACTION[entry.action] ?? label(entry.action)}
                  {typeof entry.detail?.note === "string" ? <span className="muted"> · “{entry.detail.note}”</span> : null}
                </span>
                <span className="text-[11px] muted">
                  {entry.admin_email} · {when(entry.at)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-5">
            <Empty text="Nobody has worked on this file yet." />
          </div>
        )}
      </Panel>

      {zoom?.viewUrl ? (
        <Modal title={zoom.title} onClose={() => setZoom(null)} wide>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom.viewUrl} alt={zoom.title} className="max-h-[75vh] w-full object-contain" />
          {manage && open && zoom.status === "uploaded" ? (
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => (setZoom(null), void rejectDoc(zoom))}>
                <XCircle size={14} /> Ask for a new photo
              </button>
              <button type="button" className="btn btn-gold" onClick={() => (setZoom(null), void verifyDoc(zoom))}>
                <CheckCircle2 size={14} /> Verified
              </button>
            </div>
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}
