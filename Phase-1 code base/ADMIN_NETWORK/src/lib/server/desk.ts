import { SERVICE_INFO, type ServiceKey } from "@/lib/services";
import { ApiError, check } from "./api";
import type { Admin } from "./auth";
import { audit } from "./auth";
import { istDay, istStart, type Row } from "./data";
import { controls, db } from "./db";
import { approvalBlockMessage, autoverifyAllowed, deskFileReady } from "./documentApproval";
import { supportScores } from "./ratings";
import { onlyService } from "./services";

// The Support Desk: new Vado (captains) wait for document checks against a clock that starts
// the moment they register (45 minutes unless platform_settings says otherwise).

const BUCKET = "captain-documents";
export const CITY_DOCS = ["dlFront", "dlBack", "rc", "aadhaar", "pan", "selfie"];
export const CARPOOL_DOCS = ["dlFront", "dlBack", "aadhaar", "selfie", "rc", "insurance", "permit", "carFront", "carInside"];
export const CARPOOL_OPTIONAL = ["pan", "fitness", "carBack"];
// Documents with a printed expiry date. The desk enters it on verifying; the daily sweep reminds and re-checks.
export const EXPIRING = ["dlFront", "rc", "insurance", "permit", "fitness"];
// The desk clock starts at registration, or again when a document expired and the Vado came back for a re-check.
const clockStart = (row: Row) => (row.review_since ?? row.created_at) as string;
export const DOC_TITLE: Record<string, string> = {
  dlFront: "Driving licence · front",
  dlBack: "Driving licence · back",
  rc: "Vehicle RC",
  aadhaar: "Aadhaar card",
  pan: "PAN card",
  selfie: "Photo of the Vado",
  insurance: "Insurance",
  permit: "Tourist / contract permit",
  fitness: "Fitness certificate",
  carFront: "Car · front with plate",
  carBack: "Car · back",
  carInside: "Car · inside",
};
const required = (service: ServiceKey) => (service === "carpool" ? CARPOOL_DOCS : CITY_DOCS);

export async function verificationMinutes() {
  const { data } = await db().from("platform_settings").select("value").eq("key", "vado_verification_minutes").maybeSingle();
  const minutes = Number(data?.value);
  return Number.isFinite(minutes) && minutes >= 5 && minutes <= 1440 ? minutes : 45;
}

// Where a registration stands: the desk can check it, or it waits on the Vado (missing or rejected papers).
function stateOf(service: ServiceKey, docs: Record<string, string>, carStatus: string | null, expiry: Record<string, string | null> = {}, captainStatus = "review") {
  const need = required(service);
  const missing = need.filter((kind) => !docs[kind] || docs[kind] === "missing");
  const rejected = Object.entries(docs).filter(([, status]) => status === "rejected").map(([kind]) => kind);
  const toCheck = Object.entries(docs).filter(([, status]) => status === "uploaded").map(([kind]) => kind);
  const verified = need.filter((kind) => docs[kind] === "verified");
  const decision = deskFileReady({
    service,
    status: captainStatus,
    documents: Object.entries(docs).map(([kind, status]) => ({ kind, status, expiresOn: expiry[kind] ?? null })),
    carStatus,
    today: istDay(),
  });
  const dateProblem = !decision.ok && (decision.reason === "expired" || decision.reason === "undated");
  const waitingOnVado = missing.length > 0 || rejected.length > 0 || (service === "carpool" && !carStatus) || dateProblem;
  return { missing, rejected, toCheck, verified: verified.length, need: need.length, waitingOnVado, ready: decision.ok };
}

