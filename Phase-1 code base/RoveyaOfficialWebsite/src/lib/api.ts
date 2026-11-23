"use client";

// Browser client for the ROVEYA platform API. Signs in as a "rider", the same
// account a traveller uses in the ROVEYA app, so bookings show up in both.

export const API = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
const KEY = "roveya-web-session";

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
const listeners = new Set<() => void>();

function read() {
  if (tokens || typeof window === "undefined") return tokens;
  try {
    const raw = window.localStorage.getItem(KEY);
    tokens = raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    tokens = null;
  }
  return tokens;
}

function save(next: Tokens | null) {
  tokens = next;
  if (next) window.localStorage.setItem(KEY, JSON.stringify(next));
  else window.localStorage.removeItem(KEY);
  listeners.forEach((listener) => listener());
}

export const hasSession = () => Boolean(read());

export function onSessionChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function refresh() {
  const current = read();
  if (!current) throw new ApiError("Log in to continue.", 401);
  refreshing ??= (async () => {
    const response = await fetch(`${API}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    }).catch(() => null);
    if (!response?.ok) {
      if (response) save(null);
      throw new ApiError("Your session has ended. Please log in again.", 401);
    }
    save((await response.json()) as Tokens);
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function api<T>(path: string, options: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; auth?: boolean } = {}): Promise<T> {
  if (!API) throw new ApiError("Online seat booking is not connected yet.", 503);
  const auth = options.auth ?? true;
  const session = read();
  if (auth && session && session.expiresAt * 1000 < Date.now() + 60_000) await refresh();
  const send = () => {
    const current = read();
    return fetch(`${API}/api/v1${path}`, {
      method: options.method ?? (options.body ? "POST" : "GET"),
      headers: { "Content-Type": "application/json", ...(auth && current ? { Authorization: `Bearer ${current.accessToken}` } : null) },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });
  };
  let response = await send().catch(() => null);
  if (response?.status === 401 && auth && read()) {
    await refresh();
    response = await send().catch(() => null);
  }
  if (!response) throw new ApiError("We could not reach ROVEYA. Check your internet and try again.", 0);
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new ApiError(data.error ?? "Something went wrong. Please try again.", response.status);
  return data;
}

export async function sendCode(phone: string, email?: string) {
  return api<{ ok: boolean; demo: boolean; channel?: "phone" | "email" }>("/auth/otp/send", { body: email ? { email, app: "rider" } : { phone, app: "rider" }, auth: false });
}

export async function verifyCode(phone: string, code: string, email?: string) {
  const result = await api<Tokens>("/auth/otp/verify", { body: email ? { email, app: "rider", code } : { phone, app: "rider", code }, auth: false });
  save({ accessToken: result.accessToken, refreshToken: result.refreshToken, expiresAt: result.expiresAt });
}

export async function signOut() {
  const current = read();
  if (current) await api("/auth/logout", { method: "POST", body: { refreshToken: current.refreshToken } }).catch(() => undefined);
  save(null);
}

// Browsers only allow popups opened straight from a click, so the window opens
// first and the checkout address is set once the server has created the payment.
export const openPayWindow = () => window.open("about:blank", "roveya-pay", "width=480,height=760");

// Shows the Razorpay checkout page and waits for the payment to land.
export async function payOnline(checkoutUrl: string, intentId: string, opened?: Window | null) {
  let popup = opened ?? null;
  if (popup && !popup.closed) popup.location.href = checkoutUrl;
  else popup = window.open(checkoutUrl, "roveya-pay", "width=480,height=760");
  if (!popup) window.location.assign(checkoutUrl);
  let told: "success" | "failed" | "cancelled" | null = null;
  const onMessage = (event: MessageEvent) => {
    try {
      const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      if (data?.type === "roveya-payment") told = data.status;
    } catch {
      // Messages from other windows are ignored.
    }
  };
  window.addEventListener("message", onMessage);
  const deadline = Date.now() + 8 * 60 * 1000;
  try {
    while (Date.now() < deadline) {
      const intent = await api<{ status: "created" | "paid" | "failed" }>(`/payments/${intentId}`).catch(() => null);
      if (intent?.status === "paid") return true;
      if (intent?.status === "failed" || told === "failed") return false;
      if (told === "cancelled" || (popup && popup.closed && told !== "success")) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        const last = await api<{ status: string }>(`/payments/${intentId}`).catch(() => null);
        return last?.status === "paid";
      }
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
    return false;
  } finally {
    window.removeEventListener("message", onMessage);
  }
}
