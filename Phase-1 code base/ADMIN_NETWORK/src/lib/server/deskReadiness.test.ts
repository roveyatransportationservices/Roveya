import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deskFileReady } from "./documentApproval.ts";

const TODAY = "2026-11-21";
const CITY = ["dlFront", "dlBack", "rc", "aadhaar", "pan", "selfie"];
const CARPOOL = ["dlFront", "dlBack", "aadhaar", "selfie", "rc", "insurance", "permit", "carFront", "carInside"];
const DATED = ["dlFront", "rc", "insurance", "permit"];

function papers(kinds: string[], patch: Record<string, { status?: string; expiresOn?: string | null }> = {}) {
  return kinds.map((kind) => ({
    kind,
    status: patch[kind]?.status ?? "verified",
    expiresOn: patch[kind]?.expiresOn === undefined ? (DATED.includes(kind) ? "2030-12-31" : null) : patch[kind].expiresOn,
  }));
}

test("a complete city file in review is ready, and a missing or expired city document is not", () => {
  assert.equal(deskFileReady({ service: "bike", documents: papers(CITY), carStatus: null, today: TODAY }).ok, true);
  const missing = deskFileReady({ service: "auto", documents: papers(CITY.filter((kind) => kind !== "pan")), carStatus: null, today: TODAY });
  assert.deepEqual(missing, { ok: false, reason: "missing", kind: "pan" });
  const licence = deskFileReady({ service: "taxi", documents: papers(CITY, { dlFront: { expiresOn: "2020-01-01" } }), carStatus: null, today: TODAY });
  assert.deepEqual(licence, { ok: false, reason: "expired", kind: "dlFront" });
  const rc = deskFileReady({ service: "bike", documents: papers(CITY, { rc: { expiresOn: TODAY } }), carStatus: null, today: TODAY });
  assert.deepEqual(rc, { ok: false, reason: "expired", kind: "rc" });
});

test("a complete carpool file is ready only with an active car and in-date mandatory papers", () => {
  assert.equal(deskFileReady({ service: "carpool", documents: papers(CARPOOL), carStatus: "active", today: TODAY }).ok, true);
  assert.equal(deskFileReady({ service: "carpool", documents: papers(CARPOOL), carStatus: "review", today: TODAY }).ok, false);
  assert.equal(deskFileReady({ service: "carpool", documents: papers(CARPOOL), carStatus: null, today: TODAY }).ok, false);
  const insurance = deskFileReady({ service: "carpool", documents: papers(CARPOOL.filter((kind) => kind !== "insurance")), carStatus: "active", today: TODAY });
  assert.deepEqual(insurance, { ok: false, reason: "missing", kind: "insurance" });
  const oldInsurance = deskFileReady({ service: "carpool", documents: papers(CARPOOL, { insurance: { expiresOn: "2020-01-01" } }), carStatus: "active", today: TODAY });
  assert.deepEqual(oldInsurance, { ok: false, reason: "expired", kind: "insurance" });
  const permit = deskFileReady({ service: "carpool", documents: papers(CARPOOL.filter((kind) => kind !== "permit")), carStatus: "active", today: TODAY });
  assert.deepEqual(permit, { ok: false, reason: "missing", kind: "permit" });
  const oldPermit = deskFileReady({ service: "carpool", documents: papers(CARPOOL, { permit: { expiresOn: "2020-01-01" } }), carStatus: "active", today: TODAY });
  assert.deepEqual(oldPermit, { ok: false, reason: "expired", kind: "permit" });
  const photo = deskFileReady({ service: "carpool", documents: papers(CARPOOL.filter((kind) => kind !== "carFront")), carStatus: "active", today: TODAY });
  assert.deepEqual(photo, { ok: false, reason: "missing", kind: "carFront" });
});

test("an active captain is not ready for another approval, and a captain in review is", () => {
  const active = deskFileReady({ service: "bike", status: "active", documents: papers(CITY), carStatus: null, today: TODAY });
  assert.deepEqual(active, { ok: false, reason: "decided" });
  const review = deskFileReady({ service: "carpool", status: "review", documents: papers(CARPOOL), carStatus: "active", today: TODAY });
  assert.equal(review.ok, true);
});

test("the queue count uses the same ready decision and reads expiry dates", () => {
  const desk = readFileSync(new URL("./desk.ts", import.meta.url), "utf8");
  const queue = desk.slice(desk.indexOf("export async function deskQueue"), desk.indexOf("async function adminNames"));
  assert.match(desk, /deskFileReady\(/);
  assert.match(queue, /expires_on/);
  assert.match(queue, /expiryOf\.get\(row\.user_id\)/);
  assert.match(queue, /readyToCheck: all\.filter\(\(row\) => row\.ready\)\.length/);
  const screen = readFileSync(new URL("../../components/desk/DeskQueue.tsx", import.meta.url), "utf8");
  assert.match(screen, /show === "ready" \? row\.ready/);
  assert.doesNotMatch(queue, /enforceExpiry: Boolean/);
});
