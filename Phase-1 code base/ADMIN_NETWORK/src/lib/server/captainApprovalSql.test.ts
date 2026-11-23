import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { approvalBlockMessage, databaseApproval, documentKindAllowed, type DatabaseApproval } from "./documentApproval.ts";

const TODAY = "2026-11-21";
const CITY = ["dlFront", "dlBack", "rc", "aadhaar", "pan", "selfie"];

function cityDocs(overrides: Record<string, { status?: string; expiresOn?: string | null }> = {}) {
  return CITY.map((kind) => ({
    kind,
    status: overrides[kind]?.status ?? "verified",
    expiresOn: overrides[kind]?.expiresOn === undefined ? (kind === "dlFront" || kind === "rc" ? "2030-12-31" : null) : overrides[kind].expiresOn,
  }));
}

function decide(overrides: Partial<Parameters<typeof databaseApproval>[0]> = {}): DatabaseApproval {
  return databaseApproval({
    captain: { status: "review", service: "taxi", vehicle: "bike" },
    documents: cityDocs(),
    carActive: false,
    requiredArgument: CITY,
    expiringArgument: ["dlFront", "rc"],
    todayArgument: TODAY,
    serverToday: TODAY,
    needCarArgument: false,
    ...overrides,
  });
}

test("six verified documents with valid expiry pass", () => {
  assert.deepEqual(decide(), { ok: true });
});

test("only the licence and RC are rejected", () => {
  const decision = decide({ documents: cityDocs().filter((row) => row.kind === "dlFront" || row.kind === "rc") });
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.equal(decision.reason, "missing");
});

test("a missing PAN, Aadhaar, selfie, licence back, licence front, or RC is rejected", () => {
  for (const kind of ["pan", "aadhaar", "selfie", "dlBack", "dlFront", "rc"]) {
    const decision = decide({ documents: cityDocs().filter((row) => row.kind !== kind) });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.equal(decision.reason, "missing");
      assert.equal(decision.kind, kind);
    }
  }
});

test("an expired licence or RC is rejected, and a past caller date cannot revive it", () => {
  const licence = decide({ documents: cityDocs({ dlFront: { expiresOn: "2020-01-01" } }) });
  const certificate = decide({ documents: cityDocs({ rc: { expiresOn: TODAY } }) });
  const revived = decide({ documents: cityDocs({ dlFront: { expiresOn: "2020-01-01" } }), todayArgument: "1990-01-01" });
  assert.equal(licence.ok, false);
  assert.equal(certificate.ok, false);
  assert.equal(revived.ok, false);
  if (!licence.ok) assert.equal(licence.reason, "expired");
  if (!certificate.ok) assert.equal(certificate.kind, "rc");
  if (!revived.ok) assert.equal(revived.reason, "expired");
});

test("a null required expiry is rejected even when the caller omits that kind", () => {
  const decision = decide({ documents: cityDocs({ rc: { expiresOn: null } }), expiringArgument: [] });
  assert.deepEqual(decision, { ok: false, reason: "undated", kind: "rc" });
});

test("a rejected document is rejected", () => {
  assert.deepEqual(decide({ documents: cityDocs({ pan: { status: "rejected" } }) }), { ok: false, reason: "rejected", kind: "pan" });
});

test("an empty or shortened required-kind array is rejected", () => {
  assert.equal(decide({ requiredArgument: [] }).ok, false);
  assert.equal(decide({ requiredArgument: null }).ok, false);
  const shortened = decide({ requiredArgument: ["dlFront", "rc"] });
  assert.equal(shortened.ok, false);
  if (!shortened.ok) assert.equal(shortened.reason, "incomplete_request");
});

test("duplicate kinds do not bypass a missing document or a duplicate row", () => {
  const repeated = [...CITY, ...CITY];
  assert.deepEqual(decide({ requiredArgument: repeated }), { ok: true });
  const onlyRepeated = decide({ requiredArgument: ["dlFront", "dlFront"], documents: cityDocs().filter((row) => row.kind === "dlFront") });
  assert.equal(onlyRepeated.ok, false);
  const duplicatedRow = decide({ documents: [...cityDocs(), { kind: "pan", status: "verified", expiresOn: null }] });
  assert.equal(duplicatedRow.ok, false);
  if (!duplicatedRow.ok) assert.equal(duplicatedRow.reason, "inconsistent");
});

