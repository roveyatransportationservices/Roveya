"use client";

import { useState } from "react";
import { Headset, LayoutDashboard, Pencil, Plus, Trash2 } from "lucide-react";
import { RoleForm, WORKSPACE, type RoleRow } from "@/components/hiring";
import { PageHead } from "@/components/Shell";
import { Failure, Loading, Panel, useAction, useFeedback } from "@/components/ui";
import { api, useData } from "@/lib/client";
import { PERMISSIONS } from "@/lib/roles";

export default function JobRolesPage() {
  const { ask } = useFeedback();
  const { busy, run } = useAction();
  const { data, error, loading, reload } = useData<{ roles: RoleRow[] }>("/roles");
  const [editing, setEditing] = useState<RoleRow | null | "new">(null);
  if (error) return <Failure text={error} retry={reload} />;
  const remove = async (role: RoleRow) => {
    if (!(await ask({ title: `Remove ${role.name}?`, body: "Only roles nobody uses can be removed.", confirm: "Remove", danger: true }))) return;
    if (await run(role.key, () => api(`/roles/${role.key}`, { method: "DELETE" }), "Job role removed.")) void reload();
  };
  return (
    <>
      <PageHead
        title="Job roles"
        sub="Each job role decides which dashboard a person sees and what they can see and do. Changes apply at their next sign-in."
        actions={
          <button type="button" className="btn btn-gold" onClick={() => setEditing("new")}>
            <Plus size={14} /> New job role
          </button>
        }
      />
      {loading || !data ? (
        <Loading rows={6} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
          {data.roles.map((role) => (
            <Panel
              key={role.key}
              title={
                <span className="flex items-center gap-2">
                  {role.workspace === "support_desk" ? <Headset size={15} className="text-gold" /> : <LayoutDashboard size={15} className="text-gold" />} {role.name}
                </span>
              }
              action={
                role.key === "super_admin" ? (
                  <span className="text-[11px] muted">Always has everything</span>
                ) : (
                  <span className="flex gap-1.5">
                    <button type="button" className="btn px-2 py-1 text-[11px]" onClick={() => setEditing(role)}>
                      <Pencil size={12} /> Edit
                    </button>
                    <button type="button" className="btn px-2 py-1 text-[11px]" disabled={Boolean(busy) || role.members > 0} title={role.members ? "Move its members to another role first" : ""} onClick={() => void remove(role)}>
                      <Trash2 size={12} />
                    </button>
                  </span>
                )
              }
            >
              <p className="text-[12.5px] text-cream/80">{role.description ?? "—"}</p>
              <p className="mt-2 text-[11px]">
                <span className="rounded bg-gold/15 px-1.5 py-0.5 font-semibold text-gold">{WORKSPACE[role.workspace ?? "admin"].label}</span>
                <span className="ml-2 muted">
                  {role.members} {role.members === 1 ? "person" : "people"}
                </span>
              </p>
              <div className="mt-3 flex flex-wrap gap-1">
                {(role.key === "super_admin" ? [] : role.permissions).map((key) => (
                  <span key={key} className={`rounded px-1.5 py-0.5 text-[10.5px] ${PERMISSIONS[key]?.group === "Do" ? "bg-sky/15 text-sky" : "bg-mist text-cream/75"}`}>
                    {PERMISSIONS[key]?.group === "See" ? "See " : ""}
                    {PERMISSIONS[key]?.label ?? key}
                  </span>
                ))}
              </div>
            </Panel>
          ))}
        </div>
      )}
      {editing ? <RoleForm role={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => (setEditing(null), void reload())} /> : null}
    </>
  );
}
