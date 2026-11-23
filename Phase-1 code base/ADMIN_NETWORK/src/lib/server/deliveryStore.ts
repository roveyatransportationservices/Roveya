import { observe } from "./observe";
import { db } from "./db";
import type { ServiceReceipt } from "../receipt";
import { publicEvent, type PushStatus } from "../delivery";
import { ABANDON_NOTE, CLAIM_NOTE, MAX_PROVIDER_CLAIMS, PROVIDER_NOTE, STALE_MS, afterRead, claimMatches, nextAction, ownerAction, type DeliveryRow, type DeliveryStatus } from "../deliveryClaim";

export { publicEvent };

function missing(error: { message?: string } | null) {
  return Boolean(error && /relation|schema cache|42P01/i.test(error.message ?? ""));
}

export async function rememberEvent(input: { eventKey: string; kind: string; channel: string; audience: string; refType?: string; refId?: string; status: PushStatus; error?: string }) {
  const { error } = await db().from("communication_events").insert({
    event_key: input.eventKey,
    kind: input.kind,
    channel: input.channel,
    audience: input.audience,
    ref_type: input.refType ?? null,
    ref_id: input.refId ?? null,
    status: input.status,
    attempts: input.status === "queued" ? 0 : 1,
    last_error: input.error ?? null,
  });
  if (!error) return "stored" as const;
  if (error.code === "23505") return "duplicate" as const;
  observe("communication_event_unstored", { category: missing(error) ? "pending_schema" : "store_failed" });
  return "pending" as const;
}

export async function readEvent(eventKey: string): Promise<DeliveryRow | null> {
  const { data, error } = await db().from("communication_events").select("status,attempts,last_error,updated_at").eq("event_key", eventKey).maybeSingle();
  if (error) return null;
  if (!data) return null;
  return {
    status: data.status as DeliveryStatus,
    attempts: Number(data.attempts ?? 0),
    lastError: data.last_error == null ? null : String(data.last_error),
    updatedAt: Number.isFinite(Date.parse(String(data.updated_at ?? ""))) ? Date.parse(String(data.updated_at ?? "")) : 0,
  };
}

function oneRow(data: unknown) {
  return Array.isArray(data) && data.length === 1;
}

async function took(filter: PromiseLike<{ data: unknown; error: { message?: string } | null }>) {
  try {
    const { data, error } = await filter;
    if (error) {
      if (!missing(error)) observe("communication_event_unstored", { category: "store_failed" });
      return false;
    }
    return oneRow(data);
  } catch {
    observe("communication_event_unstored", { category: "store_failed" });
    return false;
  }
}

async function trace(eventKey: string, from: string | null, to: string, note: string) {
  const { error } = await db().from("communication_event_transitions").insert({ event_key: eventKey, from_status: from, to_status: to, note });
  if (error && !missing(error) && !/schema cache|PGRST205|42P01/i.test(error.message)) observe("communication_event_unstored", { category: "store_failed" });
}

export async function claimEvent(eventKey: string, attempts: number) {
  const won = await took(db().from("communication_events").update({
    last_error: CLAIM_NOTE,
    attempts: attempts + 1,
    updated_at: new Date().toISOString(),
  }).eq("event_key", eventKey).eq("status", "queued").is("last_error", null).eq("attempts", attempts).select("event_key"));
  if (won) await trace(eventKey, "queued", "queued", CLAIM_NOTE);
  return won;
}

export function reclaimEvent(eventKey: string, attempts: number, now: number) {
  const cutoff = new Date(now - STALE_MS).toISOString();
  return took(db().from("communication_events").update({
    last_error: CLAIM_NOTE,
    attempts: attempts + 1,
    updated_at: new Date().toISOString(),
  }).eq("event_key", eventKey).eq("status", "queued").eq("last_error", CLAIM_NOTE).eq("attempts", attempts).lt("updated_at", cutoff).select("event_key"));
}

export async function abandonEvent(eventKey: string) {
  await db().from("communication_events").update({
    status: "failed",
    last_error: ABANDON_NOTE,
    updated_at: new Date().toISOString(),
  }).eq("event_key", eventKey).eq("status", "queued").eq("last_error", CLAIM_NOTE);
}

export async function beginProvider(eventKey: string) {
  const won = await took(db().from("communication_events").update({
    status: "unknown",
    last_error: PROVIDER_NOTE,
    updated_at: new Date().toISOString(),
  }).eq("event_key", eventKey).eq("status", "queued").eq("last_error", CLAIM_NOTE).select("event_key"));
  if (won) await trace(eventKey, "queued", "unknown", PROVIDER_NOTE);
  return won;
}

export async function staleEventKeys(now: number) {
  const cutoff = new Date(now - STALE_MS).toISOString();
  const { data, error } = await db().from("communication_events").select("event_key").eq("status", "queued").lt("updated_at", cutoff).limit(5);
  if (error || !data) return [] as string[];
  return data.map((row) => String(row.event_key));
}

