import assert from "node:assert/strict";
import test from "node:test";
import { cityDocumentsReady } from "./cityDocuments.ts";

const ready = { selfie: "uploaded", dlFront: "uploaded", dlBack: "uploaded", rc: "uploaded", aadhaar: "uploaded", pan: "uploaded" };

test("bike and auto registration needs both Aadhaar and PAN", () => {
  assert.equal(cityDocumentsReady(ready), true);
  assert.equal(cityDocumentsReady({ ...ready, pan: "missing" }), false);
  assert.equal(cityDocumentsReady({ ...ready, aadhaar: "missing" }), false);
  assert.equal(cityDocumentsReady({ ...ready, rc: "missing" }), false);
});
