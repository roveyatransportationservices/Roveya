import { db } from "./db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export type Person = { id: string; name: string; phone: string; kind: "Traveller" | "Captain"; code?: string };

// Names and phones for a mix of traveller and captain ids.
export async function people(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const map = new Map<string, Person>();
  if (!unique.length) return map;
  const [riders, captains] = await Promise.all([
    db().from("riders").select("user_id,name,phone").in("user_id", unique),
    db().from("captains").select("user_id,name,phone,captain_code").in("user_id", unique),
  ]);
  for (const row of riders.data ?? []) map.set(row.user_id, { id: row.user_id, name: row.name, phone: row.phone, kind: "Traveller" });
  for (const row of captains.data ?? []) map.set(row.user_id, { id: row.user_id, name: row.name, phone: row.phone, kind: "Captain", code: row.captain_code });
  return map;
}

export async function balances(ids: string[]) {
  const map = new Map<string, number>();
  if (!ids.length) return map;
  const { data } = await db().from("wallets").select("owner_id,balance_paise").in("owner_id", ids);
  for (const row of data ?? []) map.set(row.owner_id, Number(row.balance_paise));
  return map;
}

export async function count(table: string, apply: (query: Row) => Row = (query) => query) {
  const { count: total } = await apply(db().from(table).select("*", { count: "exact", head: true }));
  return total ?? 0;
}

export const istDay = (at = new Date()) => new Date(at.getTime() + 330 * 60000).toISOString().slice(0, 10);
export const shiftIst = (day: string, days: number) => {
  const at = new Date(`${day}T12:00:00+05:30`);
  at.setUTCDate(at.getUTCDate() + days);
  return istDay(at);
};
export const istStart = (day: string) => new Date(`${day}T00:00:00+05:30`).toISOString();

export const PLATFORM_WALLET = "00000000-0000-0000-0000-000000000001";
