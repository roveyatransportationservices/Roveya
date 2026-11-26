import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEmailProvider, parseSenderForTests, resolveEmailConfig, sendTransactionalEmail } from "./emailTransport";
import { emailProviderReady } from "./providerPlan";

test("EMAIL_PROVIDER defaults to resend and accepts brevo", () => {
  assert.equal(normalizeEmailProvider(undefined), "resend");
  assert.equal(normalizeEmailProvider("RESEND"), "resend");
  assert.equal(normalizeEmailProvider("brevo"), "brevo");
  assert.equal(normalizeEmailProvider("other"), "resend");
});

test("Brevo stays off until API key and from email exist", () => {
  assert.equal(emailProviderReady({ EMAIL_PROVIDER: "brevo" }), false);
  assert.equal(emailProviderReady({ EMAIL_PROVIDER: "brevo", BREVO_API_KEY: "xkeysib-test", BREVO_FROM_EMAIL: "" }), false);
  assert.equal(emailProviderReady({ EMAIL_PROVIDER: "brevo", BREVO_API_KEY: "xkeysib-test", BREVO_FROM_EMAIL: "codes@example.com" }), true);
  assert.equal(resolveEmailConfig({ EMAIL_PROVIDER: "brevo", BREVO_API_KEY: "k", BREVO_FROM_EMAIL: "a@b.com" }).provider, "brevo");
});

test("Resend remains the default when Brevo is unset", () => {
  assert.equal(emailProviderReady({ RESEND_API_KEY: "re_test", RESEND_FROM_EMAIL: "ROVEYA <codes@example.com>" }), true);
  assert.equal(emailProviderReady({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_test", RESEND_FROM_EMAIL: "codes@example.com" }), true);
  assert.equal(emailProviderReady({ EMAIL_PROVIDER: "resend", BREVO_API_KEY: "x", BREVO_FROM_EMAIL: "a@b.com" }), false);
});

test("legacy key/from readiness shape still works for older tests", () => {
  assert.equal(emailProviderReady({ key: "test-key", from: "ROVEYA <codes@example.com>" }), true);
  assert.equal(emailProviderReady({ key: "test-key", from: "" }), false);
});

test("Brevo send builds the transactional API body without a live network call", async () => {
  let seen: { url?: string; headers?: HeadersInit; body?: string } = {};
  const result = await sendTransactionalEmail(
    {
      to: "customer@example.com",
      subject: "Your ROVEYA sign-in code",
      html: "<p>123456</p>",
      fetchImpl: async (url, init) => {
        seen = { url: String(url), headers: init?.headers, body: String(init?.body ?? "") };
        return new Response(JSON.stringify({ messageId: "test" }), { status: 201 });
      },
    },
    {
      EMAIL_PROVIDER: "brevo",
      BREVO_API_KEY: "xkeysib-test",
      BREVO_FROM_EMAIL: "founder@example.com",
      BREVO_FROM_NAME: "ROVEYA",
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.provider, "brevo");
  assert.equal(seen.url, "https://api.brevo.com/v3/smtp/email");
  const headers = new Headers(seen.headers);
  assert.equal(headers.get("api-key"), "xkeysib-test");
  const body = JSON.parse(seen.body ?? "{}");
  assert.equal(body.sender.email, "founder@example.com");
  assert.equal(body.to[0].email, "customer@example.com");
  assert.equal(body.subject, "Your ROVEYA sign-in code");
  assert.match(body.htmlContent, /123456/);
});

test("Resend send keeps Bearer auth and from string", async () => {
  let seen: { url?: string; body?: string; auth?: string | null } = {};
  const result = await sendTransactionalEmail(
    {
      to: "captain@example.com",
      subject: "Your ROVEYA sign-in code",
      html: "<p>654321</p>",
      fetchImpl: async (url, init) => {
        const headers = new Headers(init?.headers);
        seen = { url: String(url), body: String(init?.body ?? ""), auth: headers.get("Authorization") };
        return new Response("{}", { status: 200 });
      },
    },
    { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_test", RESEND_FROM_EMAIL: "ROVEYA <codes@example.com>" },
  );
  assert.equal(result.ok, true);
  assert.equal(result.provider, "resend");
  assert.equal(seen.url, "https://api.resend.com/emails");
  assert.equal(seen.auth, "Bearer re_test");
  const body = JSON.parse(seen.body ?? "{}");
  assert.deepEqual(body.to, ["captain@example.com"]);
  assert.equal(body.from, "ROVEYA <codes@example.com>");
});

test("provider failure returns not-ok and never invents an OTP accept path", async () => {
  const failed = await sendTransactionalEmail(
    {
      to: "anyone@example.com",
      subject: "x",
      html: "y",
      fetchImpl: async () => new Response("nope", { status: 401 }),
    },
    { EMAIL_PROVIDER: "brevo", BREVO_API_KEY: "bad", BREVO_FROM_EMAIL: "a@b.com" },
  );
  assert.equal(failed.ok, false);
  assert.equal(failed.status, 401);

  const missing = await sendTransactionalEmail(
    { to: "anyone@example.com", subject: "x", html: "y", fetchImpl: async () => new Response("{}", { status: 200 }) },
    { EMAIL_PROVIDER: "brevo" },
  );
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, "missing_config");
});

test("sender parser accepts name brackets or bare email", () => {
  assert.deepEqual(parseSenderForTests("ROVEYA <codes@example.com>"), { name: "ROVEYA", email: "codes@example.com" });
  assert.deepEqual(parseSenderForTests("codes@example.com"), { name: "ROVEYA", email: "codes@example.com" });
});