export async function advanceEvent(eventKey: string, now: number, ownsInsert: boolean) {
  if (ownsInsert) {
    try {
      return (await claimEvent(eventKey, 0)) ? "begin" as const : "stop" as const;
    } catch {
      return "stop" as const;
    }
  }
  let row: DeliveryRow | null = null;
  let readFailed = false;
  try {
    const { data, error } = await db().from("communication_events").select("status,attempts,last_error,updated_at").eq("event_key", eventKey).maybeSingle();
    if (error) readFailed = true;
    else if (data) {
      const parsed = Date.parse(String(data.updated_at ?? ""));
      row = { status: data.status as DeliveryStatus, attempts: Number(data.attempts ?? 0), lastError: data.last_error == null ? null : String(data.last_error), updatedAt: Number.isFinite(parsed) ? parsed : 0 };
    }
  } catch {
    readFailed = true;
  }
  const action = readFailed ? afterRead(null, now, true) : ownerAction(row, now, false);
  if (action === "claim" && row && claimMatches(row)) return (await claimEvent(eventKey, row.attempts)) ? "begin" as const : "stop" as const;
  if (action === "reclaim" && row) return (await reclaimEvent(eventKey, row.attempts, now)) ? "begin" as const : "stop" as const;
  if (action === "abandon") {
    await abandonEvent(eventKey);
    return "stop" as const;
  }
  return "stop" as const;
}

export function finishProvider(eventKey: string, status: PushStatus, error?: string) {
  return took(db().from("communication_events").update({
    status,
    last_error: error ?? null,
    updated_at: new Date().toISOString(),
  }).eq("event_key", eventKey).eq("status", "unknown").eq("last_error", PROVIDER_NOTE).select("event_key"));
}

export function skipClaimed(eventKey: string, reason = "ride_cancelled") {
  return took(db().from("communication_events").update({
    status: "skipped",
    last_error: reason,
    updated_at: new Date().toISOString(),
  }).eq("event_key", eventKey).eq("status", "queued").eq("last_error", CLAIM_NOTE).select("event_key"));
}

export async function storePayload(eventKey: string, input: { userId: string; title: string; body: string; offerId?: string }) {
  const { error } = await db().from("communication_events").update({
    user_id: input.userId,
    title: input.title.slice(0, 120),
    body: input.body.slice(0, 240),
    offer_id: input.offerId ?? null,
  }).eq("event_key", eventKey).eq("status", "queued");
  if (error && !/column|schema cache|PGRST204|42703/i.test(error.message)) observe("communication_event_unstored", { category: "store_failed" });
}

export type StrandedEvent = {
  eventKey: string;
  kind: string;
  channel: string;
  audience: string;
  refType: string | null;
  refId: string | null;
  userId: string;
  title: string;
  body: string;
  offerId: string | null;
};

export async function strandedEvents(now: number): Promise<StrandedEvent[]> {
  const cutoff = new Date(now - STALE_MS).toISOString();
  const { data, error } = await db().from("communication_events").select("event_key,kind,channel,audience,ref_type,ref_id,user_id,title,body,offer_id").eq("status", "queued").lt("updated_at", cutoff).not("user_id", "is", null).not("title", "is", null).not("body", "is", null).limit(5);
  if (error || !data) return [];
  return data.map((row) => ({
    eventKey: String(row.event_key),
    kind: String(row.kind ?? ""),
    channel: String(row.channel ?? "rides"),
    audience: String(row.audience ?? ""),
    refType: row.ref_type == null ? null : String(row.ref_type),
    refId: row.ref_id == null ? null : String(row.ref_id),
    userId: String(row.user_id),
    title: String(row.title),
    body: String(row.body),
    offerId: row.offer_id == null ? null : String(row.offer_id),
  }));
}

export { nextAction, ownerAction, MAX_PROVIDER_CLAIMS };

export async function markEvent(eventKey: string, status: PushStatus, error?: string) {
  const { error: writeError } = await db().from("communication_events").update({ status, last_error: error ?? null, updated_at: new Date().toISOString() }).eq("event_key", eventKey);
  if (writeError && !/relation|schema cache|42P01/i.test(writeError.message)) observe("communication_event_unstored", { category: "store_failed" });
}

export async function rememberReceipt(receipt: ServiceReceipt) {
  const { error } = await db().from("service_receipts").insert({
    receipt_no: receipt.receiptNo,
    source: receipt.source,
    ref_id: receipt.refId,
    document: receipt.document,
    payload: receipt,
    email_status: "not_sent",
  });
  if (!error || error.code === "23505") return receipt;
  observe("receipt_unstored", { category: /relation|schema cache|42P01/i.test(error.message) ? "pending_schema" : "store_failed" });
  return receipt;
}