export async function deskQueue(service: ServiceKey, city?: string) {
  const minutes = await verificationMinutes();
  const [{ data: rows }, { data: claims }] = await Promise.all([
    onlyService(db().from("captains").select("user_id,name,phone,captain_code,city,vehicle,vehicle_no,vehicle_model,created_at,review_since,status,status_note"), service).eq("status", "review").order("created_at").limit(500),
    controls().from("vado_claims").select("captain_id,admin_id,admin_name,claimed_at"),
  ]);
  const captains = (rows ?? []) as Row[];
  const ids = captains.map((row) => row.user_id);
  const [{ data: docRows }, { data: cars }] = ids.length
    ? await Promise.all([db().from("captain_documents").select("captain_id,kind,status,expires_on").in("captain_id", ids), service === "carpool" ? db().from("seat_cars").select("captain_id,status,make_model,plate").in("captain_id", ids) : Promise.resolve({ data: [] })])
    : [{ data: [] }, { data: [] }];
  const docsOf = new Map<string, Record<string, string>>();
  const expiryOf = new Map<string, Record<string, string | null>>();
  for (const row of (docRows ?? []) as Row[]) {
    docsOf.set(row.captain_id, { ...(docsOf.get(row.captain_id) ?? {}), [row.kind]: row.status });
    expiryOf.set(row.captain_id, { ...(expiryOf.get(row.captain_id) ?? {}), [row.kind]: (row.expires_on as string | null) ?? null });
  }
  const carOf = new Map(((cars ?? []) as Row[]).map((row) => [row.captain_id as string, row]));
  const claimOf = new Map(((claims ?? []) as Row[]).map((row) => [row.captain_id as string, row]));
  const all = captains.map((row) => {
    const docs = docsOf.get(row.user_id) ?? {};
    const car = carOf.get(row.user_id) ?? null;
    const state = stateOf(service, docs, car?.status ?? null, expiryOf.get(row.user_id) ?? {});
    const claim = claimOf.get(row.user_id);
    return {
      id: row.user_id as string,
      name: row.name as string,
      phone: row.phone as string,
      code: row.captain_code as string,
      city: (row.city as string) || "—",
      vehicle: service === "carpool" ? (car ? `${car.make_model} · ${car.plate}` : "Car not added") : `${row.vehicle_model ?? ""} · ${row.vehicle_no ?? ""}`,
      registeredAt: clockStart(row),
      dueAt: new Date(Date.parse(clockStart(row)) + minutes * 60000).toISOString(),
      recheck: row.review_since ? ((row.status_note as string | null) ?? "Re-check after a document expired") : null,
      ...state,
      carStatus: car?.status ?? null,
      claim: claim ? { adminId: claim.admin_id as string, name: claim.admin_name as string, at: claim.claimed_at as string } : null,
    };
  });
  const cities = [...new Set(all.map((row) => row.city))].sort();
  const list = city ? all.filter((row) => row.city.toLowerCase() === city.toLowerCase()) : all;

  // Done today in this service, from the audit log.
  const today = istStart(istDay());
  const { data: approvals } = await controls().from("audit_log").select("admin_name:admin_email,entity_id,at,detail").eq("action", "captain.approve").gte("at", today).order("at", { ascending: false }).limit(500);
  const approvedIds = ((approvals ?? []) as Row[]).map((row) => row.entity_id as string);
  const { data: approvedRows } = approvedIds.length ? await onlyService(db().from("captains").select("user_id,name,captain_code,city,created_at,review_since"), service).in("user_id", approvedIds) : { data: [] };
  const approvedOf = new Map(((approvedRows ?? []) as Row[]).map((row) => [row.user_id as string, row]));
  const names = await adminNames(((approvals ?? []) as Row[]).map((row) => row.admin_name));
  const done = ((approvals ?? []) as Row[])
    .filter((row) => approvedOf.has(row.entity_id))
    .map((row) => {
      const captain = approvedOf.get(row.entity_id)!;
      const took = Math.round((Date.parse(row.at) - Date.parse(clockStart(captain))) / 60000);
      return { id: row.entity_id as string, name: captain.name as string, code: captain.captain_code as string, city: captain.city as string, approvedAt: row.at as string, minutes: took, withinTime: took <= minutes, by: names.get(row.admin_name) ?? row.admin_name };
    });
  const now = Date.now();
  return {
    service,
    minutes,
    cities,
    stats: {
      waiting: all.length,
      readyToCheck: all.filter((row) => row.ready).length,
      waitingOnVado: all.filter((row) => row.waitingOnVado).length,
      overdue: all.filter((row) => Date.parse(row.dueAt) < now).length,
      approvedToday: done.length,
      avgMinutesToday: done.length ? Math.round(done.reduce((sum, row) => sum + row.minutes, 0) / done.length) : null,
      withinTimeToday: done.filter((row) => row.withinTime).length,
    },
    captains: list,
    done,
  };
}

