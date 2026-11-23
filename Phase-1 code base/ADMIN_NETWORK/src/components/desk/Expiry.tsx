"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, CalendarPlus, Save } from "lucide-react";
import { Chips } from "@/components/list";
import { PageHead, useAdmin } from "@/components/Shell";
import { Empty, Failure, Loading, Panel, Spinner, Stat, useAction, useFeedback } from "@/components/ui";
import { api, useData } from "@/lib/client";
import { num } from "@/lib/format";
import { SERVICE_INFO, type ServiceKey } from "@/lib/services";
import { expiryText, typedDate } from "./dates";

type Doc = { captainId: string; name: string; code: string; phone: string; city: string; captainStatus: string; service: ServiceKey; kind: string; title: string; status: string; expiresOn: string | null; daysLeft: number | null; reminded: number | null };
type Data = { days: number; expired: Doc[]; soon: Doc[]; undated: Doc[] };

const left = (days: number | null) => (days === null ? "" : days <= 0 ? "expires today" : days === 1 ? "1 day left" : `${days} days left`);

// Licences, RCs, insurance, permits and fitness certificates: what has run out, what runs out soon, and dates still to record.
export function DocumentExpiry() {
  const { can } = useAdmin();
  const [days, setDays] = useState("30");
  const { data, error, loading, reload } = useData<Data>(`/desk/expiry?days=${days}`, 60000);
  if (error) return <Failure text={error} retry={reload} />;

  return (
    <>
      <PageHead
        title="Documents expiring"
        sub="Vado are reminded in the app 30, 7 and 1 day before. When a licence or RC (and for carpool, insurance or permit) runs out, driving pauses and they come back to Vado verification as a renewal."
        actions={
          <Chips
            value={days}
            onChange={setDays}
            options={[
              ["7", "7 days"],
              ["30", "30 days"],
              ["60", "60 days"],
              ["90", "90 days"],
            ]}
          />
        }
      />
      {loading || !data ? (
        <Loading rows={8} />
      ) : (
        <>
          <Panel className="mb-5">
            <div className="grid grid-cols-3 gap-5">
              <Stat label="Expired, waiting for renewal" value={num(data.expired.length)} tone={data.expired.length ? "text-danger" : "text-cream"} />
              <Stat label={`Expiring in ${data.days} days`} value={num(data.soon.length)} tone={data.soon.length ? "text-amber" : "text-cream"} />
              <Stat label="No expiry date yet" value={num(data.undated.length)} sub="approved before dates were recorded" />
            </div>
          </Panel>

          <Panel title={<span className="flex items-center gap-2"><AlertTriangle size={15} className="text-danger" /> Expired, waiting for renewal</span>} pad={false} className="mb-5">
            {data.expired.length ? (
              <ul className="divide-y divide-line">
                {data.expired.map((doc) => (
                  <DocRow key={`${doc.captainId}-${doc.kind}`} doc={doc} note={<span className="text-danger">Expired {doc.expiresOn ? expiryText(doc.expiresOn) : ""} · {doc.status === "uploaded" ? "renewed copy uploaded, check it" : "waiting for the renewed copy"}</span>} />
                ))}
              </ul>
            ) : (
              <div className="p-5">
                <Empty text="Nothing has expired." />
              </div>
            )}
          </Panel>

          <Panel title={<span className="flex items-center gap-2"><CalendarClock size={15} className="text-amber" /> Expiring in the next {data.days} days</span>} pad={false} className="mb-5">
            {data.soon.length ? (
              <ul className="divide-y divide-line">
                {data.soon.map((doc) => (
                  <DocRow key={`${doc.captainId}-${doc.kind}`} doc={doc} note={<span className={doc.daysLeft !== null && doc.daysLeft <= 7 ? "text-danger" : "text-amber"}>{doc.expiresOn ? expiryText(doc.expiresOn) : ""} · {left(doc.daysLeft)}{doc.reminded ? ` · reminded (${doc.reminded}-day notice)` : ""}</span>} />
                ))}
              </ul>
            ) : (
              <div className="p-5">
                <Empty text="Nothing expires in this period." />
              </div>
            )}
          </Panel>

          <Panel title={<span className="flex items-center gap-2"><CalendarPlus size={15} className="text-gold" /> No expiry date yet</span>} pad={false}>
            {data.undated.length ? (
              <ul className="divide-y divide-line">
                {data.undated.map((doc) => (
                  <DocRow key={`${doc.captainId}-${doc.kind}`} doc={doc} note={<span className="muted">Open their file, read the date on the photo and save it here.</span>} action={can("captains.review") ? <SetDate doc={doc} onSaved={reload} /> : null} />
                ))}
              </ul>
            ) : (
              <div className="p-5">
                <Empty text="Every verified document has its expiry date." />
              </div>
            )}
          </Panel>
        </>
      )}
    </>
  );
}

function DocRow({ doc, note, action }: { doc: Doc; note: React.ReactNode; action?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[13px]">
      <div className="min-w-0">
        <p>
          <span className="font-semibold">{doc.title}</span> <span className="muted">·</span>{" "}
          <Link className="text-sky hover:underline" href={doc.captainStatus === "review" ? `/desk/verify/${doc.service}/${doc.captainId}` : `/desk/lookup?vado=${doc.captainId}`}>
            {doc.name}
          </Link>{" "}
          <span className="text-[11px] muted">
            {doc.code} · {SERVICE_INFO[doc.service].name}
            {doc.city ? ` · ${doc.city}` : ""} · {doc.phone}
          </span>
        </p>
        <p className="text-[12px]">{note}</p>
      </div>
      {action}
    </li>
  );
}

function SetDate({ doc, onSaved }: { doc: Doc; onSaved: () => void }) {
  const { toast } = useFeedback();
  const { busy, run } = useAction();
  const [value, setValue] = useState("");
  const save = async () => {
    const expiresOn = typedDate(value);
    if (!expiresOn) return toast("Type the date as DD/MM/YYYY, for example 31/12/2030.", "bad");
    if (await run("save", () => api("/desk/expiry", { method: "PATCH", body: { captainId: doc.captainId, kind: doc.kind, expiresOn } }), `Saved: valid until ${expiryText(expiresOn)}.`)) onSaved();
  };
  return (
    <span className="flex items-center gap-2">
      <input className="input w-36 py-1.5 text-[12px]" value={value} onChange={(event) => setValue(event.target.value)} placeholder="DD/MM/YYYY" aria-label={`${doc.title} expiry date for ${doc.name}`} />
      <button type="button" className="btn px-2.5 py-1.5 text-[12px]" disabled={busy === "save" || value.trim().length < 8} onClick={() => void save()}>
        {busy === "save" ? <Spinner /> : <Save size={13} />} Save
      </button>
    </span>
  );
}
