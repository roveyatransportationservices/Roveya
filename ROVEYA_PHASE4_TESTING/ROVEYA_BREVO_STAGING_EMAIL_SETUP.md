# ROVEYA — Brevo Free staging email setup (founder manual)

**Scope:** staging Admin only (`roveya-staging-admin`).  
**Cost:** ₹0 (Brevo Free). No domain purchase. No APK rebuild. No production.  
**Code status:** dual-provider Admin integration is implemented locally (`EMAIL_PROVIDER=brevo|resend`). **Not committed / not deployed** until you approve.

---

## A. Create Brevo Free account

1. Open https://www.brevo.com/ and create a **Free** account (no credit card required per Brevo pricing FAQ).
2. Complete signup with an email you control.
3. If Brevo asks for **sending approval** before transactional send is enabled, complete that review and wait until sending is allowed (Free: up to **300 emails/day** after approval — [Brevo Free FAQ](https://www.brevo.com/pricing/)).

---

## B. Verify a sender (no domain purchase)

Official path: [Create a new sender](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email).

1. Brevo → bottom-left **Settings** → **Senders, Domains & IPs** → **Senders**.
2. **Add a sender**.
3. **From name:** `ROVEYA`
4. **From email:** an address you control (e.g. your Gmail). Do **not** buy a domain for this step.
5. Save → Brevo emails a **6-digit code** to that address → paste → **Verify sender**.
6. Note: free mailbox domains (Gmail/Yahoo/etc.) cannot be DKIM-authenticated; Brevo may rewrite From for deliverability. Acceptable for staging OTP; check Spam if needed.

---

## C. Create API key

Official path: [Create and manage API keys](https://help.brevo.com/hc/en-us/articles/209467485) / Settings → **SMTP & API** → **API Keys**.

1. **Generate API key**.
2. Name: `roveya-staging-admin`.
3. Prefer **Restricted** access with rights needed for **Transactional emails** / SMTP send (or Full if Restricted scopes are unclear).
4. Copy the key **once** — store only in Render env (never in git / chat / APK).

API used by Admin: `POST https://api.brevo.com/v3/smtp/email` with header `api-key` ([Send a transactional email](https://developers.brevo.com/docs/send-a-transactional-email)).

---

## D. Render staging Admin environment variables

Service: **`roveya-staging-admin`** (`https://roveya-staging-admin.onrender.com`)

Set these in the Render Dashboard → Environment (do **not** paste secret values into chat):

| Key | Value |
|-----|--------|
| `EMAIL_PROVIDER` | `brevo` |
| `BREVO_API_KEY` | *(paste Brevo API key)* |
| `BREVO_FROM_EMAIL` | Exact verified sender address (e.g. `you@gmail.com`) — **email only**, no display-name brackets required |
| `BREVO_FROM_NAME` | `ROVEYA` |

Keep existing Resend vars if present (unused while `EMAIL_PROVIDER=brevo`). Do **not** delete them yet so you can switch back with `EMAIL_PROVIDER=resend`.

Optional rollback: set `EMAIL_PROVIDER=resend` (requires working Resend domain for multi-recipient).

---

## E. Deploy gate (stop here until you approve)

Local worktree already contains:

- `emailTransport.ts` — Brevo + Resend selector
- `otpDelivery.ts` — OTP send via transport (hash/TTL/resend/tries unchanged)
- `receiptDispatch.ts` / `receipt.ts` — ride receipt email uses same provider
- Tests: mocked sends only (no live Brevo/Resend calls)

**Still required from you:**

1. Finish Brevo account + sender + API key (sections A–C).
2. Paste env vars on Render (section D) — or reply that keys are ready and authorize the agent to set them via Render API.
3. Approve **git commit + push** of Admin email changes on `release/roveya-staging-clean-v1`.
4. Approve **manual deploy / restart** of **staging Admin only**.

Until steps 3–4 happen, staging still runs Resend (`onboarding@resend.dev` owner-only sandbox).

---

## F. Post-deploy OTP smoke (after your deploy approval)

1. Wake: `https://roveya-staging-admin.onrender.com/api/health`
2. Customer APK → register with **tester email A** → confirm OTP arrives (not only Brevo owner inbox).
3. Captain APK → register with **tester email B** (different address) → confirm OTP.
4. Wrong code / expired code still reject (no demo OTP).

---

## G. CEO Admin login finding (read-only)

Authorized staging DB inspection (`pqnfipleuztivnrsyvkd`, schema `admin_controls`):

| Check | Result |
|-------|--------|
| `admins` rows | **0** |
| `super_admin` email | **Not present** — cannot be resolved from DB |
| `auth.users` emails | `roveyatransportationservices@gmail.com` (1 user) |
| `riders.email` | same address |

**Classification:** Admin CEO login is **BLOCKED** until you recreate a `super_admin` with `npm run create-admin` (or equivalent) against staging. Password hashes were not read or printed.

Suggested: use your founder work email as `--email` when recreating (do not reuse Customer/Captain tester inboxes for Admin if those phones will also run app OTP).
