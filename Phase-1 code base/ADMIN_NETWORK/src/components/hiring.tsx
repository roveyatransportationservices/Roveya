"use client";

import { useState } from "react";
import { Copy, Headset, LayoutDashboard } from "lucide-react";
import { Field, Modal, Spinner, useAction, useFeedback } from "@/components/ui";
import { api } from "@/lib/client";
import { PERMISSION_KEYS, PERMISSIONS, type Permission } from "@/lib/roles";

export type RoleRow = { key: string; name: string; description: string | null; permissions: Permission[]; is_system: boolean; workspace: "admin" | "support_desk"; members: number };
export type AdminRow = { id: string; email: string; name: string; phone: string | null; role: string; active: boolean; must_change_password: boolean; last_login_at: string | null; locked_until: string | null; created_at: string };

export const WORKSPACE: Record<RoleRow["workspace"], { label: string; line: string }> = {
  admin: { label: "Full admin panel", line: "Side menu with every page the role allows." },
  support_desk: { label: "Support Desk dashboard only", line: "A short desk menu: Vado verification with the 45-minute clock, support tickets, calls, safety, reviews, their own performance and settings." },
};

// Shown once after a login is created: the CEO shares it privately; the person sets their own at first sign-in.
export function OneTime({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  const { toast } = useFeedback();
  return (
    <Modal title="Login created" onClose={onClose}>
      <p className="text-sm text-cream/75">Share this with the person privately (call or WhatsApp). It works once: they choose their own password when they first sign in.</p>
      <div className="mt-4 space-y-2 rounded-md border border-line bg-night/40 p-4 font-mono text-[13px]">
        <p>
          Email: <span className="text-gold">{email}</span>
        </p>
        <p>
          One-time password: <span className="text-gold">{password}</span>
        </p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          className="btn"
          onClick={() => {
            void navigator.clipboard?.writeText(`ROVEYA Admin login\nEmail: ${email}\nOne-time password: ${password}`);
            toast("Copied.");
          }}
        >
          <Copy size={14} /> Copy
        </button>
        <button type="button" className="btn btn-gold" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

export function RoleForm({ role, onClose, onSaved }: { role: RoleRow | null; onClose: () => void; onSaved: () => void }) {
  const { busy, run } = useAction();
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [workspace, setWorkspace] = useState<RoleRow["workspace"]>(role?.workspace ?? "admin");
  const [picked, setPicked] = useState<Permission[]>(role?.permissions ?? []);
  const toggle = (key: Permission) => setPicked((list) => (list.includes(key) ? list.filter((item) => item !== key) : [...list, key]));
  const deskDefaults = () => setPicked((list) => [...new Set<Permission>([...list, "view.captains", "captains.review", "view.support", "support.reply", "calls.make", "view.safety", "safety.respond", "notify.send"])]);
  const save = async () => {
    const done = await run("role", () => api(role ? `/roles/${role.key}` : "/roles", { method: role ? "PATCH" : "POST", body: { name, description, permissions: picked, workspace } }), role ? "Job role saved." : "Job role created.");
    if (done) onSaved();
  };
  return (
    <Modal title={role ? `Edit ${role.name}` : "New job role"} onClose={onClose} wide locked={Boolean(busy)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Job role name">
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Customer Support Executive" />
        </Field>
        <Field label="What they do">
          <input className="input" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Verifies new Vado and answers tickets" />
        </Field>
      </div>
      <p className="label mt-5">Which dashboard they see</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(WORKSPACE) as RoleRow["workspace"][]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setWorkspace(key);
              if (key === "support_desk") deskDefaults();
            }}
            className={`rounded-md border p-3 text-left transition ${workspace === key ? "border-gold bg-gold/10" : "border-line hover:border-gold/50"}`}
          >
            <p className="flex items-center gap-2 text-[13px] font-semibold">
              {key === "admin" ? <LayoutDashboard size={15} className="text-gold" /> : <Headset size={15} className="text-gold" />} {WORKSPACE[key].label}
            </p>
            <p className="mt-1 text-[11px] muted">{WORKSPACE[key].line}</p>
          </button>
        ))}
      </div>
      {(["See", "Do"] as const).map((group) => (
        <div key={group} className="mt-5">
          <p className="label">{group === "See" ? "What they can see" : "What they can do"}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {PERMISSION_KEYS.filter((key) => PERMISSIONS[key].group === group).map((key) => (
              <label key={key} className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-[12.5px] ${picked.includes(key) ? "border-gold/60 bg-gold/5" : "border-line"}`}>
                <input type="checkbox" className="mt-0.5" checked={picked.includes(key)} onChange={() => toggle(key)} />
                <span>
                  <span className="font-medium">{PERMISSIONS[key].label}</span>
                  <span className="block text-[11px] muted">{PERMISSIONS[key].help}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose} disabled={Boolean(busy)}>
          Close
        </button>
        <button type="button" className="btn btn-gold" disabled={Boolean(busy) || name.trim().length < 2 || !picked.length} onClick={() => void save()}>
          {busy ? <Spinner /> : null} {role ? "Save job role" : "Create job role"}
        </button>
      </div>
    </Modal>
  );
}
