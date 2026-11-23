"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, FileCheck2, Headset, Landmark, Play, Plus, Trash2 } from "lucide-react";
import { AssignButton } from "@/components/actions";
import { Chips, useList } from "@/components/list";
import { PageHead, useAdmin } from "@/components/Shell";
import { Badge, Empty, Failure, Loading, Pager, Panel, Spinner, useAction, useFeedback } from "@/components/ui";
import { api, useData } from "@/lib/client";
import { ago, label, when } from "@/lib/format";
import { SERVICE_KEYS, vadoTitle, type ServiceKey } from "@/lib/services";

type Task = {
  id: string;
  code: string;
  title: string;
  details: string | null;
  status: string;
  priority: string;
  link: string | null;
  entity: string | null;
  due_at: string | null;
  last_note: string | null;
  created_at: string;
  completed_at: string | null;
  assignee: { id: string; name: string } | null;
  creator: { id: string; name: string } | null;
};
type Alerts = { sos: number; tickets: number; captains: number; docs: number; payouts: number; tasks: number; vado?: Record<ServiceKey, number> };

const STATUS_TONE: Record<string, string> = { todo: "pending", in_progress: "scheduled", done: "completed", cancelled: "closed" };

export default function WorkPage() {
  const { admin, can } = useAdmin();
  const { ask } = useFeedback();
  const { busy, run } = useAction();
  const manager = can("tasks.assign");
  const [scope, setScope] = useState("mine");
  const list = useList<{ tasks: Task[]; total: number; size: number }>("/tasks", { scope: "mine", status: "open" }, 30000);
  const { data: alerts } = useData<Alerts>("/alerts", 30000);
  const rows = list.data?.tasks ?? [];

  const move = async (task: Task, status: string) => {
    let note: string | null = null;
    if (status === "done") {
      note = await ask({ title: `Finish ${task.code}?`, body: "Add what you did so the founder can see it.", confirm: "Mark done", input: { label: "What was done", placeholder: "Verified RC and insurance, approved the car" } });
      if (!note) return;
    }
    const done = await run(task.id, () => api(`/tasks/${task.id}`, { method: "PATCH", body: { status, note: note && note !== "yes" ? note : undefined } }), status === "done" ? "Task done." : "Task started.");
    if (done) void list.reload();
  };

  const remove = async (task: Task) => {
    if (!(await ask({ title: `Delete ${task.code}?`, body: task.title, confirm: "Delete", danger: true }))) return;
    const done = await run(task.id, () => api(`/tasks/${task.id}`, { method: "DELETE" }), "Task deleted.");
    if (done) void list.reload();
  };

  const queues = [
    ...SERVICE_KEYS.map((key) => ({ show: can("view.captains"), count: alerts?.vado?.[key] ?? 0, label: `${vadoTitle(key)} waiting for approval`, href: `/vado/${key}?view=attention`, icon: FileCheck2, tone: "text-amber" })),
    { show: can("view.support"), count: alerts?.tickets ?? 0, label: "Open support tickets", href: "/support", icon: Headset, tone: "text-sky" },
    { show: can("view.finance"), count: alerts?.payouts ?? 0, label: "Captain payouts to pay", href: "/payouts", icon: Landmark, tone: "text-gold" },
  ].filter((item) => item.show);

  return (
    <>
      <PageHead
        title={`Hello, ${admin.name.split(" ")[0]}`}
        sub={`${admin.roleName} · your work for today`}
        actions={
          manager ? (
            <>
              <Chips
                value={scope}
                onChange={(value) => {
                  setScope(value);
                  list.setFilter("scope", value);
                }}
                options={[
                  ["mine", "My tasks"],
                  ["all", "Everyone's tasks"],
                  ["created", "I assigned"],
                ]}
              />
              <AssignButton title="" entity="other" />
            </>
          ) : null
        }
      />

      {queues.length ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {queues.map((item) => (
            <Link key={item.label} href={item.href} className="panel group flex items-center gap-4 p-4 transition hover:border-gold/40">
              <span className={`flex h-11 w-11 items-center justify-center rounded-lg bg-mist ${item.tone}`}>
                <item.icon size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-2xl font-bold tabular-nums ${item.count ? item.tone : ""}`}>{item.count}</span>
                <span className="block text-[11px] muted">{item.label}</span>
              </span>
              <ArrowRight size={15} className="text-cream/30 transition group-hover:text-gold" />
            </Link>
          ))}
        </div>
      ) : null}

      <div className="mb-3 flex items-center justify-between">
        <h2 className="panel-title">{scope === "mine" ? "Tasks assigned to me" : scope === "all" ? "Everyone's tasks" : "Tasks I assigned"}</h2>
        <Chips
          value={list.filters.status ?? ""}
          onChange={(value) => list.setFilter("status", value)}
          options={[
            ["open", "Open"],
            ["done", "Done"],
            ["", "All"],
          ]}
        />
      </div>
      {list.error ? (
        <Failure text={list.error} retry={list.reload} />
      ) : list.loading && !list.data ? (
        <Loading rows={4} />
      ) : rows.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((task) => {
            const mine = task.assignee?.id === admin.id;
            const late = task.due_at && task.status !== "done" && Date.parse(task.due_at) < Date.now();
            return (
              <Panel key={task.id} className={task.priority === "urgent" && task.status !== "done" ? "border-danger/40" : ""}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] muted">
                      {task.code} · from {task.creator?.name ?? "—"} · {ago(task.created_at)}
                    </p>
                    <p className="mt-1 font-semibold">{task.title}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge value={STATUS_TONE[task.status] ?? task.status}>{label(task.status)}</Badge>
                    {task.priority !== "normal" ? <Badge value={task.priority === "urgent" ? "urgent" : task.priority === "high" ? "high" : "closed"}>{task.priority}</Badge> : null}
                  </div>
                </div>
                {task.details ? <p className="mt-2 whitespace-pre-wrap text-[13px] text-cream/75">{task.details}</p> : null}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] muted">
                  {scope !== "mine" ? <span>For {task.assignee?.name ?? "—"}</span> : null}
                  {task.due_at ? <span className={late ? "font-semibold text-danger" : ""}>Due {when(task.due_at)}</span> : null}
                  {task.completed_at ? <span>Done {when(task.completed_at)}</span> : null}
                </div>
                {task.last_note ? <p className="mt-2 rounded bg-night px-3 py-2 text-[12px] text-cream/70">{task.last_note}</p> : null}
                <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
                  {task.link ? (
                    <Link href={task.link} className="btn px-2.5 py-1 text-[11px]">
                      Open <ArrowRight size={12} />
                    </Link>
                  ) : null}
                  {(mine || manager) && task.status === "todo" ? (
                    <button type="button" className="btn px-2.5 py-1 text-[11px]" disabled={busy === task.id} onClick={() => void move(task, "in_progress")}>
                      {busy === task.id ? <Spinner size={12} /> : <Play size={12} />} Start
                    </button>
                  ) : null}
                  {(mine || manager) && (task.status === "todo" || task.status === "in_progress") ? (
                    <button type="button" className="btn px-2.5 py-1 text-[11px] text-success" disabled={busy === task.id} onClick={() => void move(task, "done")}>
                      <CheckCircle2 size={12} /> Done
                    </button>
                  ) : null}
                  {manager ? (
                    <button type="button" className="btn ml-auto px-2 py-1 text-[11px] text-danger" disabled={busy === task.id} onClick={() => void remove(task)}>
                      <Trash2 size={12} />
                    </button>
                  ) : null}
                </div>
              </Panel>
            );
          })}
        </div>
      ) : (
        <Panel>
          <Empty text={scope === "mine" ? "Nothing assigned to you right now." : "No tasks here."} />
          {manager && scope !== "mine" ? (
            <p className="-mt-6 pb-6 text-center text-xs muted">
              <Plus size={12} className="inline" /> Use Assign to give someone work.
            </p>
          ) : null}
        </Panel>
      )}
      {list.data ? <Pager page={list.page} size={list.data.size} total={list.data.total} onPage={list.setPage} /> : null}
    </>
  );
}
