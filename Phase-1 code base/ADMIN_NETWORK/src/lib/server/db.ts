import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadtestBlocks, loadtestIsolationError } from "../loadtestGuard";

let client: SupabaseClient | null = null;

// Server only: the secret key bypasses row security, so it never reaches a browser.
export function db() {
  if (client) return client;
  const blocked = loadtestIsolationError(process.env);
  if (blocked) throw new Error(blocked);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.");
  const injectedDelay = Number(process.env.ROVEYA_TEST_DB_DELAY_MS ?? 0);
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        if (injectedDelay > 0 && injectedDelay <= 3_000) await new Promise((resolve) => setTimeout(resolve, injectedDelay));
        const target = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (loadtestBlocks(target)) throw new Error("Load-test mode refuses this outbound address.");
        return fetch(input, {
          ...init,
          signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(8_000)]) : AbortSignal.timeout(8_000),
        });
      },
    },
  });
  return client;
}

// Tables and views in the ADMIN CONTROLS schema.
export const controls = () => db().schema("admin_controls");
