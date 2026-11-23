"use client";

import { Toolbar, useList } from "@/components/list";
import { PageHead } from "@/components/Shell";
import { Empty, Failure, Loading, Pager, Panel } from "@/components/ui";
import { when } from "@/lib/format";

type Entry = { id: number; admin_email: string | null; action: string; entity: string; entity_id: string | null; detail: Record<string, unknown>; at: string };

export default function AuditPage() {
  const list = useList<{ entries: Entry[]; total: number; size: number }>("/audit");
  const rows = list.data?.entries ?? [];
  return (
    <>
      <PageHead title="Audit log" sub="Every change made from the Admin Network, newest first." />
      <Toolbar q={list.q} setQ={list.setQ} placeholder="Action or admin email" />
      <Panel pad={false}>
        {list.error ? (
          <div className="p-5">
            <Failure text={list.error} retry={list.reload} />
          </div>
        ) : list.loading && !list.data ? (
          <div className="p-5">
            <Loading rows={8} />
          </div>
        ) : rows.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Admin</th>
                  <th>Action</th>
                  <th>Record</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap muted">{when(row.at)}</td>
                    <td>{row.admin_email ?? "—"}</td>
                    <td className="font-medium text-gold">{row.action}</td>
                    <td className="text-[11px] muted">
                      {row.entity}
                      <span className="block">{row.entity_id?.slice(0, 36)}</span>
                    </td>
                    <td className="max-w-md">
                      <code className="line-clamp-2 break-all text-[11px] text-cream/60">{JSON.stringify(row.detail)}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="Nothing has been changed yet." />
        )}
      </Panel>
      {list.data ? <Pager page={list.page} size={list.data.size} total={list.data.total} onPage={list.setPage} /> : null}
    </>
  );
}
