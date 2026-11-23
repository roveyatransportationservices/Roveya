export type DocumentRow = { kind: string; status: string; expiresOn?: string | null };

export type ReviewDecision =
  | { ok: true }
  | { ok: false; reason: "missing" | "rejected" | "expired" | "undated"; kind: string };

// Dates are India calendar days, YYYY-MM-DD, compared as text because that order matches the calendar.
export function reviewDocuments(input: { docs: DocumentRow[]; required: string[]; expiring: readonly string[]; today: string; enforceExpiry?: boolean }): ReviewDecision {
  const byKind = new Map(input.docs.map((row) => [row.kind, row]));
  for (const kind of input.required) {
    const row = byKind.get(kind);
    if (!row || row.status === "missing" || row.status === "uploaded") return { ok: false, reason: "missing", kind };
    if (row.status === "rejected") return { ok: false, reason: "rejected", kind };
    if (row.status !== "verified") return { ok: false, reason: "missing", kind };
    if (input.enforceExpiry !== false && input.expiring.includes(kind)) {
      if (!row.expiresOn) return { ok: false, reason: "undated", kind };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.expiresOn) || row.expiresOn <= input.today) return { ok: false, reason: "expired", kind };
    }
  }
  return { ok: true };
}

export function approvalAfterWrites(writes: { error: string | null }[]) {
  const approve = writes.length > 0 && writes.every((write) => write.error === null);
  return { approve, audit: approve };
}

export function captainStatusAfter(input: { previous: "review" | "active"; writesOk: boolean; gateOk: boolean }) {
  if (input.previous !== "review" || !input.writesOk || !input.gateOk) return input.previous === "active" ? "active" : "review";
  return "active";
}

// One locked update wins. A second attempt sees the captain already decided and does not audit again.
export function raceApprovals(attempts: number) {
  let status: "review" | "active" = "review";
  let activated = 0;
  let audits = 0;
  for (let index = 0; index < attempts; index += 1) {
    if (status !== "review") continue;
    status = "active";
    activated += 1;
    audits += 1;
  }
  return { status, activated, audits };
}

export function autoverifyAllowed(url: string | undefined, flag: string | undefined) {
  return flag === "staging" && url === "https://pqnfipleuztivnrsyvkd.supabase.co";
}

export function approvalGuard(session: { permissions: readonly string[] } | null, permission = "captains.review"): 401 | 403 | 200 {
  if (!session) return 401;
  if (!session.permissions.includes(permission)) return 403;
  return 200;
}

export function approvalBlockMessage(reason: string) {
  if (reason === "expired" || reason === "undated") return "A required document needs a valid expiry date before this captain can be approved.";
  if (reason === "rejected") return "A rejected document has to be replaced before this captain can be approved.";
  if (reason === "car") return "The car has to be approved before this captain can be approved.";
  if (reason === "incomplete_request") return "The approval request did not name every document this captain needs.";
  if (reason === "unsupported_document") return "This captain's service needs a document the file store cannot record yet.";
  if (reason === "unsupported_service") return "This captain's service cannot be approved.";
  if (reason === "inconsistent") return "The document records do not agree, so this captain stays in review.";
  if (reason === "decided") return "This captain is already decided.";
  return "Verify every required document before approving.";
}

// Kinds captain_documents can store after the carpool kind migration. Optional carpool papers are included so a caller can name them, but they are not mandatory.
export const STORED_DOCUMENT_KINDS = ["dlFront", "dlBack", "rc", "aadhaar", "pan", "selfie", "insurance", "permit", "fitness", "carFront", "carBack", "carInside"] as const;

export function documentKindAllowed(kind: string) {
  return (STORED_DOCUMENT_KINDS as readonly string[]).includes(kind);
}

const CITY_REQUIRED = ["dlFront", "dlBack", "rc", "aadhaar", "pan", "selfie"] as const;
const CITY_EXPIRING = ["dlFront", "rc"] as const;
const CARPOOL_REQUIRED = ["dlFront", "dlBack", "aadhaar", "selfie", "rc", "insurance", "permit", "carFront", "carInside"] as const;
const CARPOOL_EXPIRING = ["dlFront", "rc", "insurance", "permit"] as const;

export type ApprovalFailure = "missing_captain" | "decided" | "unsupported_service" | "unsupported_document" | "incomplete_request" | "missing" | "rejected" | "undated" | "expired" | "inconsistent" | "car";

export type DatabaseApproval = { ok: true } | { ok: false; reason: ApprovalFailure; kind?: string };

