"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { OneTime, WORKSPACE, type RoleRow } from "@/components/hiring";
import { Chips } from "@/components/list";
import { PageHead, useAdmin } from "@/components/Shell";
import { Badge, Empty, Failure, Field, Loading, Modal, Panel, Spinner, useAction, useFeedback } from "@/components/ui";
import { api, useData } from "@/lib/client";
import { when } from "@/lib/format";

type Request = { id: number; name: string; email: string; phone: string | null; role: string | null; job_title: string | null; note: string | null; source: "login" | "team"; requestedByName: string | null; status: "pending" | "approved" | "rejected"; decidedByName: string | null; decided_at: string | null; decision_note: string | null; created_at: string };

export default function AccessRequestsPage() {
  const { admin } = useAdmin();
  const { ask } = useFeedback();
  const { busy, run } = useAction();
  const [status, setStatus] = useState("pending");
  const { data, error, loading, reload } = useData<{ requests: Request[] }>(`/hiring/requests?status=${status}`, 30000);
  const roles = useData<{ roles: RoleRow[] }>("/roles");
  const [approving, setApproving] = useState<Request | null>(null);
  const [shown, setShown] = useState<{ email: string; password: string } | null>(null);
  const ceo = admin.role === "super_admin";
  const roleName = new Map((roles.data?.roles ?? []).map((role) => [role.key, role.name]));

  if (error) return <Failure text={error} retry={reload} />;
  const reject = async (request: Request) => {
    const note = await ask({ title: `Reject ${request.name}?`, body: `${request.email} will not get a login.`, confirm: "Reject", danger: true, input: { label: "Reason for the record" } });
    if (note === null) return;
    if (await run(String(request.id), () => api(`/hiring/requests/${request.id}`, { method: "PATCH", body: { action: "reject", note: note === "yes" ? undefined : note } }), "Request rejected.")) void reload();
  };

  return (
    <>
      <PageHead title="Access requests" sub={ceo ? "Every new team email waits here for you. Approving creates their login with a one-time password." : "Every new team email waits here for the CEO's approval."} />
      <div className="mb-4">
        <Chips
          value={status}
          onChange={setStatus}
          options={[
            ["pending", "Waiting"],
            ["approved", "Approved"],
            ["rejected", "Rejected"],
          ]}
        />
      </div>
      <Panel pad={false}>
        {loading || !data ? (
          <div className="p-5">
            <Loading rows={5} />
          </div>
        ) : data.requests.length ? (
          <ul className="divide-y divide-line">
            {data.requests.map((request) => (
              <li key={request.id} className="flex flex-wrap items-start justify-between gap-4 px-5 py-4 text-[13px]">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {request.name} <span className="font-normal muted">· {request.email}</span>
                  </p>
                  <p className="text-[12px] muted">
                    {request.job_title ? `${request.job_title} · ` : ""}
                    {request.role ? `role ${roleName.get(request.role) ?? request.role} · ` : ""}
                    {request.phone ? `${request.phone} · ` : ""}
                    {request.source === "login" ? "asked from the login page" : `added by ${request.requestedByName ?? "the team"}`} · {when(request.created_at)}
                  </p>
                  {request.note ? <p className="mt-1 text-[12px] text-cream/80">“{request.note}”</p> : null}
                  {request.status !== "pending" ? (
                    <p className="mt-1 text-[11px] muted">
                      <Badge value={request.status === "approved" ? "active" : "rejected"}>{request.status}</Badge> by {request.decidedByName ?? "—"} · {when(request.decided_at)}
                      {request.decision_note ? ` · ${request.decision_note}` : ""}
                    </p>
                  ) : null}
                </div>
                {request.status === "pending" ? (
                  ceo ? (
                    <span className="flex gap-2">
                      <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => void reject(request)}>
                        <X size={14} /> Reject
                      </button>
                      <button type="button" className="btn btn-gold" disabled={Boolean(busy)} onClick={() => setApproving(request)}>
                        <Check size={14} /> Approve
                      </button>
                    </span>
                  ) : (
                    <span className="text-[11px] muted">Waiting for the CEO</span>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-5">
            <Empty text={status === "pending" ? "Nobody is waiting. New people can ask from the login page, or a manager can add them under Employees." : "Nothing here yet."} />
          </div>
        )}
      </Panel>
      {approving ? <Approve request={approving} roles={roles.data?.roles ?? []} onClose={() => setApproving(null)} onDone={(created) => (setApproving(null), setShown(created), void reload())} /> : null}
      {shown ? <OneTime email={shown.email} password={shown.password} onClose={() => setShown(null)} /> : null}
    </>
  );
}

function Approve({ request, roles, onClose, onDone }: { request: Request; roles: RoleRow[]; onClose: () => void; onDone: (created: { email: string; password: string }) => void }) {
  const { busy, run } = useAction();
  const choices = roles.filter((role) => role.key !== "super_admin");
  const [role, setRole] = useState(request.role ?? choices.find((item) => item.key === "support_executive")?.key ?? choices[0]?.key ?? "");
  const [name, setName] = useState(request.name);
  const save = async () => {
    const result = await run("approve", () => api<{ password: string }>(`/hiring/requests/${request.id}`, { method: "PATCH", body: { action: "approve", role, name } }), "Approved. Their login is ready.");
    if (result) onDone({ email: request.email, password: result.password });
  };
  return (
    <Modal title={`Approve ${request.email}`} onClose={onClose} locked={Boolean(busy)}>
      <div className="space-y-3">
        <Field label="Name">
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Job role" hint={request.job_title ? `They said: ${request.job_title}` : undefined}>
          <select className="input" value={role} onChange={(event) => setRole(event.target.value)}>
            {choices.map((item) => (
              <option key={item.key} value={item.key}>
                {item.name} · {WORKSPACE[item.workspace ?? "admin"].label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose} disabled={Boolean(busy)}>
          Close
        </button>
        <button type="button" className="btn btn-gold" disabled={Boolean(busy) || !role || name.trim().length < 2} onClick={() => void save()}>
          {busy ? <Spinner /> : <Check size={14} />} Approve and create login
        </button>
      </div>
    </Modal>
  );
}
