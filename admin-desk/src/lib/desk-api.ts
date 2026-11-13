import { createClient } from "@/lib/supabase/browser";

const base = (process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_WEBSITE_URL || "http://localhost:3000").replace(/\/$/, "");
let client: ReturnType<typeof createClient> | null = null;

// Calls the ROVEYA platform's admin API with the desk's own Supabase session.
export async function desk<T>(path: string, options: { method?: "GET" | "POST" | "PATCH"; body?: unknown } = {}): Promise<T> {
  client ??= createClient();
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  const response = await fetch(`${base}/api/v1/admin${path}`, {
    method: options.method ?? (options.body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  const json = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(json.error ?? `The platform answered ${response.status}.`);
  return json;
}