async function adminNames(emails: string[]) {
  const list = [...new Set(emails.filter(Boolean))];
  if (!list.length) return new Map<string, string>();
  const { data } = await controls().from("admins").select("email,name").in("email", list);
  return new Map(((data ?? []) as Row[]).map((row) => [row.email as string, row.name as string]));
}

export async function deskVado(id: string) {
  const minutes = await verificationMinutes();
  const captain = check(await db().from("captains").select("user_id,name,phone,email,captain_code,status,status_note,service,vehicle,vehicle_no,vehicle_model,vehicle_color,vehicle_year,city,dob,gender,bank_holder,bank_last4,ifsc,upi,emergency_name,emergency_phone,created_at,review_since,approved_at").eq("user_id", id).maybeSingle(), "Vado not found.") as Row;
  const service: ServiceKey = captain.service === "seats" ? "carpool" : captain.vehicle === "cab" ? "taxi" : captain.vehicle === "auto" ? "auto" : "bike";
  const [{ data: docRows }, { data: car }, { data: claim }, { data: trail }] = await Promise.all([
    db().from("captain_documents").select("kind,status,review_note,storage_path,updated_at,reviewed_at,expires_on").eq("captain_id", id),
    db().from("seat_cars").select("id,make_model,car_class,plate,color,year,ac,amenities,layout_kind,status,review_note").eq("captain_id", id).maybeSingle(),
    controls().from("vado_claims").select("admin_id,admin_name,claimed_at").eq("captain_id", id).maybeSingle(),
    controls().from("audit_log").select("id,admin_email,action,detail,at,entity_id").or(`entity_id.eq.${id},entity_id.like.${id}:*`).order("at", { ascending: false }).limit(40),
  ]);
  const docs = Object.fromEntries(((docRows ?? []) as Row[]).map((row) => [row.kind as string, row.status as string]));
  const expiry = Object.fromEntries(((docRows ?? []) as Row[]).map((row) => [row.kind as string, (row.expires_on as string | null) ?? null]));
  const kinds = [...required(service), ...(service === "carpool" ? CARPOOL_OPTIONAL : [])];
  const byKind = new Map(((docRows ?? []) as Row[]).map((row) => [row.kind as string, row]));
  const documents = await Promise.all(
    kinds.map(async (kind) => {
      const row = byKind.get(kind);
      const signed = row?.storage_path ? await db().storage.from(BUCKET).createSignedUrl(row.storage_path, 900) : null;
      return { kind, title: DOC_TITLE[kind] ?? kind, required: required(service).includes(kind), status: (row?.status as string) ?? "missing", note: (row?.review_note as string) ?? null, updatedAt: (row?.updated_at as string) ?? null, viewUrl: signed?.data?.signedUrl ?? null, expires: EXPIRING.includes(kind), expiresOn: (row?.expires_on as string | null) ?? null };
    }),
  );
  return {
    minutes,
    service,
    serviceName: SERVICE_INFO[service].name,
    captain,
    dueAt: new Date(Date.parse(clockStart(captain)) + minutes * 60000).toISOString(),
    documents,
    car: car ?? null,
    state: stateOf(service, docs, (car as Row | null)?.status ?? null, expiry, String(captain.status ?? "review")),
    claim: claim ?? null,
    trail: trail ?? [],
  };
}

