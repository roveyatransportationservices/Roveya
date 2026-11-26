import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ApiError } from "./errors.ts";
import { canClaimPushToken } from "./pushClaim.ts";
import { allow, clientAddress, limitUnlessReplay, setSlotCheckForTests } from "./rateLimit.ts";
import { leaseExpired, leaseOwned, leaseStamp } from "./sweepLease.ts";
import { rideBill, DEFAULT_RIDE_PLAN } from "../ridePlan.ts";

const sql = readFileSync(new URL("../../../ADMIN CONTROLS/019_upi_direct_settlement.sql", import.meta.url), "utf8");

test("a spoofed forwarded address is ignored until a trusted hop count is set", () => {
  const previous = process.env.ROVEYA_TRUSTED_PROXY_HOPS;
  delete process.env.ROVEYA_TRUSTED_PROXY_HOPS;
  const req = new Request("http://127.0.0.1/api/v1/maps/search", { headers: { "x-forwarded-for": "203.0.113.8, 198.51.100.2" } });
  assert.equal(clientAddress(req), "direct");
  process.env.ROVEYA_TRUSTED_PROXY_HOPS = "1";
  assert.equal(clientAddress(req), "198.51.100.2");
  process.env.ROVEYA_TRUSTED_PROXY_HOPS = "1";
  const v6 = new Request("http://127.0.0.1/x", { headers: { "x-forwarded-for": "2001:db8::1" } });
  assert.equal(clientAddress(v6), "2001:db8::1");
  assert.throws(() => clientAddress(new Request("http://127.0.0.1/x")), ApiError);
  if (previous === undefined) delete process.env.ROVEYA_TRUSTED_PROXY_HOPS;
  else process.env.ROVEYA_TRUSTED_PROXY_HOPS = previous;
});

test("the HTTP API returns 429 with Retry-After and does not continue the booking", async () => {
  setSlotCheckForTests(async () => ({ error: null, data: false }));
  let booked = 0;
  const server = createServer(async (req, res) => {
    try {
      await allow("book", "rider-a", 10, 60, "Too many booking attempts. Wait a minute and try again.");
      booked += 1;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ booked: true }));
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (error instanceof ApiError && error.retryAfter) headers["Retry-After"] = String(error.retryAfter);
      res.writeHead(status, headers);
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : "failed" }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/bike/rides`, { method: "POST" });
  const body = await response.json();
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.match(body.error, /Too many booking attempts/);
  assert.equal(booked, 0);
  server.close();
  setSlotCheckForTests(null);
});

test("a limiter failure returns 503 and does not send an OTP", async () => {
  setSlotCheckForTests(async () => ({ error: { message: "down" }, data: null }));
  let sent = 0;
  const server = createServer(async (_req, res) => {
    try {
      await allow("otp", "hash", 8, 600, "Too many tries. Wait ten minutes and try again.");
      sent += 1;
      res.writeHead(200);
      res.end("{}");
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : "failed" }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/auth/otp/send`, { method: "POST" });
  assert.equal(response.status, 503);
  assert.equal(sent, 0);
  const body = await response.json();
  assert.equal(body.error, "The service is busy. Try again in a moment.");
  server.close();
  setSlotCheckForTests(null);
});

test("a same-key replay is not counted, and a new booking is", async () => {
  let calls = 0;
  setSlotCheckForTests(async () => {
    calls += 1;
    return { error: null, data: true };
  });
  await limitUnlessReplay("book", "rider-a", 10, 60, "Too many booking attempts.", true);
  assert.equal(calls, 0);
  await limitUnlessReplay("book", "rider-a", 10, 60, "Too many booking attempts.", false);
  assert.equal(calls, 1);
  setSlotCheckForTests(null);
});

test("an old sweep token cannot own the lease after a newer worker takes it", () => {
  const older = leaseStamp("old-token", "2026-11-14T00:00:00.000Z");
  const newer = leaseStamp("new-token", "2026-11-14T00:00:05.000Z");
  assert.equal(leaseOwned(older, "old-token"), true);
  assert.equal(leaseOwned(newer, "old-token"), false);
  assert.equal(leaseOwned(newer, "new-token"), true);
  assert.equal(leaseExpired("2026-11-14T00:00:00.000Z", Date.parse("2026-11-14T00:00:03.000Z")), false);
  assert.equal(leaseExpired("2026-11-14T00:00:00.000Z", Date.parse("2026-11-14T00:00:04.000Z")), true);
  assert.equal(leaseExpired(null, Date.now()), true);
});

test("one user cannot claim another user's push token", () => {
  assert.equal(canClaimPushToken("user-a", "user-b"), false);
  assert.equal(canClaimPushToken("user-a", "user-a"), true);
  assert.equal(canClaimPushToken(null, "user-b"), true);
});

test("sign-in does not accept a built-in demo code", () => {
  const delivery = readFileSync(new URL("./otpDelivery.ts", import.meta.url), "utf8");
  const transport = readFileSync(new URL("../emailTransport.ts", import.meta.url), "utf8");
  assert.doesNotMatch(delivery, /DEMO_CODE/);
  assert.doesNotMatch(delivery, /return true/);
  assert.doesNotMatch(transport, /DEMO_CODE/);
  assert.match(delivery, /Email sign-in is not switched on yet/);
  assert.match(delivery, /Text message sign-in is not switched on yet/);
  assert.match(delivery, /sendTransactionalEmail/);
});

test("subscription mode does not take a commission, and direct UPI is excluded from wallet credit", () => {
  const bill = rideBill("bike", 120, DEFAULT_RIDE_PLAN);
  assert.equal(bill.commission, 0);
  assert.equal(bill.passengerFee, 0);
  assert.equal(bill.captainReceives, 120);
  assert.match(sql, /v\.payment = 'cash' or v\.payment = 'upi'/);
  assert.match(sql, /elsif v\.payment = 'online'/);
  assert.match(sql, /revoke all on function public\.settle_trip\(uuid\) from public/);
});

test("requests inside the limit are allowed through the same HTTP check", async () => {
  setSlotCheckForTests(async () => ({ error: null, data: true }));
  const server = createServer(async (_req, res) => {
    await allow("quote", "rider-a", 30, 60, "Too many fare checks.");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/rides/quote`, { method: "POST" });
  assert.equal(response.status, 200);
  server.close();
  setSlotCheckForTests(null);
});
