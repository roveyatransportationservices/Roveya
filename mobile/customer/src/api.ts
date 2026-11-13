import { api, live } from "./backend";

export async function deskLive() {
  if (!live) return false;
  const health = await api<{ ok: boolean }>("/health", { auth: false }).catch(() => null);
  return Boolean(health?.ok);
}