export function approvalRequirements(captain: { service: string; vehicle: string | null }): { required: string[]; expiring: string[]; needCar: boolean } | null {
  if (captain.service === "seats" || captain.service === "carpool") {
    return { required: [...CARPOOL_REQUIRED], expiring: [...CARPOOL_EXPIRING], needCar: true };
  }
  if (captain.service === "taxi" && (captain.vehicle === "bike" || captain.vehicle === "auto" || captain.vehicle === "cab")) {
    return { required: [...CITY_REQUIRED], expiring: [...CITY_EXPIRING], needCar: false };
  }
  return null;
}

// The same decisions as approve_captain_review. The caller arrays cannot shrink the set taken from the captain row.
export function databaseApproval(input: {
  captain: { status: string; service: string; vehicle: string | null } | null;
  documents: { kind: string; status: string; expiresOn?: string | null }[];
  carActive: boolean;
  requiredArgument: string[] | null;
  expiringArgument?: string[] | null;
  todayArgument: string | null;
  serverToday: string;
  needCarArgument?: boolean;
}): DatabaseApproval {
  if (!input.captain) return { ok: false, reason: "missing_captain" };
  if (input.captain.status !== "review") return { ok: false, reason: "decided" };
  const rules = approvalRequirements(input.captain);
  if (!rules) return { ok: false, reason: "unsupported_service" };
  const stored = new Set<string>(STORED_DOCUMENT_KINDS);
  const unsupported = rules.required.find((kind) => !stored.has(kind));
  if (unsupported) return { ok: false, reason: "unsupported_document", kind: unsupported };
  const requested = input.requiredArgument ?? [];
  if (requested.length === 0 || rules.required.some((kind) => !requested.includes(kind))) return { ok: false, reason: "incomplete_request" };
  const unknown = requested.find((kind) => !stored.has(kind));
  if (unknown !== undefined) return { ok: false, reason: "unsupported_document", kind: unknown };
  const cutoff = input.todayArgument && input.todayArgument > input.serverToday ? input.todayArgument : input.serverToday;
  const expiring = new Set<string>(rules.expiring);
  for (const kind of input.expiringArgument ?? []) {
    if (rules.required.includes(kind)) expiring.add(kind);
  }
  const needCar = rules.needCar || (Boolean(input.needCarArgument) && (input.captain.service === "seats" || input.captain.service === "carpool"));
  for (const kind of rules.required) {
    const rows = input.documents.filter((row) => row.kind === kind);
    if (rows.length === 0) return { ok: false, reason: "missing", kind };
    if (rows.length > 1) return { ok: false, reason: "inconsistent", kind };
    const row = rows[0];
    if (row.status === "rejected") return { ok: false, reason: "rejected", kind };
    if (row.status !== "verified") return { ok: false, reason: "missing", kind };
  }
  for (const kind of rules.required) {
    if (!expiring.has(kind)) continue;
    const row = input.documents.find((item) => item.kind === kind);
    if (!row?.expiresOn) return { ok: false, reason: "undated", kind };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.expiresOn) || row.expiresOn <= cutoff) return { ok: false, reason: "expired", kind };
  }
  const verified = new Set(input.documents.filter((row) => rules.required.includes(row.kind) && row.status === "verified" && (!expiring.has(row.kind) || (row.expiresOn && /^\d{4}-\d{2}-\d{2}$/.test(row.expiresOn) && row.expiresOn > cutoff))).map((row) => row.kind));
  if (verified.size !== rules.required.length) return { ok: false, reason: "missing" };
  if (needCar && !input.carActive) return { ok: false, reason: "car" };
  return { ok: true };
}

// Desk service names mapped onto the same captain row the database function reads.
export function deskFileReady(input: {
  service: "bike" | "auto" | "taxi" | "carpool";
  status?: string;
  documents: { kind: string; status: string; expiresOn?: string | null }[];
  carStatus: string | null;
  today: string;
}): DatabaseApproval {
  const captain = input.service === "carpool"
    ? { status: input.status ?? "review", service: "seats", vehicle: "cab" }
    : { status: input.status ?? "review", service: "taxi", vehicle: input.service === "taxi" ? "cab" : input.service };
  const rules = approvalRequirements(captain);
  return databaseApproval({
    captain,
    documents: input.documents,
    carActive: input.carStatus === "active",
    requiredArgument: rules?.required ?? [],
    expiringArgument: rules?.expiring ?? [],
    todayArgument: null,
    serverToday: input.today,
  });
}
