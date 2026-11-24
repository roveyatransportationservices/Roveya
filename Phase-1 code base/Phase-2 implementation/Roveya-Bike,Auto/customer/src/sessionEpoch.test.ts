import assert from "node:assert/strict";
import test from "node:test";
import { confirmLogout, createTokenMemory } from "./sessionEpoch.ts";
import { confirmLogout as captainConfirm, createTokenMemory as captainMemory } from "../../rider/src/sessionEpoch.ts";

const sample = { accessToken: "access", refreshToken: "refresh", expiresAt: 1 };

test("a refresh that started before logout cannot keep tokens", () => {
  for (const create of [createTokenMemory, captainMemory]) {
    const memory = create();
    memory.replace(sample);
    const seen = memory.era();
    const signedOut = memory.beginSignOut();
    assert.equal(signedOut.refreshToken, "refresh");
    assert.equal(memory.current(), null);
    assert.equal(memory.claimWrite(seen), null);
    assert.equal(memory.canHydrate(seen), false);
  }
});

test("a late write clears only its own stored copy", () => {
  const memory = createTokenMemory();
  memory.replace(sample);
  const seen = memory.era();
  const mine = memory.claimWrite(seen);
  assert.equal(mine, 1);
  memory.beginSignOut();
  assert.equal(memory.finishWrite(mine!, sample, mine), "clear");
  assert.equal(memory.current(), null);
});

test("a late write leaves a newer sign-in in place", () => {
  const memory = createTokenMemory();
  const old = memory.claimWrite(memory.era());
  const newer = memory.claimWrite(memory.era());
  assert.equal(memory.finishWrite(old!, sample, newer), "drop");
  assert.equal(memory.finishWrite(newer!, { ...sample, accessToken: "new" }, newer), "keep");
  assert.equal(memory.current()?.accessToken, "new");
});

test("logout confirmation signs out on the second press", () => {
  const armed = { current: false };
  let shown = false;
  let left = 0;
  assert.equal(confirmLogout(armed, (on) => { shown = on; }, () => { left += 1; }), "armed");
  assert.equal(shown, true);
  assert.equal(left, 0);
  assert.equal(captainConfirm(armed, (on) => { shown = on; }, () => { left += 1; }), "signed-out");
  assert.equal(shown, false);
  assert.equal(left, 1);
});
