"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { api, hasSession, onSessionChange, sendCode, signOut, verifyCode } from "@/lib/api";
import type { Rider } from "@/lib/types";

type Auth = {
  rider: Rider | null;
  ready: boolean;
  login: () => Promise<Rider | null>;
  logout: () => Promise<void>;
  setName: (name: string) => Promise<void>;
};

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [rider, setRider] = useState<Rider | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const waiter = useRef<((rider: Rider | null) => void) | null>(null);

  const loadMe = useCallback(async () => {
    if (!hasSession()) {
      setRider(null);
      return null;
    }
    try {
      const { rider: me } = await api<{ rider: Rider }>("/rider/me");
      const next = { ...me, name: me.name === "ROVEYA rider" ? "" : me.name };
      setRider(next);
      return next;
    } catch {
      setRider(null);
      return null;
    }
  }, []);

  useEffect(() => {
    void loadMe().finally(() => setReady(true));
    return onSessionChange(() => void loadMe());
  }, [loadMe]);

  const login = useCallback(() => {
    if (rider) return Promise.resolve(rider);
    setOpen(true);
    return new Promise<Rider | null>((resolve) => {
      waiter.current = resolve;
    });
  }, [rider]);

  const finish = (next: Rider | null) => {
    setOpen(false);
    waiter.current?.(next);
    waiter.current = null;
  };

  return (
    <Ctx.Provider
      value={{
        rider,
        ready,
        login,
        logout: async () => {
          await signOut();
          setRider(null);
        },
        setName: async (name) => {
          const { rider: me } = await api<{ rider: Rider }>("/rider/me", { method: "PATCH", body: { name } });
          setRider(me);
        },
      }}
    >
      {children}
      {open ? <LoginDialog onDone={finish} loadMe={loadMe} /> : null}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const value = useContext(Ctx);
  if (!value) throw new Error("AuthProvider is missing");
  return value;
}

function LoginDialog({ onDone, loadMe }: { onDone: (rider: Rider | null) => void; loadMe: () => Promise<Rider | null> }) {
  const [step, setStep] = useState<"phone" | "code" | "name">("phone");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [byEmail, setByEmail] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [me, setMe] = useState<Rider | null>(null);
  const valid = byEmail ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) : /^[6-9]\d{9}$/.test(phone);

  const send = async () => {
    setBusy(true);
    setError("");
    try {
      await sendCode(phone, byEmail ? email.trim() : undefined);
      setStep("code");
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value: string) => {
    setCode(value);
    if (value.length < 6) return;
    setBusy(true);
    setError("");
    try {
      await verifyCode(phone, value, byEmail ? email.trim() : undefined);
      const rider = await loadMe();
      setMe(rider);
      if (rider?.name) onDone(rider);
      else setStep("name");
    } catch (failure) {
      setError((failure as Error).message);
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const saveName = async () => {
    setBusy(true);
    try {
      const { rider } = await api<{ rider: Rider }>("/rider/me", { method: "PATCH", body: { name: name.trim() } });
      onDone(rider);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={() => onDone(null)}>
      <div className="card w-full max-w-md rounded-b-none p-6 sm:rounded-b-[1.5rem] sm:p-8" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Log in to ROVEYA">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="kicker">ROVEYA account</p>
            <h2 className="display mt-2 text-3xl">{step === "phone" ? (byEmail ? "Log in with your email" : "Log in with your mobile") : step === "code" ? "Enter the 6-digit code" : "What should we call you?"}</h2>
          </div>
          <button type="button" aria-label="Close" onClick={() => onDone(null)} className="rounded-full border border-gold/30 p-2 text-cream/70 hover:text-cream">
            <X size={16} />
          </button>
        </div>
        {step === "phone" ? (
          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (valid) void send();
            }}
          >
            {byEmail ? (
              <input value={email} onChange={(event) => setEmail(event.target.value.trim())} type="email" autoFocus placeholder="you@email.com" className="field" />
            ) : (
              <label className="flex items-center gap-3 rounded-2xl border border-gold/25 bg-night px-4">
                <span className="font-semibold">+91</span>
                <span className="h-6 w-px bg-gold/25" />
                <input value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" autoFocus placeholder="Mobile number" className="w-full bg-transparent py-4 text-lg tracking-wider outline-none placeholder:text-cream/35" />
              </label>
            )}
            <button type="button" className="text-sm text-gold underline" onClick={() => setByEmail((value) => !value)}>{byEmail ? "Use mobile number instead" : "Use email instead"}</button>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <button className="btn w-full" disabled={!valid || busy}>
              {busy ? <Loader2 size={18} className="animate-spin" /> : null}
              {busy ? "Sending code…" : "Get OTP"}
            </button>
            <p className="flex items-center gap-2 text-xs text-cream/50">
              <ShieldCheck size={14} className="text-gold" /> The same account works in the ROVEYA app. We never share your number with captains.
            </p>
          </form>
        ) : step === "code" ? (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-cream/65">
              {byEmail ? `Code for ${email.trim()}. ` : `Code for +91 ${phone.slice(0, 5)} ${phone.slice(5)}. `}
              <button type="button" className="text-gold underline" onClick={() => setStep("phone")}>
                Change
              </button>
            </p>
            <input value={code} onChange={(event) => void verify(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoFocus autoComplete="one-time-code" placeholder="• • • • • •" className="field text-center text-3xl tracking-[0.6em]" disabled={busy} />
            {busy ? (
              <p className="flex items-center gap-2 text-sm text-cream/60">
                <Loader2 size={15} className="animate-spin text-gold" /> Verifying…
              </p>
            ) : error ? (
              <p className="text-sm text-danger">{error}</p>
            ) : null}
            <button type="button" className="text-sm text-gold" disabled={busy} onClick={() => void send()}>
              Resend code
            </button>
          </div>
        ) : (
          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim().length >= 2) void saveName();
              else onDone(me);
            }}
          >
            <input value={name} onChange={(event) => setName(event.target.value)} autoFocus placeholder="Full name" className="field" />
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <button className="btn w-full" disabled={busy}>
              {name.trim().length >= 2 ? "Continue" : "Skip for now"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
