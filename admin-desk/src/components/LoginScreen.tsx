"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { createClient } from "@/lib/supabase/browser";

export function LoginScreen() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const supabase = createClient();
    const signed = await supabase.auth.signInWithPassword({ email, password });
    if (signed.error || !signed.data.user) {
      setBusy(false);
      setError("Those details were not accepted.");
      return;
    }
    const profile = await supabase
      .from("admin_users")
      .select("id, role")
      .eq("auth_user_id", signed.data.user.id)
      .maybeSingle();
    if (!profile.data || (profile.data.role !== "CEO" && profile.data.role !== "ADMIN")) {
      await supabase.auth.signOut();
      setBusy(false);
      setError("This account is not on the ROVEYA desk.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative min-h-[42vh] lg:min-h-screen">
        <img
          src="/wallpaper.jpg"
          alt="ROVEYA leadership"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0C0609] via-[#0C0609]/20 to-[#12060D]/35" />
        <div className="absolute inset-x-0 bottom-0 p-8 lg:p-14">
          <p className="kicker">ROVEYA</p>
          <h1 className="display mt-4 max-w-xl text-5xl text-[#F6F1DC] md:text-7xl">
            The people
            <br />
            behind the journey.
          </h1>
          <p className="mt-5 max-w-md text-sm leading-7 text-[#F6F1DC]/75">
            CEO, managers and partners. One desk. The same dark plum light.
          </p>
        </div>
      </section>
      <section className="flex items-center justify-center bg-[#12060D] px-6 py-16">
        <div className="panel w-full max-w-md px-7 py-9 sm:px-9">
          <Logo href="/" />
          <p className="kicker mt-8">Operations</p>
          <h2 className="display mt-3 text-5xl">Sign in</h2>
          <p className="mt-3 text-sm text-[#F6F1DC]/65">Use the CEO or manager account created in Supabase.</p>
          <form onSubmit={onSubmit} className="mt-10 space-y-5">
            <label className="block text-xs uppercase tracking-[0.18em] text-[#F6F1DC]/70">
              Email
              <input name="email" type="email" required autoComplete="username" className="field mt-2" />
            </label>
            <label className="block text-xs uppercase tracking-[0.18em] text-[#F6F1DC]/70">
              Password
              <input name="password" type="password" required autoComplete="current-password" className="field mt-2" />
            </label>
            {error ? <p className="text-sm text-[#E0B23A]">{error}</p> : null}
            <button type="submit" disabled={busy} className="btn w-full py-4">
              {busy ? "Signing in…" : "Enter the desk"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
