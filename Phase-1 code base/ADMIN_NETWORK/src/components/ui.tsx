"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Inbox, Loader2, X } from "lucide-react";
import { initials } from "@/lib/format";

export function Panel({ title, action, children, className = "", pad = true }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`panel ${className}`}>
      {title || action ? (
        <header className="flex items-center justify-between gap-3 px-5 pt-5">
          {title ? <h2 className="panel-title">{title}</h2> : <span />}
          {action}
        </header>
      ) : null}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

const TONES: Record<string, string> = {
  confirmed: "bg-success/15 text-success",
  completed: "bg-sky/15 text-sky",
  active: "bg-success/15 text-success",
  paid: "bg-success/15 text-success",
  verified: "bg-success/15 text-success",
  resolved: "bg-success/15 text-success",
  scheduled: "bg-gold/15 text-gold",
  on_trip: "bg-rose/15 text-rose",
  pending: "bg-amber/15 text-amber",
  requested: "bg-amber/15 text-amber",
  review: "bg-amber/15 text-amber",
  uploaded: "bg-amber/15 text-amber",
  created: "bg-amber/15 text-amber",
  open: "bg-danger/15 text-danger",
  acknowledged: "bg-amber/15 text-amber",
  urgent: "bg-danger/15 text-danger",
  high: "bg-amber/15 text-amber",
  cancelled: "bg-danger/15 text-danger",
  rejected: "bg-danger/15 text-danger",
  suspended: "bg-danger/15 text-danger",
  failed: "bg-danger/15 text-danger",
  expired: "bg-cream/10 text-cream/60",
  closed: "bg-cream/10 text-cream/60",
  false_alarm: "bg-cream/10 text-cream/60",
  inactive: "bg-cream/10 text-cream/60",
  running: "bg-success/15 text-success",
  live: "bg-success/15 text-success",
  launching: "bg-amber/15 text-amber",
  planned: "bg-sky/15 text-sky",
  paused: "bg-cream/10 text-cream/60",
  quiet: "bg-gold/15 text-gold",
};

export function Badge({ value, children }: { value: string; children?: ReactNode }) {
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold capitalize ${TONES[value] ?? "bg-cream/10 text-cream/70"}`}>{children ?? value.replace(/_/g, " ")}</span>;
}

const AVATAR_TONES = ["bg-burgundy text-gold", "bg-plum text-rose", "bg-cherry text-cream", "bg-mist text-sky", "bg-raised text-success"];

export function Avatar({ name, size = 32 }: { name?: string | null; size?: number }) {
  const tone = AVATAR_TONES[(name ?? "").length % AVATAR_TONES.length];
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${tone}`} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials(name)}
    </span>
  );
}

export function Stat({ label, value, sub, tone = "text-cream" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div>
      <p className="text-xs muted">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-[11px] muted">{sub}</p> : null}
    </div>
  );
}

export function Row({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-[13px]">
      <span className="muted">{label}</span>
      <span className={`text-right tabular-nums ${tone ?? ""}`}>{value}</span>
    </div>
  );
}

export function Loading({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, at) => (
        <div key={at} className="skeleton h-9" />
      ))}
    </div>
  );
}

export function Empty({ text = "Nothing here yet." }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm muted">
      <Inbox size={26} className="text-cream/30" />
      {text}
    </div>
  );
}

export function Failure({ text, retry }: { text: string; retry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-danger/30 bg-danger/5 px-6 py-8 text-center text-sm">
      <AlertTriangle size={22} className="text-danger" />
      <p className="max-w-lg">{text}</p>
      {retry ? (
        <button type="button" className="btn" onClick={retry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function Pager({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="flex items-center justify-between gap-3 px-1 pt-4 text-xs muted">
      <span>
        {total ? `${(page - 1) * size + 1}–${Math.min(page * size, total)} of ${total.toLocaleString("en-IN")}` : "0 results"}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" className="btn px-2 py-1" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft size={14} />
        </button>
        <span className="px-2">
          {page} / {pages}
        </span>
        <button type="button" className="btn px-2 py-1" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children, wide, locked }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; locked?: boolean }) {
  useEffect(() => {
    if (locked) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, locked]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center" onMouseDown={(event) => !locked && event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`panel my-8 w-full ${wide ? "max-w-3xl" : "max-w-lg"} shadow-2xl`}>
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="panel-title">{title}</h2>
          {locked ? null : (
            <button type="button" onClick={onClose} className="rounded p-1 text-cream/60 hover:text-cream" aria-label="Close">
              <X size={18} />
            </button>
          )}
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] muted">{hint}</span> : null}
    </label>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin" />;
}

// ---------------------------------------------------------------------------
// Toasts and confirmations
// ---------------------------------------------------------------------------

type Toast = { id: number; tone: "good" | "bad"; text: string };
type Ask = { title: string; body: string; confirm: string; danger?: boolean; input?: { label: string; placeholder?: string; required?: boolean } };

const FeedbackCtx = createContext<{ toast: (text: string, tone?: "good" | "bad") => void; ask: (ask: Ask) => Promise<string | null> } | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [asking, setAsking] = useState<(Ask & { resolve: (value: string | null) => void }) | null>(null);
  const [answer, setAnswer] = useState("");

  const toast = useCallback((text: string, tone: "good" | "bad" = "good") => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, tone, text }]);
    setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), 4200);
  }, []);

  const ask = useCallback(
    (next: Ask) =>
      new Promise<string | null>((resolve) => {
        setAnswer("");
        setAsking({ ...next, resolve });
      }),
    [],
  );

  const close = (value: string | null) => {
    asking?.resolve(value);
    setAsking(null);
  };

  return (
    <FeedbackCtx.Provider value={{ toast, ask }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-80 flex-col gap-2">
        {toasts.map((item) => (
          <div key={item.id} className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-xl ${item.tone === "good" ? "border-success/30 bg-panel" : "border-danger/40 bg-panel"}`}>
            {item.tone === "good" ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-success" /> : <AlertTriangle size={17} className="mt-0.5 shrink-0 text-danger" />}
            <span>{item.text}</span>
          </div>
        ))}
      </div>
      {asking ? (
        <Modal title={asking.title} onClose={() => close(null)}>
          <p className="text-sm text-cream/75">{asking.body}</p>
          {asking.input ? (
            <div className="mt-4">
              <Field label={asking.input.label}>
                <input className="input" autoFocus placeholder={asking.input.placeholder} value={answer} onChange={(event) => setAnswer(event.target.value)} />
              </Field>
            </div>
          ) : null}
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => close(null)}>
              Keep it
            </button>
            <button type="button" className={`btn ${asking.danger ? "btn-danger" : "btn-gold"}`} disabled={Boolean(asking.input?.required && !answer.trim())} onClick={() => close(answer.trim() || "yes")}>
              {asking.confirm}
            </button>
          </div>
        </Modal>
      ) : null}
    </FeedbackCtx.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackCtx);
  if (!ctx) throw new Error("useFeedback needs FeedbackProvider");
  return ctx;
}

// Runs an action with a busy flag and a toast for the result.
export function useAction() {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState("");
  const run = useCallback(
    async <T,>(key: string, action: () => Promise<T>, done?: string) => {
      setBusy(key);
      try {
        const result = await action();
        if (done) toast(done);
        return result;
      } catch (failure) {
        toast((failure as Error).message, "bad");
        return null;
      } finally {
        setBusy("");
      }
    },
    [toast],
  );
  return { busy, run };
}