// Desk actions on one registration. Every one is audited with the time, so performance comes from the log.
// A printed expiry date: from today up to 30 years ahead, in YYYY-MM-DD.
export function checkExpiry(value: string | undefined, documentTitle: string) {
  const title = documentTitle.split(" · ")[0];
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) throw new ApiError(`Enter the expiry date printed on the ${title.toLowerCase()}.`, 400);
  const today = istDay();
  if (value <= today) throw new ApiError(`This ${title.toLowerCase()} has already expired. Ask the Vado for the renewed one.`, 400);
  if (Date.parse(value) > Date.now() + 30 * 365 * 86400000) throw new ApiError("That expiry date is too far ahead. Check the year.", 400);
  return value;
}

// The status change happens inside approve_captain_review, which locks the captain and writes nothing when a document is missing, rejected, or expired.
export async function commitCaptainApproval(captainId: string, service: ServiceKey) {
  // The function reads the captain row and builds its own required list.
  // A short or empty p_required is rejected, and a past p_today cannot revive an expired document.
  const result = await db().rpc("approve_captain_review", {
    p_captain: captainId,
    p_required: required(service),
    p_expiring: EXPIRING.filter((kind) => required(service).includes(kind)),
    p_today: istDay(),
    p_need_car: service === "carpool",
  });
  if (result.error) {
    if (/could not find|schema cache|PGRST202|42883|does not exist/i.test(result.error.message)) {
      throw new ApiError("Captain approval is waiting for the document safety update.", 503);
    }
    throw new ApiError("The captain could not be approved.", 409);
  }
  const body = (result.data ?? {}) as { ok?: boolean; reason?: string };
  if (!body.ok) throw new ApiError(approvalBlockMessage(body.reason ?? "missing"), 409);
  return body;
}

