import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createTokenMemory } from "./sessionEpoch";

const APP = "captain";
const configured = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");
// Port 3000 was the removed platform API. That address now means the on-device sample data.
const API = /:3000$/.test(configured) ? "" : configured;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const KEY = `roveya-${APP}-tokens`;

// Without an API URL the app runs on its on-device demo data.
export const live = Boolean(API);

type Tokens = { accessToken: string; refreshToken: string; expiresAt: number };

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const memory = createTokenMemory();
let refreshing: Promise<void> | null = null;

const vault = {
  get: () => (Platform.OS === "web" ? AsyncStorage.getItem(KEY) : SecureStore.getItemAsync(KEY)),
  set: (value: string) => (Platform.OS === "web" ? AsyncStorage.setItem(KEY, value) : SecureStore.setItemAsync(KEY, value)),
  clear: () => (Platform.OS === "web" ? AsyncStorage.removeItem(KEY) : SecureStore.deleteItemAsync(KEY)),
};

function readStored(raw: string | null): (Tokens & { era?: number }) | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Tokens & { era?: number };
    if (!parsed.accessToken || !parsed.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function loadSession() {
  const seen = memory.era();
  const parsed = readStored(await vault.get().catch(() => null));
  if (!memory.canHydrate(seen)) return Boolean(memory.current());
  memory.replace(parsed ? { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken, expiresAt: parsed.expiresAt } : null);
  return Boolean(memory.current());
}

async function saveSession(next: Tokens, seenEra = memory.era()) {
  const mine = memory.claimWrite(seenEra);
  if (mine == null) return;
  await vault.set(JSON.stringify({ ...next, era: mine }));
  const stored = readStored(await vault.get().catch(() => null));
  const result = memory.finishWrite(mine, next, stored?.era ?? null);
  if (result === "clear") await vault.clear().catch(() => undefined);
}

export async function clearSession() {
  memory.beginSignOut();
  await vault.clear().catch(() => undefined);
}

async function refresh(seen = memory.era()) {
  const current = memory.current();
  if (!current || seen !== memory.era()) throw new ApiError("Sign in to continue.", 401);
  refreshing ??= (async () => {
    if (seen !== memory.era()) return;
    const response = await fetch(`${API}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    });
    if (seen !== memory.era()) return;
    if (!response.ok) {
      if (memory.era() === seen) await clearSession();
      throw new ApiError("Your session has ended. Please sign in again.", 401);
    }
    await saveSession((await response.json()) as Tokens, seen);
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function api<T>(path: string, options: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; auth?: boolean } = {}): Promise<T> {
  if (!live) throw new ApiError("Offline demo mode.", 0);
  const auth = options.auth ?? true;
  const seen = memory.era();
  if (auth && memory.current() && memory.current()!.expiresAt * 1000 < Date.now() + 60_000) await refresh(seen);
  const send = () => {
    const current = memory.current();
    return fetch(`${API}/api/v1${path}`, {
      method: options.method ?? (options.body ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        ...(auth && current ? { Authorization: `Bearer ${current.accessToken}` } : null),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  };
  let response = await send().catch(() => null);
  if (response?.status === 401 && auth && memory.current() && memory.era() === seen) {
    await refresh(seen);
    response = await send().catch(() => null);
  }
  if (!response) throw new ApiError("No connection. Check your internet and try again.", 0);
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new ApiError(data.error ?? "Something went wrong. Please try again.", response.status);
  return data;
}

export async function sendCode(phone: string, email?: string) {
  return api<{ ok: boolean; demo: boolean; channel?: "phone" | "email" }>("/auth/otp/send", { body: email ? { email, app: APP } : { phone, app: APP }, auth: false });
}

export async function verifyCode<P>(phone: string, code: string, email?: string) {
  const result = await api<Tokens & { userId: string; profile: P; isNew: boolean }>("/auth/otp/verify", { body: email ? { email, app: APP, code } : { phone, app: APP, code }, auth: false });
  await saveSession({ accessToken: result.accessToken, refreshToken: result.refreshToken, expiresAt: result.expiresAt });
  return result;
}

export async function signOutRemote() {
  const { refreshToken, mine } = memory.beginSignOut();
  await vault.clear().catch(() => undefined);
  if (memory.era() !== mine) return;
  if (live && refreshToken) {
    await fetch(`${API}/api/v1/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }
  if (memory.era() !== mine) return;
  await vault.clear().catch(() => undefined);
}

let realtimeClient: SupabaseClient | null = null;

// Polling is the ride update. This only nudges a refresh. The app token is not a database login.
export function watch(table: string, filter: string, onChange: () => void) {
  if (!live || !SUPABASE_URL || !SUPABASE_KEY || !memory.current()) return () => undefined;
  realtimeClient ??= createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const client = realtimeClient;
  const channel = client
    .channel(`${table}:${filter}:${Date.now()}`)
    .on("postgres_changes", { event: "*", schema: "public", table, filter }, () => onChange())
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}
