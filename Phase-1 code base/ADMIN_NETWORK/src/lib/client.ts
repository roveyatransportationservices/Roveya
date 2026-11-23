"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export class ClientError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Which sign-in this window uses: the admin panel or the Support Desk. Kept per window, so both can be open side by side.
// A new window starts with the most recent sign-in.
const LANE_KEY = "rv_lane";
export type Lane = "admin" | "desk";

export function rememberLane(lane: Lane) {
  window.sessionStorage.setItem(LANE_KEY, lane);
  window.localStorage.setItem(LANE_KEY, lane);
}

export function forgetLane() {
  window.sessionStorage.removeItem(LANE_KEY);
}

function currentLane(): Lane | null {
  if (typeof window === "undefined") return null;
  const own = window.sessionStorage.getItem(LANE_KEY);
  if (own === "admin" || own === "desk") return own;
  const last = window.localStorage.getItem(LANE_KEY);
  if (last !== "admin" && last !== "desk") return null;
  window.sessionStorage.setItem(LANE_KEY, last);
  return last;
}

export async function api<T>(path: string, options: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown } = {}): Promise<T> {
  const lane = currentLane();
  const response = await fetch(`/api${path}`, {
    method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
    headers: { ...(options.body !== undefined ? { "Content-Type": "application/json" } : null), ...(lane ? { "x-rv-lane": lane } : null) },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  }).catch(() => null);
  if (!response) throw new ClientError("Could not reach the server. Check your connection.", 0);
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (response.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/login")) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  if (!response.ok) throw new ClientError(data.error ?? "Something went wrong.", response.status);
  return data;
}

// Loads a GET endpoint and reloads when the path changes; `poll` refreshes quietly.
export function useData<T>(path: string | null, poll?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(path));
  const current = useRef(path);
  current.current = path;

  const load = useCallback(
    async (quiet = false) => {
      if (!path) return;
      if (!quiet) setLoading(true);
      try {
        const next = await api<T>(path);
        if (current.current === path) {
          setData(next);
          setError("");
        }
      } catch (failure) {
        if (current.current === path) setError((failure as Error).message);
      } finally {
        if (current.current === path) setLoading(false);
      }
    },
    [path],
  );

  useEffect(() => {
    void load();
    if (!poll) return;
    const timer = setInterval(() => void load(true), poll);
    return () => clearInterval(timer);
  }, [load, poll]);

  return { data, error, loading, reload: () => load(true), setData };
}

export const qs = (params: Record<string, string | number | undefined | null>) => {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "");
  return entries.length ? `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)])).toString()}` : "";
};
