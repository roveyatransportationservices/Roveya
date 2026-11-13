import "server-only";
import { serviceOfCaptain } from "@/lib/services";
import { check } from "./api";
import type { Admin } from "./auth";
import { audit } from "./auth";
import { istDay, shiftIst, type Row } from "./data";
import { db } from "./db";
import { checkExpiry, DOC_TITLE, EXPIRING } from "./desk";

// Documents expiring: what has expired, what expires soon, and verified documents still without a date.
export async function expiringDocuments(days: number) {
  const today = istDay();
  const until = shiftIst(today, days);
  const [{ data: soon }, { data: expired }, { data: undated }] = await Promise.all([
    db().from("captain_documents").select("captain_id,kind,status,expires_on,expiry_notice").eq("status", "verified").not("expires_on", "is", null).lte("expires_on", until).order("expires_on").limit(500),
    db().from("captain_documents").select("captain_id,kind,status,expires_on,updated_at").in("status", ["rejected", "uploaded"]).not("expires_on", "is", null).lt("expires_on", today).order("expires_on").limit(500),
    db().from("captain_documents").select("captain_id,kind,status").eq("status", "verified").in("kind", EXPIRING).is("expires_on", null).limit(1000),
  ]);
  const ids = [...new Set([...(soon ?? []), ...(expired ?? []), ...(undated ?? [])].map((row) => row.captain_id as string))];
  const { data: captains } = ids.length ? await db().from("captains").select("user_id,name,phone,captain_code,city,status,service,vehicle").in("user_id", ids) : { data: [] };
  const captainOf = new Map(((captains ?? []) as Row[]).map((row) => [row.user_id as string, row]));
  const shape = (row: Row) => {
    const captain = captainOf.get(row.captain_id);
    const left = row.expires_on ? Math.round((Date.parse(`${row.expires_on}T00:00:00+05:30`) - Date.parse(`${today}T00:00:00+05:30`)) / 86400000) : null;
    return {
      captainId: row.captain_id as string,
      name: (captain?.name as string) ?? "Vado",
      code: (captain?.captain_code as string) ?? "",
      phone: (captain?.phone as string) ?? "",
      city: (captain?.city as string) ?? "",
      captainStatus: (captain?.status as string) ?? "",
      service: captain ? serviceOfCaptain(captain) : "bike",
      kind: row.kind as string,
      title: DOC_TITLE[row.kind] ?? row.kind,
      status: row.status as string,
      expiresOn: (row.expires_on as string | null) ?? null,
      daysLeft: left,
      reminded: (row.expiry_notice as number | null) ?? null,
    };
  };
  return {
    days,
    expired: ((expired ?? []) as Row[]).map(shape),
    soon: ((soon ?? []) as Row[]).map(shape),
    undated: ((undated ?? []) as Row[]).map(shape).filter((row) => row.captainStatus === "active"),
  };
}

// For Vado approved before expiry dates were recorded: the desk reads the date off the photo and saves it.
export async function setExpiry(admin: Admin, captainId: string, kind: string, value: string) {
  const title = DOC_TITLE[kind] ?? "document";
  const expiresOn = checkExpiry(value, title);
  check(await db().from("captain_documents").update({ expires_on: expiresOn, expiry_notice: null }).eq("captain_id", captainId).eq("kind", kind).eq("status", "verified").select("kind").maybeSingle(), "That document is not verified.");
  await audit(admin, "document.expiry", "captain_document", `${captainId}:${kind}`, { expiresOn });
  return { ok: true };
}
