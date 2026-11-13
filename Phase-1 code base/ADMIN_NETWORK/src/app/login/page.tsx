"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { api, rememberLane } from "@/lib/client";

function LoginForm({ onRequest }: { onRequest: () => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { admin } = await api<{ admin: { workspace: "admin" | "support_desk" } }>("/auth/login", { body: { email, password } });
      rememberLane(admin.workspace === "support_desk" ? "desk" : "admin");
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="panel w-full max-w-sm p-8 shadow-2xl">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-burgundy text-sm font-bold text-gold">R</span>
        <div>
          <p className="text-lg font-semibold tracking-wide text-rose">ROVEYA</p>
          <p className="-mt-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">Admin Network</p>
        </div>
      </div>
      <h1 className="mt-8 text-xl font-semibold">Sign in</h1>
      <p className="mt-1 text-xs muted">For ROVEYA team members only. Every action is recorded.</p>
      <label className="mt-6 block">
        <span className="label">Work email</span>
        <input className="input" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus />
      </label>
      <label className="mt-4 block">
        <span className="label">Password</span>
        <input className="input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      </label>
      {error ? <p className="mt-4 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p> : null}
      <button className="btn btn-gold mt-6 w-full py-2.5 text-sm" disabled={busy}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : <LockKeyhole size={15} />} Sign in
      </button>
      <p className="mt-6 flex items-center gap-2 text-[11px] muted">
        <ShieldCheck size={13} className="text-success" /> Sessions end after 12 hours. Five wrong passwords lock the account for 15 minutes.
      </p>
      <p className="mt-4 border-t border-line pt-4 text-center text-[12px] muted">
        New to the ROVEYA team?{" "}
        <button type="button" className="font-semibold text-gold hover:underline" onClick={onRequest}>
          Request access
        </button>
      </p>
    </form>
  );
}

// A new team member asks for a login with their own email. The CEO approves it under Hiring.
function RequestAccess({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", jobTitle: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/request-access", { body: form });
      setSent(true);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const field = (key: keyof typeof form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="mt-3 block">
      <span className="label">{label}</span>
      <input className="input" value={form[key]} onChange={(event) => setForm({ ...form, [key]: key === "phone" ? event.target.value.replace(/\D/g, "").slice(0, 10) : event.target.value })} {...props} />
    </label>
  );
  return (
    <form onSubmit={submit} className="panel w-full max-w-sm p-8 shadow-2xl">
      <h1 className="text-xl font-semibold">Request access</h1>
      {sent ? (
        <>
          <p className="mt-3 text-sm text-cream/80">Thank you. Your request is with the CEO. Once approved, you will get your login from them.</p>
          <button type="button" className="btn btn-gold mt-6 w-full py-2.5 text-sm" onClick={onClose}>
            Back to sign in
          </button>
        </>
      ) : (
        <>
          <p className="mt-1 text-xs muted">Use your own email. The CEO approves every new team member before a login is made.</p>
          {field("name", "Full name", { required: true, autoFocus: true })}
          {field("email", "Your email", { type: "email", required: true })}
          {field("phone", "Mobile", { inputMode: "numeric" })}
          {field("jobTitle", "Your job at ROVEYA", { required: true, placeholder: "Customer Support Executive" })}
          {field("note", "Anything the CEO should know (optional)")}
          {error ? <p className="mt-4 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p> : null}
          <button className="btn btn-gold mt-6 w-full py-2.5 text-sm" disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : null} Send to the CEO
          </button>
          <button type="button" className="mt-3 w-full text-center text-[12px] muted hover:text-gold" onClick={onClose}>
            Back to sign in
          </button>
        </>
      )}
    </form>
  );
}

export default function LoginPage() {
  const [requesting, setRequesting] = useState(false);
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      <div className="pointer-events-none absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full bg-burgundy/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-[420px] w-[420px] rounded-full bg-plum/60 blur-3xl" />
      {requesting ? (
        <RequestAccess onClose={() => setRequesting(false)} />
      ) : (
        <Suspense>
          <LoginForm onRequest={() => setRequesting(true)} />
        </Suspense>
      )}
    </div>
  );
}
