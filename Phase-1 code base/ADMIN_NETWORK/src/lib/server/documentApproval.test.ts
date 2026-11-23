import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { approvalAfterWrites, approvalGuard, autoverifyAllowed, captainStatusAfter, raceApprovals, reviewDocuments, type DocumentRow } from "./documentApproval.ts";

const REQUIRED = ["dlFront", "dlBack", "rc", "aadhaar", "pan", "selfie"];
const EXPIRING = ["dlFront", "rc", "insurance", "permit", "fitness"];
const TODAY = "2026-11-21";

function pack(overrides: Record<string, Partial<DocumentRow>> = {}): DocumentRow[] {
  return REQUIRED.map((kind) => ({
    kind,
    status: "verified",
    expiresOn: EXPIRING.includes(kind) ? "2030-12-31" : null,
    ...overrides[kind],
  }));
}

function gate(docs: DocumentRow[], enforceExpiry = true) {
  return reviewDocuments({ docs, required: REQUIRED, expiring: EXPIRING, today: TODAY, enforceExpiry });
}

test("all six verified documents can be approved", () => {
  assert.deepEqual(gate(pack()), { ok: true });
});

test("a missing driving licence blocks approval", () => {
  const decision = gate(pack({ dlFront: { status: "missing", expiresOn: null } }));
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.equal(decision.kind, "dlFront");
});

test("a missing registration certificate blocks approval", () => {
  const decision = gate(pack({ rc: { status: "uploaded", expiresOn: null } }));
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.equal(decision.kind, "rc");
});

test("every other required document blocks approval when it is missing", () => {
  for (const kind of ["dlBack", "aadhaar", "pan", "selfie"]) {
    const decision = gate(pack({ [kind]: { status: "missing" } }));
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.kind, kind);
  }
});

test("a rejected document blocks approval", () => {
  const decision = gate(pack({ pan: { status: "rejected" } }));
  assert.deepEqual(decision, { ok: false, reason: "rejected", kind: "pan" });
});

test("an expired document blocks approval", () => {
  const decision = gate(pack({ dlFront: { status: "verified", expiresOn: "2026-11-20" } }));
  assert.deepEqual(decision, { ok: false, reason: "expired", kind: "dlFront" });
  const undated = gate(pack({ rc: { status: "verified", expiresOn: null } }));
  assert.equal(undated.ok, false);
  if (!undated.ok) assert.equal(undated.reason, "undated");
});

test("a failed document write blocks approval and the audit event", () => {
  assert.deepEqual(approvalAfterWrites([{ error: null }, { error: "expires_on" }, { error: null }]), { approve: false, audit: false });
  assert.deepEqual(approvalAfterWrites(REQUIRED.map(() => ({ error: null }))), { approve: true, audit: true });
});

test("a partial verification failure leaves the captain in review", () => {
  assert.equal(captainStatusAfter({ previous: "review", writesOk: false, gateOk: false }), "review");
  assert.equal(captainStatusAfter({ previous: "review", writesOk: true, gateOk: false }), "review");
  assert.equal(captainStatusAfter({ previous: "review", writesOk: true, gateOk: true }), "active");
});

test("a desk mutation without a session is rejected, and a role without captains.review is forbidden", () => {
  assert.equal(approvalGuard(null), 401);
  assert.equal(approvalGuard({ permissions: ["view.captains", "view.support"] }), 403);
  assert.equal(approvalGuard({ permissions: ["view.captains", "captains.review", "view.support", "support.reply", "calls.make"] }), 200);
  const route = readFileSync(new URL("../../app/api/desk/vado/[id]/route.ts", import.meta.url), "utf8");
  assert.match(route, /requireAdmin\("captains\.review"\)/);
});

test("concurrent approvals activate one captain and audit once", () => {
  assert.deepEqual(raceApprovals(2), { status: "active", activated: 1, audits: 1 });
  const migration = readFileSync(new URL("../../../../../supabase/migrations/20261121173000_captain_document_expiry.sql", import.meta.url), "utf8");
  assert.match(migration, /for update/);
  assert.match(migration, /status = 'review'/);
  assert.match(migration, /expires_on is null or document\.expires_on <= p_today/);
  assert.doesNotMatch(migration, /drop table|delete from|truncate/i);
});

test("a failed approval does not record captain.approve before the database accepts it", () => {
  const desk = readFileSync(new URL("./desk.ts", import.meta.url), "utf8");
  const approve = desk.slice(desk.indexOf('input.action === "approve"'), desk.indexOf('input.action === "autoverify"'));
  assert.match(approve, /commitCaptainApproval/);
  assert.ok(approve.indexOf("commitCaptainApproval") < approve.indexOf('audit(admin, "captain.approve"'));
  const auto = desk.slice(desk.indexOf('input.action === "autoverify"'));
  assert.match(auto, /autoverifyAllowed/);
  assert.ok(auto.indexOf("autoverifyAllowed") < auto.indexOf("captain_documents"));
  assert.ok(auto.indexOf("commitCaptainApproval") < auto.indexOf('via: "auto_verify"'));
});

test("automatic verification stays off unless this staging project is named", () => {
  assert.equal(autoverifyAllowed("https://pqnfipleuztivnrsyvkd.supabase.co", "staging"), true);
  assert.equal(autoverifyAllowed("https://pqnfipleuztivnrsyvkd.supabase.co", undefined), false);
  assert.equal(autoverifyAllowed("https://example.supabase.co", "staging"), false);
});

test("registration still waits for the desk, and duty still refuses a captain in review", () => {
  const rides = readFileSync(new URL("./cityRides.ts", import.meta.url), "utf8");
  assert.match(rides, /status: "review"/);
  assert.match(rides, /if \(captain\.status !== "active"\) throw new ApiError\("The desk is still checking this account\."/);
});
