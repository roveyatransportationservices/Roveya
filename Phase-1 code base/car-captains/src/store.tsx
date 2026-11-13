import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { registerPush, forgetPush } from "./push";
import { service } from "./service";
import type { Profile } from "./types";

type Phase = "boot" | "signedOut" | "register" | "ready";

type Store = {
  phase: Phase;
  profile: Profile | null;
  bootError: string;
  setProfile: (profile: Profile) => void;
  refresh: () => Promise<Profile | null>;
  signedIn: (profile: Profile | null) => void;
  signOut: () => Promise<void>;
  retry: () => void;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("boot");
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [bootError, setBootError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setBootError("");
    service
      .restore()
      .then((result) => {
        if (!alive) return;
        if (result === "signedOut") return setPhase("signedOut");
        setProfileState(result);
        setPhase(result ? "ready" : "register");
        if (result) void registerPush();
      })
      .catch((error: Error) => alive && setBootError(error.message));
    return () => {
      alive = false;
    };
  }, [attempt]);

  const setProfile = useCallback((next: Profile) => {
    setProfileState(next);
    setPhase("ready");
  }, []);

  const refresh = useCallback(async () => {
    const next = await service.me();
    if (next) setProfileState({ ...next });
    return next;
  }, []);

  const value = useMemo<Store>(
    () => ({
      phase,
      profile,
      bootError,
      setProfile,
      refresh,
      signedIn: (next) => {
        setProfileState(next);
        setPhase(next ? "ready" : "register");
        void registerPush();
      },
      signOut: async () => {
        await forgetPush();
        await service.signOut();
        setProfileState(null);
        setPhase("signedOut");
      },
      retry: () => setAttempt((value) => value + 1),
    }),
    [phase, profile, bootError, setProfile, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const value = useContext(Ctx);
  if (!value) throw new Error("StoreProvider is missing");
  return value;
}
