"use client";

import { useEffect, useState, type ReactNode } from "react";
import { formatInr } from "@/lib/format";

// Platform API rows arrive as loosely shaped JSON.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export const inr = (value: unknown) => formatInr(Number(value ?? 0));

export function when(value: unknown) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(String(value)));
}

export function ago(value: unknown) {
  if (!value) return "—";
  const minutes = Math.round((Date.now() - Date.parse(String(value))) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h ago`;
  return `${Math.floor(minutes / 1440)} d ago`;
}

export function useDebounced<T>(value: T, ms = 400) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

export function Badge({ value, tone }: { value: string; tone?: "good" | "warn" | "quiet" }) {
  const upper = value.toUpperCase();
  const auto = ["ACTIVE", "VERIFIED", "PAID", "COMPLETED", "RESOLVED", "YES", "ONLINE"].includes(upper)
    ? "good"
    : ["REJECTED", "SUSPENDED", "BLOCKED", "CANCELLED", "EXPIRED", "FAILED", "CLOSED", "NO", "OFFLINE"].includes(upper)
      ? "quiet"
      : undefined;
  const style = tone ?? auto;
  return <span className={`pill ${style === "good" ? "pill-good" : ""} ${style === "quiet" ? "pill-quiet" : ""}`}>{value.replaceAll("_", " ")}</span>;
}

export function Pills<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (value: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([key, label]) => (
        <button key={key} type="button" onClick={() => onChange(key)} className={`rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] ${value === key ? "bg-[#6B1838] text-[#F6F1DC] shadow-[0_0_0_1px_#D6A000]" : "border border-[#D6A000]/30 text-[#F6F1DC]/75"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Grid({ head, rows, empty = "Nothing here yet.", onOpen }: { head: string[]; rows: ReactNode[][]; empty?: string; onOpen?: (index: number) => void }) {
  if (!rows.length) return <div className="panel px-6 py-12 text-center text-sm text-[#F6F1DC]/55">{empty}</div>;
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
        <thead className="text-[11px] uppercase tracking-[0.14em]">
          <tr>
            {head.map((label) => (
              <th key={label} className="border-b border-[#D6A000]/15 px-4 py-3 font-medium">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, index) => (
            <tr key={index} className={onOpen ? "cursor-pointer" : ""} onClick={onOpen ? () => onOpen(index) : undefined}>
              {cells.map((cell, column) => (
                <td key={column} className="px-4 py-3 align-top">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Drawer({ title, kicker, onClose, actions, children }: { title: string; kicker?: string; onClose: () => void; actions?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onClick={onClose}>
      <aside className="h-full w-full max-w-3xl overflow-y-auto border-l border-[#D6A000]/25 bg-[#12060D] px-6 py-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {kicker ? <p className="kicker">{kicker}</p> : null}
            <h2 className="display mt-2 text-4xl">{title}</h2>
          </div>
          <button type="button" className="btn-quiet shrink-0" onClick={onClose}>Close</button>
        </div>
        {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
        <div className="mt-6 space-y-6">{children}</div>
      </aside>
    </div>
  );
}

export function Block({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="kicker">{title}</p>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="panel grid gap-x-6 gap-y-3 p-5 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[10px] uppercase tracking-[0.16em] text-[#F6F1DC]/45">{label}</dt>
          <dd className="mt-1 break-words text-sm">{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Stat({ label, value, onClick }: { label: string; value: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" disabled={!onClick} onClick={onClick} className="panel p-5 text-left transition enabled:hover:-translate-y-0.5">
      <p className="kicker">{label}</p>
      <p className="display mt-3 text-4xl text-[#F6F1DC]">{value}</p>
    </button>
  );
}

export function Act({ label, onClick, quiet, disabled }: { label: string; onClick: () => void; quiet?: boolean; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} className={quiet ? "btn-quiet disabled:opacity-40" : "btn"} onClick={(event) => { event.stopPropagation(); onClick(); }}>
      {label}
    </button>
  );
}

export function Search({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="field sm:max-w-sm" />;
}

export function WalletBlock({ wallet, ceo, onAdjust }: { wallet: Row; ceo: boolean; onAdjust: (amount: number, note: string) => Promise<void> }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Block title={`Wallet · ${inr(wallet.balance)}`}>
      {ceo ? (
        <form
          className="panel mb-3 grid gap-3 p-4 sm:grid-cols-[140px_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            if (!Number(amount) || note.trim().length < 5) return;
            setBusy(true);
            void onAdjust(Number(amount), note.trim()).finally(() => {
              setBusy(false);
              setAmount("");
              setNote("");
            });
          }}
        >
          <input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" step="1" placeholder="+100 or -50" className="field" />
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Reason, shown in their wallet" className="field" />
          <button className="btn" disabled={busy}>{busy ? "Saving…" : "Adjust"}</button>
        </form>
      ) : null}
      <Grid
        head={["When", "Entry", "Note", "Amount"]}
        rows={(wallet.entries ?? []).map((entry: Row) => [when(entry.created_at), entry.kind, entry.note ?? "—", <span key="a" className={Number(entry.amount) < 0 ? "text-[#E8857F]" : "text-[#E0B23A]"}>{inr(entry.amount)}</span>])}
        empty="No wallet entries yet."
      />
    </Block>
  );
}