export async function deskAction(admin: Admin, id: string, input: { action: "claim" | "release" | "doc" | "car" | "approve" | "decline" | "autoverify"; kind?: string; status?: "verified" | "rejected"; note?: string; force?: boolean; expiresOn?: string }) {
  const detail = await deskVado(id);
  const captain = detail.captain;
  const now = new Date().toISOString();
  const { data: claim } = await controls().from("vado_claims").select("admin_id,admin_name,claimed_at").eq("captain_id", id).maybeSingle();
  const takeClaim = async () => {
    if (claim && claim.admin_id !== admin.id && !input.force) throw new ApiError(`${claim.admin_name ?? "Someone"} is checking this Vado right now.`, 409);
    if (!claim || claim.admin_id !== admin.id) check(await controls().from("vado_claims").upsert({ captain_id: id, admin_id: admin.id, admin_name: admin.name, claimed_at: now }).select("captain_id").single());
  };

  if (input.action === "claim") {
    if (captain.status !== "review") throw new ApiError("This Vado is already decided.", 409);
    await takeClaim();
    await audit(admin, "desk.claim", "captain", id, { service: detail.service });
  } else if (input.action === "release") {
    await controls().from("vado_claims").delete().eq("captain_id", id).eq("admin_id", admin.id);
  } else if (input.action === "doc") {
    if (!input.kind || !input.status) throw new ApiError("Pick the document and the decision.", 400);
    if (input.status === "rejected" && !input.note) throw new ApiError("Tell the Vado what to fix on this document.", 400);
    const dated = input.status === "verified" && EXPIRING.includes(input.kind);
    const expiresOn = dated ? checkExpiry(input.expiresOn, DOC_TITLE[input.kind] ?? "document") : undefined;
    await takeClaim();
    check(await db().from("captain_documents").update({ status: input.status, review_note: input.status === "rejected" ? input.note : null, reviewed_at: now, ...(dated ? { expires_on: expiresOn, expiry_notice: null } : null) }).eq("captain_id", id).eq("kind", input.kind).select("kind").maybeSingle(), "That document has not been uploaded yet.");
    await audit(admin, `document.${input.status}`, "captain_document", `${id}:${input.kind}`, { note: input.note ?? null, service: detail.service, ...(dated ? { expiresOn } : null) });
  } else if (input.action === "car") {
    if (!detail.car || !input.status) throw new ApiError("There is no car to check.", 400);
    if (input.status === "rejected" && !input.note) throw new ApiError("Tell the Vado what to fix on the car.", 400);
    await takeClaim();
    check(await db().from("seat_cars").update({ status: input.status === "verified" ? "active" : "rejected", review_note: input.status === "rejected" ? input.note : null }).eq("captain_id", id).select("id").single());
    await audit(admin, input.status === "verified" ? "car.approve" : "car.reject", "captain", id, { note: input.note ?? null, service: detail.service });
  } else if (input.action === "approve") {
    if (captain.status !== "review") throw new ApiError("This Vado is already decided.", 409);
    await takeClaim();
    const fresh = await deskVado(id);
    if (!fresh.state.ready) throw new ApiError(approvalBlockMessage("missing"), 409);
    await commitCaptainApproval(id, detail.service);
    await controls().from("vado_claims").delete().eq("captain_id", id);
    const took = Math.round((Date.now() - Date.parse(clockStart(captain))) / 60000);
    await audit(admin, "captain.approve", "captain", id, { service: detail.service, minutes: took, withinTime: took <= detail.minutes, via: "support_desk" });
  } else if (input.action === "autoverify") {
    if (!autoverifyAllowed(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.ROVEYA_ALLOW_AUTOVERIFY)) {
      throw new ApiError("Automatic verification is not available on this server.", 403);
    }
    if (captain.status !== "review") throw new ApiError("This Vado is already decided.", 409);
    await takeClaim();
    const expiresOn = "2030-12-31";
    const kinds = [...required(detail.service), ...(detail.service === "carpool" ? CARPOOL_OPTIONAL : [])];
    const { data: existing, error: existingError } = await db().from("captain_documents").select("kind").eq("captain_id", id);
    if (existingError) throw new ApiError("The documents could not be read.", 503);
    const have = new Set(((existing ?? []) as Row[]).map((row) => row.kind as string));
    const created: string[] = [];
    try {
      for (const kind of kinds) {
        const patch = { status: "verified", review_note: null, reviewed_at: now, ...(EXPIRING.includes(kind) ? { expires_on: expiresOn, expiry_notice: null } : {}) };
        const saved = have.has(kind)
          ? await db().from("captain_documents").update(patch).eq("captain_id", id).eq("kind", kind).select("kind").maybeSingle()
          : await db().from("captain_documents").insert({ captain_id: id, kind, ...patch }).select("kind").maybeSingle();
        if (!have.has(kind)) created.push(kind);
        check(saved, "The document could not be saved.");
      }
      if (detail.car) check(await db().from("seat_cars").update({ status: "active", review_note: null }).eq("captain_id", id).select("id").maybeSingle(), "The car could not be saved.");
      await commitCaptainApproval(id, detail.service);
    } catch (error) {
      if (created.length) await db().from("captain_documents").delete().eq("captain_id", id).in("kind", created);
      throw error;
    }
    await controls().from("vado_claims").delete().eq("captain_id", id);
    const took = Math.round((Date.now() - Date.parse(clockStart(captain))) / 60000);
    await audit(admin, "captain.approve", "captain", id, { service: detail.service, minutes: took, withinTime: took <= detail.minutes, via: "auto_verify" });
  } else {
    if (!input.note) throw new ApiError("Write the reason the Vado will see.", 400);
    await takeClaim();
    check(await db().from("captains").update({ status: "suspended", status_note: input.note }).eq("user_id", id).select("user_id").single());
    await controls().from("vado_claims").delete().eq("captain_id", id);
    await audit(admin, "captain.decline", "captain", id, { service: detail.service, note: input.note, via: "support_desk" });
  }
  return deskVado(id);
}

