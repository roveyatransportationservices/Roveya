import assert from "node:assert/strict";
import test from "node:test";
import { loadtestBlocks, loadtestIsolationError } from "./loadtestGuard";

const local = {
  ROVEYA_LOADTEST: "1",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  DATABASE_URL: "postgresql://postgres@127.0.0.1:54322/postgres",
};

test("an ordinary server is not blocked by the load-test guard", () => {
  assert.equal(loadtestIsolationError({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" }), null);
  const previous = process.env.ROVEYA_LOADTEST;
  delete process.env.ROVEYA_LOADTEST;
  assert.equal(loadtestBlocks("https://api.razorpay.com/v1/orders"), false);
  if (previous === undefined) delete process.env.ROVEYA_LOADTEST;
  else process.env.ROVEYA_LOADTEST = previous;
});

test("load-test mode allows only the local API and database ports", () => {
  assert.equal(loadtestIsolationError(local), null);
  assert.match(loadtestIsolationError({ ...local, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:5432" }) ?? "", /API address/);
  assert.match(loadtestIsolationError({ ...local, DATABASE_URL: "postgresql://postgres@10.0.0.8:54322/postgres" }) ?? "", /database address/);
  assert.match(loadtestIsolationError({ ...local, DATABASE_URL: "postgresql://postgres.example@127.0.0.1:54322/postgres" }) ?? "", /database user/);
  assert.match(loadtestIsolationError({ ...local, STAGING_DATABASE_URL: "postgresql://postgres@127.0.0.1:54322/postgres" }) ?? "", /staging/);
  assert.match(loadtestIsolationError({ ...local, RESEND_API_KEY: "re_test" }) ?? "", /provider/);
  process.env.ROVEYA_LOADTEST = "1";
  assert.equal(loadtestBlocks("http://127.0.0.1:54321/rest/v1/trips"), false);
  assert.equal(loadtestBlocks("https://router.project-osrm.org/route/v1/driving/0,0;1,1"), true);
  assert.equal(loadtestBlocks("https://nominatim.openstreetmap.org/search"), true);
  assert.equal(loadtestBlocks("https://api.resend.com/emails"), true);
  assert.equal(loadtestBlocks("https://api.brevo.com/v3/smtp/email"), true);
  assert.match(loadtestIsolationError({ ...local, BREVO_API_KEY: "xkeysib-test" }) ?? "", /provider/);
  delete process.env.ROVEYA_LOADTEST;
});