test("two approvals activate once, and an active captain is not activated again", () => {
  const captain = { status: "review", service: "taxi", vehicle: "bike" };
  const first = decide({ captain });
  assert.equal(first.ok, true);
  captain.status = "active";
  const second = decide({ captain });
  assert.deepEqual(second, { ok: false, reason: "decided" });
  const already = decide({ captain: { status: "active", service: "taxi", vehicle: "bike" } });
  assert.equal(already.ok, false);
});

test("a failed approval does not become an audit event", () => {
  const failed = decide({ documents: cityDocs().filter((row) => row.kind !== "pan") });
  assert.equal(failed.ok, false);
  assert.equal(approvalBlockMessage("missing"), "Verify every required document before approving.");
  const desk = readFileSync(new URL("./desk.ts", import.meta.url), "utf8");
  const approve = desk.slice(desk.indexOf('input.action === "approve"'), desk.indexOf('input.action === "autoverify"'));
  assert.ok(approve.indexOf("commitCaptainApproval") < approve.indexOf('audit(admin, "captain.approve"'));
  const profile = readFileSync(new URL("../../app/api/captains/[id]/route.ts", import.meta.url), "utf8");
  assert.ok(profile.indexOf("commitCaptainApproval") < profile.indexOf("captain.${input.action}"));
  const car = readFileSync(new URL("../../app/api/cars/[id]/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(car, /commitCaptainApproval|captain\.approve/);
  assert.match(car, /captainApproval: \{ approved: false/);
  const profilePage = readFileSync(new URL("../../app/(panel)/captains/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(profilePage, /action === "approve" \? "Car approved\."/);
  const seats = readFileSync(new URL("./seatsPhone.ts", import.meta.url), "utf8");
  const publish = seats.slice(seats.indexOf("export async function publishSeatTrip"), seats.indexOf("export async function listCaptainTrips"));
  assert.ok(publish.indexOf('captain?.status !== "active"') < publish.indexOf('from("seat_trips")'));
  const route = readFileSync(new URL("../../app/api/desk/vado/[id]/route.ts", import.meta.url), "utf8");
  assert.match(route, /requireAdmin\("captains\.review"\)/);
});

const CARPOOL = ["dlFront", "dlBack", "aadhaar", "selfie", "rc", "insurance", "permit", "carFront", "carInside"];
const CARPOOL_DATED = ["dlFront", "rc", "insurance", "permit"];

function carpoolDocs(overrides: Record<string, { status?: string; expiresOn?: string | null }> = {}) {
  return CARPOOL.map((kind) => ({
    kind,
    status: overrides[kind]?.status ?? "verified",
    expiresOn: overrides[kind]?.expiresOn === undefined ? (CARPOOL_DATED.includes(kind) ? "2030-12-31" : null) : overrides[kind].expiresOn,
  }));
}

function carpool(overrides: Partial<Parameters<typeof databaseApproval>[0]> = {}) {
  return databaseApproval({
    captain: { status: "review", service: "seats", vehicle: "cab" },
    documents: carpoolDocs(),
    carActive: true,
    requiredArgument: CARPOOL,
    expiringArgument: CARPOOL_DATED,
    todayArgument: TODAY,
    serverToday: TODAY,
    needCarArgument: false,
    ...overrides,
  });
}

test("a complete carpool file is approved, and a city car flag still cannot be forced", () => {
  assert.deepEqual(carpool(), { ok: true });
  assert.equal(decide({ needCarArgument: true }).ok, true);
});

test("carpool approval rejects a missing or expired insurance or permit, a missing photo, a missing car, and a duplicate row", () => {
  const missingInsurance = carpool({ documents: carpoolDocs().filter((row) => row.kind !== "insurance") });
  const expiredInsurance = carpool({ documents: carpoolDocs({ insurance: { expiresOn: "2020-01-01" } }) });
  const missingPermit = carpool({ documents: carpoolDocs().filter((row) => row.kind !== "permit") });
  const expiredPermit = carpool({ documents: carpoolDocs({ permit: { expiresOn: TODAY } }) });
  const missingFront = carpool({ documents: carpoolDocs().filter((row) => row.kind !== "carFront") });
  const missingInside = carpool({ documents: carpoolDocs().filter((row) => row.kind !== "carInside") });
  const noCar = carpool({ carActive: false });
  const duplicated = carpool({ documents: [...carpoolDocs(), { kind: "insurance", status: "verified", expiresOn: "2030-12-31" }] });
  assert.deepEqual(missingInsurance, { ok: false, reason: "missing", kind: "insurance" });
  assert.deepEqual(expiredInsurance, { ok: false, reason: "expired", kind: "insurance" });
  assert.deepEqual(missingPermit, { ok: false, reason: "missing", kind: "permit" });
  assert.deepEqual(expiredPermit, { ok: false, reason: "expired", kind: "permit" });
  assert.deepEqual(missingFront, { ok: false, reason: "missing", kind: "carFront" });
  assert.deepEqual(missingInside, { ok: false, reason: "missing", kind: "carInside" });
  assert.deepEqual(noCar, { ok: false, reason: "car" });
  assert.equal(duplicated.ok, false);
  if (!duplicated.ok) assert.equal(duplicated.reason, "inconsistent");
});

test("an unknown document kind is refused, and only the owning captain can confirm an upload", () => {
  const unknown = decide({ requiredArgument: [...CITY, "passport"] });
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.reason, "unsupported_document");
  assert.equal(documentKindAllowed("insurance"), true);
  assert.equal(documentKindAllowed("carFront"), true);
  assert.equal(documentKindAllowed("passport"), false);
  const upload = readFileSync(new URL("./phoneDesk.ts", import.meta.url), "utf8");
  assert.match(upload, /documentKindAllowed\(kind\)/);
  assert.match(upload, /path\.startsWith\(`\$\{captainId\}\/`\)/);
  const route = readFileSync(new URL("../../app/api/desk/vado/[id]/route.ts", import.meta.url), "utf8");
  assert.match(route, /requireAdmin\("captains\.review"\)/);
  const v1 = readFileSync(new URL("../../app/api/v1/[[...path]]/route.ts", import.meta.url), "utf8");
  const uploadRoute = v1.slice(v1.indexOf('key === "captain/documents"'), v1.indexOf('key === "captain/payouts"'));
  assert.match(uploadRoute, /openSession\(auth, "captain"\)/);
  assert.match(uploadRoute, /prepareDocument/);
  assert.match(uploadRoute, /confirmDocument/);
});

test("the replacement migration qualifies every kind and does not weaken permissions", () => {
  const applied = readFileSync(new URL("../../../../../supabase/migrations/20261121173000_captain_document_expiry.sql", import.meta.url), "utf8");
  const replacement = readFileSync(new URL("../../../../../supabase/migrations/20261121190000_captain_approval_kind_match.sql", import.meta.url), "utf8");
  assert.match(applied, /document\.kind = kind/);
  assert.doesNotMatch(replacement, /document\.kind = kind\b/);
  assert.match(replacement, /counted\.kind = mandatory_doc\.mandatory_kind/);
  assert.match(replacement, /document\.kind = mandatory_doc\.mandatory_kind/);
  assert.match(replacement, /document\.kind = expiring_doc\.expiring_kind/);
  assert.match(replacement, /for update/);
  assert.match(replacement, /status = 'review'/);
  assert.match(replacement, /Asia\/Kolkata/);
  assert.match(replacement, /'insurance'/);
  assert.match(replacement, /car\.status = 'active'/);
  assert.match(replacement, /revoke all on function public\.approve_captain_review\(uuid, text\[\], text\[\], date, boolean\) from public, anon, authenticated/);
  assert.match(replacement, /grant execute on function public\.approve_captain_review\(uuid, text\[\], text\[\], date, boolean\) to service_role/);
  assert.doesNotMatch(replacement, /grant execute[\s\S]*to anon|grant execute[\s\S]*to authenticated|alter table|drop column|delete from|truncate/i);
  const carpoolMigration = readFileSync(new URL("../../../../../supabase/migrations/20261121203000_captain_document_carpool_kinds.sql", import.meta.url), "utf8");
  for (const kind of ["insurance", "permit", "fitness", "carFront", "carBack", "carInside", "dlFront", "pan", "selfie"]) {
    assert.match(carpoolMigration, new RegExp(`'${kind}'`));
  }
  assert.match(carpoolMigration, /captain_documents_kind_check/);
  assert.match(carpoolMigration, /revoke all on function public\.approve_captain_review\(uuid, text\[\], text\[\], date, boolean\) from public, anon, authenticated/);
  assert.match(carpoolMigration, /grant execute on function public\.approve_captain_review\(uuid, text\[\], text\[\], date, boolean\) to service_role/);
  assert.doesNotMatch(carpoolMigration, /document\.kind = kind\b|drop table|drop column|delete from|truncate/i);
  assert.doesNotMatch(carpoolMigration, /grant execute[\s\S]*to anon|grant execute[\s\S]*to authenticated/i);
});
