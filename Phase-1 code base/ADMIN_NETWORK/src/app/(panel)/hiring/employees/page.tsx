"use client";

import { useState } from "react";
import { KeyRound, Plus, Power, Trash2 } from "lucide-react";
import { OneTime, WORKSPACE, type AdminRow, type RoleRow } from "@/components/hiring";
import { Toolbar } from "@/components/list";
import { PageHead, useAdmin } from "@/components/Shell";
import { Empty, Failure, Field, Loading, Modal, Panel, Spinner, useAction, useFeedback } from "@/components/ui";
import { api, useData } from "@/lib/client";
import { ago, when } from "@/lib/format";

export default function EmployeesPage() {
  const { admin } = useAdmin();
  const { ask } = useFeedback();
  const { busy, run } = useAction();
  const team = useData<{ admins: AdminRow[] }>("/admins");
  const roles = useData<{ roles: RoleRow[] }>("/roles");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [shown, setShown] = useState<{ email: string; password: string } | null>(null);
  const ceo = admin.role === "super_admin";
  const roleOf = new Map((roles.data?.roles ?? []).map((role) => [role.key, role]));

  if (team.error) return <Failure text={team.error} retry={team.reload} />;
  const rows = (team.data?.admins ?? []).filter((row) => !q.trim() || `${row.name} ${row.email} ${row.phone ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));

  const patch = async (row: AdminRow, body: Record<string, unknown>, done: string) => {
    const result = await run(row.id, () => api<{ password: string | null }>(`/admins/${row.id}`, { method: "PATCH", body }), done);
    if (result?.password) setShown({ email: row.email, password: result.password });
    if (result) void team.reload();
  };
  const remove = async (row: AdminRow) => {
    if (!(await ask({ title: `Remove ${row.name}?`, body: "Their login is deleted. The audit log keeps everything they did.", confirm: "Remove", danger: true }))) return;
    if (await run(row.id, () => api(`/admins/${row.id}`, { method: "DELETE" }), "Removed.")) void team.reload();
  };

  return (
    <>
      <PageHead
        title="Employees"
        sub={ceo ? "Everyone with a ROVEYA admin login. Logins you add open at once; anyone else's additions come to you for approval." : "Everyone with a ROVEYA admin login. People you add go to the CEO for approval before their login opens."}
        actions={
          <button type="button" className="btn btn-gold" onClick={() => setAdding(true)}>
            <Plus size={14} /> Add employee
          </button>
        }
      />
      <Toolbar q={q} setQ={setQ} placeholder="Name, email or phone" />
      <Panel pad={false}>
        {team.loading || !team.data ? (
          <div className="p-5">
            <Loading rows={6} />
          </div>
        ) : rows.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Job role</th>
                  <th>Dashboard</th>
                  <th>Status</th>
                  <th>Last login</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const role = roleOf.get(row.role);
                  const self = row.id === admin.id;
                  const locked = row.locked_until && Date.parse(row.locked_until) > Date.now();
                  return (
                    <tr key={row.id}>
                      <td>
                        <p className="font-semibold">{row.name}</p>
                        <p className="text-[11px] muted">
                          {row.email}
                          {row.phone ? ` · ${row.phone}` : ""}
                        </p>
                      </td>
                      <td>
                        {self || row.role === "super_admin" ? (
                          <span>{role?.name ?? row.role}</span>
                        ) : (
                          <select className="input h-8 py-0 text-[12px]" value={row.role} disabled={Boolean(busy)} onChange={(event) => void patch(row, { role: event.target.value }, "Job role changed.")}>
                            {(roles.data?.roles ?? [])
                              .filter((item) => item.key !== "super_admin" || ceo)
                              .map((item) => (
                                <option key={item.key} value={item.key}>
                                  {item.name}
                                </option>
                              ))}
                          </select>
                        )}
                      </td>
                      <td className="text-[12px]">{WORKSPACE[role?.workspace ?? "admin"].label}</td>
                      <td className="text-[12px]">
                        {!row.active ? <span className="text-danger">Switched off</span> : locked ? <span className="text-amber">Locked until {when(row.locked_until)}</span> : row.must_change_password ? <span className="text-sky">Has not set a password yet</span> : <span className="text-success">Active</span>}
                      </td>
                      <td className="muted">{row.last_login_at ? ago(row.last_login_at) : "Never"}</td>
                      <td>
                        {self ? (
                          <span className="text-[11px] muted">You</span>
                        ) : (
                          <span className="flex justify-end gap-1.5">
                            <button type="button" className="btn px-2 py-1 text-[11px]" disabled={Boolean(busy)} title="New one-time password" onClick={() => void patch(row, { resetPassword: true }, "New one-time password made.")}>
                              {busy === row.id ? <Spinner /> : <KeyRound size={12} />}
                            </button>
                            <button type="button" className="btn px-2 py-1 text-[11px]" disabled={Boolean(busy)} title={row.active ? "Switch off" : "Switch on"} onClick={() => void patch(row, { active: !row.active }, row.active ? "Switched off." : "Switched on.")}>
                              <Power size={12} className={row.active ? "text-danger" : "text-success"} />
                            </button>
                            <button type="button" className="btn px-2 py-1 text-[11px]" disabled={Boolean(busy)} title="Remove" onClick={() => void remove(row)}>
                              <Trash2 size={12} />
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <Empty text="Nobody matches." />
          </div>
        )}
      </Panel>
      {adding ? <AddEmployee roles={roles.data?.roles ?? []} ceo={ceo} onClose={() => setAdding(false)} onDone={(created) => (setAdding(false), created ? setShown(created) : null, void team.reload())} /> : null}
      {shown ? <OneTime email={shown.email} password={shown.password} onClose={() => setShown(null)} /> : null}
    </>
  );
}

function AddEmployee({ roles, ceo, onClose, onDone }: { roles: RoleRow[]; ceo: boolean; onClose: () => void; onDone: (created: { email: string; password: string } | null) => void }) {
  const { busy, run } = useAction();
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: roles.find((role) => role.key === "support_executive")?.key ?? roles.find((role) => role.key !== "super_admin")?.key ?? "" });
  const save = async () => {
    const result = await run("add", () => api<{ password?: string; pending?: boolean }>("/admins", { body: form }), ceo ? "Login created." : "Sent to the CEO for approval.");
    if (result) onDone(result.password ? { email: form.email.trim().toLowerCase(), password: result.password } : null);
  };
  return (
    <Modal title="Add employee" onClose={onClose} locked={Boolean(busy)}>
      <p className="mb-4 text-[12px] muted">{ceo ? "They sign in with their own email. You get a one-time password to share with them." : "Their own email goes to the CEO. The login opens once the CEO approves it."}</p>
      <div className="space-y-3">
        <Field label="Full name">
          <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </Field>
        <Field label="Their email" hint="The email they will sign in with.">
          <input className="input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        </Field>
        <Field label="Mobile (optional)">
          <input className="input" inputMode="numeric" maxLength={10} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value.replace(/\D/g, "") })} />
        </Field>
        <Field label="Job role">
          <select className="input" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
            {roles
              .filter((role) => role.key !== "super_admin")
              .map((role) => (
                <option key={role.key} value={role.key}>
                  {role.name} · {WORKSPACE[role.workspace ?? "admin"].label}
                </option>
              ))}
          </select>
        </Field>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose} disabled={Boolean(busy)}>
          Close
        </button>
        <button type="button" className="btn btn-gold" disabled={Boolean(busy) || form.name.trim().length < 2 || !form.email.includes("@") || !form.role} onClick={() => void save()}>
          {busy ? <Spinner /> : null} {ceo ? "Create login" : "Send for approval"}
        </button>
      </div>
    </Modal>
  );
}