// Support Desk performance: who verified how many Vado and how fast, and how tickets were answered.
// `only` narrows the credited work to one person; the live queue and open tickets stay team-wide.
export async function deskPerformance(days: number, only?: string) {
  const minutes = await verificationMinutes();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const actions = ["captain.approve", "captain.decline", "document.verified", "document.rejected", "car.approve", "car.reject", "desk.claim", "ticket.reply", "ticket.note", "ticket.update"];
  const [{ data: log }, { data: calls }, { data: team }, { data: tickets }, { data: queue }, { data: roles }] = await Promise.all([
    controls().from("audit_log").select("admin_id,admin_email,action,entity_id,detail,at").in("action", actions).gte("at", since).order("at").limit(20000),
    controls().from("call_log").select("admin_id,created_at").gte("created_at", since).limit(20000),
    controls().from("admins").select("id,name,email,role,active,last_login_at"),
    db().from("support_tickets").select("id,code,status,created_at").gte("created_at", since).limit(5000),
    db().from("captains").select("user_id,service,vehicle,created_at,review_since").eq("status", "review").limit(5000),
    controls().from("roles").select("key,name,workspace"),
  ]);
  const entries = (log ?? []) as Row[];
  const scores = await supportScores(since);
  const credited = (row: Row) => !only || row.admin_id === only;
  const callRows = ((calls ?? []) as Row[]).filter(credited);
  const approvals = entries.filter((row) => row.action === "captain.approve" && credited(row));
  const captainIds = [...new Set(approvals.map((row) => row.entity_id as string))];
  const { data: captains } = captainIds.length ? await db().from("captains").select("user_id,created_at,review_since,service,vehicle").in("user_id", captainIds) : { data: [] };
  const captainOf = new Map(((captains ?? []) as Row[]).map((row) => [row.user_id as string, row]));
  const serviceOf = (row: Row | undefined): ServiceKey => (row?.service === "seats" ? "carpool" : row?.vehicle === "cab" ? "taxi" : row?.vehicle === "auto" ? "auto" : "bike");
  const took = (row: Row) => {
    const captain = captainOf.get(row.entity_id);
    return captain ? Math.max(0, Math.round((Date.parse(row.at) - Date.parse(clockStart(captain))) / 60000)) : null;
  };

  // Tickets: first reply and resolution times, credited to whoever did them.
  const ticketRows = (tickets ?? []) as Row[];
  const ticketOf = new Map(ticketRows.map((row) => [row.id as string, row]));
  const firstReply = new Map<string, Row>();
  const resolved = new Map<string, Row>();
  for (const row of entries) {
    if (!ticketOf.has(row.entity_id)) continue;
    if (row.action === "ticket.reply" && !firstReply.has(row.entity_id)) firstReply.set(row.entity_id, row);
    const status = row.detail?.patch?.status;
    if ((status === "resolved" || status === "closed") && !resolved.has(row.entity_id)) resolved.set(row.entity_id, row);
  }
  const since0 = (row: Row) => Math.max(0, Math.round((Date.parse(row.at) - Date.parse(ticketOf.get(row.entity_id)!.created_at)) / 60000));
  const avg = (values: (number | null)[]) => {
    const list = values.filter((value): value is number => value !== null);
    return list.length ? Math.round(list.reduce((sum, value) => sum + value, 0) / list.length) : null;
  };

  const roleOf = new Map(((roles ?? []) as Row[]).map((row) => [row.key as string, row]));
  const people = ((team ?? []) as Row[]).filter((member) => !only || member.id === only).map((member) => {
    const mine = entries.filter((row) => row.admin_id === member.id);
    const approved = mine.filter((row) => row.action === "captain.approve");
    const times = approved.map(took);
    const replies = [...firstReply.values()].filter((row) => row.admin_id === member.id);
    const closes = [...resolved.values()].filter((row) => row.admin_id === member.id);
    return {
      id: member.id as string,
      name: member.name as string,
      email: member.email as string,
      role: (roleOf.get(member.role)?.name as string) ?? member.role,
      desk: roleOf.get(member.role)?.workspace === "support_desk",
      active: Boolean(member.active),
      lastLoginAt: member.last_login_at as string | null,
      vadoApproved: approved.length,
      vadoDeclined: mine.filter((row) => row.action === "captain.decline").length,
      avgMinutes: avg(times),
      withinTime: times.filter((value) => value !== null && value <= minutes).length,
      docsChecked: mine.filter((row) => row.action === "document.verified" || row.action === "document.rejected").length,
      fixesAsked: mine.filter((row) => row.action === "document.rejected").length,
      byService: Object.fromEntries((["bike", "auto", "taxi", "carpool"] as ServiceKey[]).map((key) => [key, approved.filter((row) => serviceOf(captainOf.get(row.entity_id)) === key).length])) as Record<ServiceKey, number>,
      ticketsReplied: new Set(mine.filter((row) => row.action === "ticket.reply").map((row) => row.entity_id)).size,
      ticketsResolved: closes.length,
      firstReplyMinutes: avg(replies.map(since0)),
      resolveMinutes: avg(closes.map(since0)),
      calls: callRows.filter((row) => row.admin_id === member.id).length,
      supportRating: scores.of(member.id).average,
      supportRatings: scores.of(member.id).count,
      actions: mine.length,
    };
  });
  const shown = people.filter((row) => row.desk || row.actions || row.calls).sort((a, b) => b.vadoApproved - a.vadoApproved || b.ticketsResolved - a.ticketsResolved || b.actions - a.actions);
  const allTimes = approvals.map(took);
  const now = Date.now();
  const queued = (queue ?? []) as Row[];
  const today = istDay();
  const labels = Array.from({ length: Math.min(days, 30) }, (_, index) => {
    const day = new Date(Date.now() - (Math.min(days, 30) - 1 - index) * 86400000);
    return istDay(day);
  });
  return {
    days,
    minutes,
    totals: {
      vadoApproved: approvals.length,
      avgMinutes: avg(allTimes),
      withinTime: allTimes.filter((value) => value !== null && value <= minutes).length,
      waitingNow: queued.length,
      overdueNow: queued.filter((row) => Date.parse(clockStart(row)) + minutes * 60000 < now).length,
      ticketsOpened: ticketRows.length,
      ticketsOpenNow: ticketRows.filter((row) => row.status === "open").length,
      firstReplyMinutes: avg([...firstReply.values()].filter(credited).map(since0)),
      resolveMinutes: avg([...resolved.values()].filter(credited).map(since0)),
      calls: callRows.length,
      supportRating: only ? scores.of(only).average : scores.average,
      supportRatings: only ? scores.of(only).count : scores.count,
      today,
    },
    byService: (["bike", "auto", "taxi", "carpool"] as ServiceKey[]).map((key) => {
      const mine = approvals.filter((row) => serviceOf(captainOf.get(row.entity_id)) === key);
      const times = mine.map(took);
      return { key, name: SERVICE_INFO[key].name, approved: mine.length, avgMinutes: avg(times), withinTime: times.filter((value) => value !== null && value <= minutes).length, waitingNow: queued.filter((row) => serviceOf(row) === key).length };
    }),
    series: {
      labels,
      approved: labels.map((day) => approvals.filter((row) => istDay(new Date(row.at)) === day).length),
      avgMinutes: labels.map((day) => avg(approvals.filter((row) => istDay(new Date(row.at)) === day).map(took)) ?? 0),
    },
    people: shown,
  };
}
