"use client";

import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { PageHead, ThemePicker, useAdmin } from "@/components/Shell";
import { Avatar, Panel } from "@/components/ui";
import { api, forgetLane } from "@/lib/client";
import { ago, when } from "@/lib/format";
import { PERMISSIONS } from "@/lib/roles";

// A team member's own settings: who they are, how the panel looks, their password and what their job role allows.
export default function MySettingsPage() {
  const { admin, theme, setTheme, changePassword } = useAdmin();
  const router = useRouter();
  const see = admin.permissions.filter((key) => PERMISSIONS[key].group === "See");
  const doing = admin.permissions.filter((key) => PERMISSIONS[key].group === "Do");
  const logout = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    forgetLane();
    router.replace("/login");
  };

  return (
    <>
      <PageHead title="Settings" sub="Your account on the ROVEYA Support Desk." />
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Panel title="My account">
          <div className="flex items-center gap-4">
            <Avatar name={admin.name} size={52} />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">{admin.name}</p>
              <p className="truncate text-xs muted">{admin.email}</p>
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-[130px_1fr] gap-y-2.5 text-[13px]">
            <dt className="muted">Job role</dt>
            <dd className="font-medium">{admin.roleName}</dd>
            <dt className="muted">Mobile</dt>
            <dd>{admin.phone ?? "—"}</dd>
            <dt className="muted">Last sign-in</dt>
            <dd>{admin.lastLoginAt ? `${when(admin.lastLoginAt)} · ${ago(admin.lastLoginAt)}` : "—"}</dd>
          </dl>
          <p className="mt-4 text-[11px] muted">To change your name, mobile or job role, ask the CEO. They manage it under Hiring.</p>
        </Panel>

        <Panel title="Look and sign-in">
          <div className="-mx-3">
            <ThemePicker theme={theme} setTheme={setTheme} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={changePassword}>
              <KeyRound size={14} className="text-gold" /> Change password
            </button>
            <button type="button" className="btn btn-danger" onClick={() => void logout()}>
              <LogOut size={14} /> Log out
            </button>
          </div>
          <p className="mt-4 text-[11px] muted">Sessions end after 12 hours. Five wrong passwords lock the account for 15 minutes.</p>
        </Panel>

        <Panel title="What my job role allows" className="lg:col-span-2">
          <div className="grid gap-6 sm:grid-cols-2">
            {[
              ["I can see", see],
              ["I can do", doing],
            ].map(([heading, keys]) => (
              <div key={heading as string}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gold">{heading as string}</p>
                <ul className="space-y-2 text-[13px]">
                  {(keys as typeof see).map((key) => (
                    <li key={key} className="flex items-start gap-2">
                      <ShieldCheck size={14} className="mt-0.5 shrink-0 text-success" />
                      <span>
                        <span className="font-medium">{PERMISSIONS[key].label}</span>
                        <span className="block text-[11px] muted">{PERMISSIONS[key].help}</span>
                      </span>
                    </li>
                  ))}
                  {(keys as typeof see).length ? null : <li className="text-[12px] muted">Nothing here.</li>}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-5 text-[11px] muted">Every action you take is recorded in the audit log with your name.</p>
        </Panel>
      </div>
    </>
  );
}
