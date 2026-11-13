import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const APP = "captain";
const API = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");
// Port 3000 was the removed platform API. That address now means the on-device sample data.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const KEY = `roveya-seats-${APP}-tokens`;

// Without a reachable API the app runs on its on-device preview data.
export const live = Boolean(API) && !/:3000$/.test(API);

type Tokens = { accessToken: string; refreshToken: string; expiresAt: number };

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let tokens: Tokens | null = null;
let refreshing: Promise<void> | null = null;

const vault = {
  get: () => (Platform.OS === "web" ? AsyncStorage.getItem(KEY) : SecureStore.getItemAsync(KEY)),
  set: (value: string) => (Platform.OS === "web" ? AsyncStorage.setItem(KEY, value) : SecureStore.setItemAsync(KEY, value)),
  clear: () => (Platform.OS === "web" ? AsyncStorage.removeItem(KEY) : SecureStore.deleteItemAsync(KEY)),
};

export async function loadSession() {
  const raw = await vault.get().catch(() => null);
  tokens = raw ? (JSON.parse(raw) as Tokens) : null;
  return Boolean(tokens);
}

async function saveSession(next: Tokens) {
  tokens = next;
  await vault.set(JSON.stringify(next));
}

export async function clearSession() {
  tokens = null;
  await vault.clear().catch(() => undefined);
}

async function refresh() {
  if (!tokens) throw new ApiError("Sign in to continue.", 401);
  refreshing ??= (async () => {
    const response = await fetch(`${API}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens?.refreshToken }),
    }).catch(() => null);
    if (!response?.ok) {
      if (response) await clearSession();
      throw new ApiError("Your session has ended. Please sign in again.", 401);
    }
    await saveSession((await response.json()) as Tokens);
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function api<T>(path: string, options: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; auth?: boolean } = {}): Promise<T> {
  if (!live) throw new ApiError("Offline preview mode.", 0);
  const auth = options.auth ?? true;
  if (auth && tokens && tokens.expiresAt * 1000 < Date.now() + 60_000) await refresh();
  const send = () =>
    fetch(`${API}/api/v1${path}`, {
      method: options.method ?? (options.body ? "POST" : "GET"),
      headers: { "Content-Type": "application/json", ...(auth && tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : null) },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  let response = await send().catch(() => null);
  if (response?.status === 401 && auth && tokens) {
    await refresh();
    response = await send().catch(() => null);
  }
  if (!response) throw new ApiError("No connection. Check your internet and try again.", 0);
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new ApiError(data.error ?? "Something went wrong. Please try again.", response.status);
  return data;
}

export async function sendCode(phone: string) {
  return api<{ ok: boolean; demo: boolean }>("/auth/otp/send", { body: { phone, app: APP }, auth: false });
}

export async function verifyCode(phone: string, code: string) {
  const result = await api<Tokens & { userId: string; isNew: boolean }>("/auth/otp/verify", { body: { phone, app: APP, code }, auth: false });
  await saveSession({ accessToken: result.accessToken, refreshToken: result.refreshToken, expiresAt: result.expiresAt });
  return result;
}

export async function signOutRemote() {
  if (live && tokens) await api("/auth/logout", { method: "POST" }).catch(() => undefined);
  await clearSession();
}

let realtimeClient: SupabaseClient | null = null;

// Calls onChange whenever a matching row changes; row security limits what this captain sees.
export function watch(table: string, filter: string, onChange: () => void) {
  if (!live || !SUPABASE_URL || !SUPABASE_KEY || !tokens) return () => undefined;
  realtimeClient ??= createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  realtimeClient.realtime.setAuth(tokens.accessToken);
  const client = realtimeClient;
  const channel = client
    .channel(`${table}:${filter}:${Date.now()}`)
    .on("postgres_changes", { event: "*", schema: "public", table, ...(filter ? { filter } : null) }, () => onChange())
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}

// The photo goes straight to private storage on a one-time link; the server then checks it arrived.
export async function uploadPhoto(kind: string, uri: string) {
  const slot = await api<{ uploadUrl: string; path: string }>("/captain/documents", { body: { kind } });
  const form = new FormData();
  form.append("cacheControl", "3600");
  if (Platform.OS === "web") form.append("", await (await fetch(uri)).blob(), `${kind}.jpg`);
  else form.append("", { uri, name: `${kind}.jpg`, type: "image/jpeg" } as unknown as Blob);
  const response = await fetch(slot.uploadUrl, { method: "PUT", body: form, headers: { "x-upsert": "true" } }).catch(() => null);
  if (!response?.ok) throw new Error("The photo did not upload. Check your internet and try again.");
  await api("/captain/documents/confirm", { body: { kind, path: slot.path } });
}
