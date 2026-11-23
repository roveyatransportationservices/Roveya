export const SWEEP_LEASE_KEY = "offer_sweep_lease";
export const SWEEP_LEASE_MS = 4_000;

export function leaseStamp(token: string, at: string) {
  return `${token}|${at}`;
}

export function leaseOwned(value: string | null | undefined, token: string) {
  return Boolean(token) && String(value ?? "").startsWith(`${token}|`);
}

// A missing or older timestamp can be taken. A newer timestamp cannot.
export function leaseExpired(updatedAt: string | null | undefined, now: number, maxAge = SWEEP_LEASE_MS) {
  const seen = Date.parse(String(updatedAt ?? ""));
  if (!Number.isFinite(seen)) return true;
  return now - seen >= maxAge;
}
