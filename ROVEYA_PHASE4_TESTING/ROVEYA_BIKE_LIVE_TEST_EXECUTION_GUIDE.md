# ROVEYA — Bike Live Test Execution Guide

**Date:** 2026-11-26  
**Worktree:** `C:\Users\Dell\Desktop\roveya-staging-clean-v1`  
**Branch:** `release/roveya-staging-clean-v1` @ `3d75ea6`  
**APKs:** `C:\Users\Dell\Desktop\ROVEYA_BIKE_FIELD_TEST_APKS\` (do **not** rebuild)  
**Phase 4.8:** paused  
**Expenditure target:** ₹0  
**This document:** preparation + execution order. Brevo dual-provider code is ready locally; **not committed / not deployed**. No wallet credits. Phase 4.8 paused.

**Companion:** `ROVEYA_BREVO_STAGING_EMAIL_SETUP.md`

---

## Stop point — founder credentials + deploy approval

### Progress

| Item | Status |
|------|--------|
| Founder approved Brevo (Option A) | Done |
| Admin dual-provider code (`EMAIL_PROVIDER` + Brevo/Resend) | **READY locally** (OTP + receipts) |
| Unit tests (mocked; no live emails) | **PASSED** |
| APK rebuild | Not required |
| Brevo account / sender / API key | **FOUNDER ACTION REQUIRED** |
| Render env + staging Admin deploy | **FOUNDER ACTION REQUIRED** |
| Staging `admin_controls.admins` CEO row | **BLOCKED** (table empty — see §2) |

### Current runtime blocker (live staging)

Staging Admin still runs **Resend** until you set Brevo env and approve commit/deploy. Multi-tester OTP remains blocked on live staging until then.

---

## 1. Resolve real OTP authentication

### Provider comparison (official constraints)

| Provider | Free allowance | Send to multiple distinct testers **without buying a domain**? | Sender rules | Fits current Admin? | APK rebuild? |
|----------|----------------|------------------------------------------------------------------|--------------|---------------------|--------------|
| **Resend (current)** | 100/day, 3,000/mo free | **No** — domain required for non-owner recipients | From must be on verified domain | Already integrated | No |
| **Brevo (Sendinblue)** | 300 emails/day free (after sending approval) | **Yes** — no recipient-domain sandbox like Resend; sender email verified by 6-digit code | Free From (e.g. Gmail) allowed but Brevo may **rewrite** From to `*.t-sender-sib.com` / deliverability weaker; custom domain recommended later | Needs **small Admin code + env** change | **No** |
| Amazon SES sandbox | Limited free | **No** — each recipient email must be verified in sandbox | Domain or verified identities | New integration | No |
| SMS 2Factor | Trial may exist | Possible but **DLT not free** | N/A | Env already sketched | No |

Sources: [Resend validation error](https://resend.com/docs/api-reference/errors), [Brevo Free plan limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan), [Brevo create sender](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email), [Gmail/Yahoo sender rules via Brevo](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders).

### Recommendation

**Prefer Brevo Free for this staging field test** if you will **not** purchase or use a custom domain:

- Cost: **₹0** (Free plan, 300 sends/day).
- Verify **one sender** address with Brevo’s email code (no DNS / no domain purchase).
- Send OTP to multiple tester Gmail/Outlook addresses.
- Backend-only: change `sendEmail` in Admin `otpDelivery.ts` to Brevo Transactional API (`POST https://api.brevo.com/v3/smtp/email`); keep existing random OTP, 5‑minute TTL, 30‑second resend, 5 tries (`providerPlan` / `otpDelivery`).
- Apps already call `/api/v1/auth/otp/send` + `verify` — **no APK rebuild**.
- Supabase remains session/data layer; OTP is Admin-hashed, not “demo”.

**If you already own a domain:** staying on Resend and verifying that domain is also valid (₹0 if DNS only) and needs **no code change**, only DNS + `RESEND_FROM_EMAIL` + Admin restart.

### Exact Brevo configuration steps (manual — see setup guide)

Full click-path: **`ROVEYA_BREVO_STAGING_EMAIL_SETUP.md`**.

1. Create Brevo Free account → complete sending approval if asked (300 emails/day).
2. Settings → Senders, Domains & IPs → Add sender → From name `ROVEYA` → verify with 6-digit email code.
3. Settings → SMTP & API → Generate API key (`roveya-staging-admin`).
4. On Render **`roveya-staging-admin`** set:
   - `EMAIL_PROVIDER=brevo`
   - `BREVO_API_KEY` *(secret)*
   - `BREVO_FROM_EMAIL` *(verified address)*
   - `BREVO_FROM_NAME=ROVEYA`
5. Approve **commit + push + staging Admin deploy/restart** (Customer/Captain services and APKs unchanged).
6. Smoke OTP to two distinct tester inboxes.

**Stop:** code is implemented locally; do not deploy until Brevo credentials exist and you approve deploy.

### Auth security preserved

- Random 6-digit OTP, HMAC-hashed at rest, 5 min expiry, 30 s resend, attempt lock — unchanged.
- Separate emails → separate auth users → separate Customer vs Captain.
- Same email must **not** be used for concurrent Customer + Captain roles.

| Prerequisite | Class |
|--------------|-------|
| Multi-tester OTP on **live** staging (still Resend) | **BLOCKED** |
| Brevo dual-provider code (local) | **READY** |
| Brevo account + Render env + Admin deploy | **FOUNDER ACTION REQUIRED** |
| Resend + already-owned domain | **OPTIONAL** alternative |
| APK rebuild for email provider | Not needed |

---

## 2. Admin credentials (staging)

| Item | Value |
|------|--------|
| Login URL | `https://roveya-staging-admin.onrender.com/login` |
| Identifier | Work **email** (CEO role key = `super_admin`) |
| Exact CEO email | **Not in DB** — read-only query of `admin_controls.admins` returned **0 rows** (no `super_admin`) |
| Related staging emails seen | Auth/rider only: `roveyatransportationservices@gmail.com` (not an Admin row) |
| Password location | Would be `admin_controls.admins.password_hash` (scrypt) after create-admin — **no hash exists today** |
| Recovery | After a CEO row exists: change password while logged in, or **Hiring → Employees** → one-time password (`admins.manage`) |
| Recreate CEO | From Admin repo with staging `.env.local`: `npm run create-admin -- --email YOUR@EMAIL --name "Your Name" --role super_admin` then store the printed one-time password securely |

### Permissions (CEO `super_admin` has all)

| Need | Permission / where |
|------|-------------------|
| Founder / all ops | `super_admin` |
| Captain approval / docs | `captains.review` (+ `view.captains`) |
| Wallet adjust | `money.wallets` |
| Live Bike monitor | `view.rides` + `view.captains` → Live Trips |

Wake Admin first: `https://roveya-staging-admin.onrender.com/api/health` (cold start ~45–90 s).

| Prerequisite | Class |
|--------------|-------|
| Admin login URL / role model | **READY** |
| Existing staging CEO login email | **BLOCKED** — recreate `super_admin` (**FOUNDER ACTION REQUIRED**) |

---

## 3. Customer registration (app screens)

**Install:** `ROVEYA-CUSTOMER-STAGING.apk` → package `com.roveya.customer`.

| Step | Screen / control | Action |
|------|------------------|--------|
| 1 | Welcome | **Sign in with mobile number** |
| 2 | Phone | Tap **Use email instead** → enter tester email → **Get code** |
| 3 | VERIFY · Enter the code | 6-digit OTP from email → auto-verify |
| 4 | Name (if new) | Enter display name → continue |
| 5 | Home (“Where to…”) | Grant **location while using the app** when prompted |
| 6 | Profile | Confirm account; logout available later |

OTP blocked until §1 is resolved for non-owner inboxes.

| Prerequisite | Class |
|--------------|-------|
| Customer APK + UI flow | **READY** |
| Live OTP for distinct customer email | **BLOCKED** until §1 |

---

## 4. Captain registration (app screens)

**Install:** `ROVEYA-CAPTAIN-STAGING.apk` → package `com.roveya.rider`.

Onboarding steps in app: **Service → City → Details → Vehicle → Documents → Bank → Review**.

| Step | Title / fields |
|------|----------------|
| Auth | Same as Customer: **Use email instead** → OTP → (login or register path) |
| Service | **What will you drive?** → choose **Bike** |
| City | **Which city do you drive in?** |
| Details | Full name, DOB (18+), gender, optional email; **Emergency contact** name + mobile |
| Vehicle | Number plate, make/model, colour, registration year |
| Documents | Profile selfie, DL front, DL back, RC, **Aadhaar and PAN (both required)** |
| Bank | Account holder, account number + confirm, IFSC, optional UPI |
| Review | **Submit for verification** → status **review** / Verification screen |

### Documents enforced vs not enforced (Bike)

| Document | App + Admin approval |
|----------|----------------------|
| DL front/back, RC, Aadhaar, PAN, selfie | **Required** (`cityDocumentsReady` / `CITY_REQUIRED`) |
| Bike insurance, state permit, PUC/fitness, pollution | **Not enforced** by current Bike onboarding (kinds exist mainly for carpool). State law may still require insurance/PUC for real road use — handle offline for the test |

Pending / rejected / suspended captains: duty gate requires `active`; matching excludes non-eligible (code + prior unit evidence).

| Prerequisite | Class |
|--------------|-------|
| Captain APK + registration UI | **READY** |
| Live OTP for distinct captain emails | **BLOCKED** until §1 |

**Do not create accounts or upload personal documents in this preparation step.**

---

## 5. Captain verification and approval (Admin)

Actual nav labels from `Shell.tsx`:

| Task | Navigation |
|------|------------|
| Pending Bike applications | **Support desk → ROVEYA Bike Vado** → `/desk/verify/bike` |
| Open one file | Queue row → `/desk/verify/bike/{id}` (claim / review) |
| Captain list | **Riders and Vado → ROVEYA Vado →** Bike → `/vado/bike` |
| Profile / activate | `/captains/{userId}` → Approve (`captains.review`) |
| Per-document Verify / Reject | Captain page → **Documents** → Verify / Reject |
| Suspend / reinstate | Captain page actions |
| Expiring docs | **Support desk → Documents expiring** |

### Existing vs missing

| Capability | Status |
|------------|--------|
| View queue, signed document images, verify/reject, approve → `active`, suspend offline | **Existing** |
| Auto-email “replace document” to captain | Not a dedicated productized flow — reject + note; captain re-uploads |
| Self-approve without desk | Not allowed |

Unapproved / rejected / suspended cannot go online or receive offers (duty + eligibility).

| Prerequisite | Class |
|--------------|-------|
| Admin approval UI | **READY** |
| Live captains to approve | **FOUNDER ACTION REQUIRED** (after OTP) |

---

## 6. Captain wallet test funding (₹50) — approval procedure only

| Item | Detail |
|------|--------|
| UI | `/captains/{id}` → **Adjust wallet** → Add money → Amount `50` |
| Permission | `money.wallets` |
| API | `POST /api/wallets/{id}` → `ledger_post` adjustment + platform mirror + `audit` `wallet.credit` |
| Note (required) | `STAGING_FIELD_TEST_CREDIT bike day-fee only non-revenue` |
| Duplicate prevention | Manual: check balance/ledger before second credit |
| Isolation | Note alone is insufficient; ₹50 &lt; ₹100 redeem minimum; never mark payouts Paid; keep Razorpay off |
| Day fee | First Bike online IST day deducts ₹10 once; marker prevents same-day duplicate |
| Negative balance | Fee path fail-closed (`allow_negative=false`) |

**Do not credit until separate founder approval after captains are `active`.**

| Prerequisite | Class |
|--------------|-------|
| Procedure | **READY** |
| Execution | **FOUNDER ACTION REQUIRED** (separate approval) |

---

## 7. Native application readiness (existing APKs)

| Item | Class | Note |
|------|-------|------|
| Customer + Captain staging APKs | **READY** | Desktop folder; install guide present |
| OSM / web map fallback | **READY** | No Google Maps key in build; sufficient for controlled test |
| Foreground offer polling (~3 s) | **READY** | Keep Captain app open / screen on |
| FCM background push | **OPTIONAL** | Defer; rebuild later if needed |
| APK rebuild / more EAS builds | **BLOCKED** by this brief | Do not consume allowance |

### Install (phones)

1. Allow unknown apps for the installer.
2. Install Customer APK on customer phones; Captain APK on captain phones.
3. Grant location (Captain: all-the-time when going on duty).
4. Wake Admin health URL before first OTP/API call.

---

## 8. Complete physical ride procedure (after auth unlocked)

All cash/UPI: **simulate handoff** — no real-money settlement marking beyond chosen method. Stationary / non-driving phone handling.

### A. Prerequisites (founder / testers)

1. Unlock OTP (§1) — **blocker**.
2. Admin login.
3. Install APKs; smoke launch.
4. Register **distinct** emails: 1 Customer + 1–2 Bike Captains.
5. Captains complete Join → Submit.
6. Desk: **ROVEYA Bike Vado** → verify docs → Approve.
7. Approve ₹50 credits → Adjust wallet once each.
8. Captains: Duty → go online (₹10 fee) → keep app **foreground**.

### B. Happy path (Scenario A)

| # | Actor | Action |
|---|-------|--------|
| 1 | Customer | Home → set pickup (GPS) → destination → Bike quote → request |
| 2 | System | Matching / offer to eligible online Bike captain |
| 3 | Captain | Offer card → Accept (foreground) |
| 4 | Customer | See captain details; track movement |
| 5 | Captain | Arrive at pickup |
| 6 | Customer | Show ride-start OTP |
| 7 | Captain | Enter OTP → start |
| 8 | Both | Move (GPS); Captain complete at drop |
| 9 | Both | Choose cash/UPI per script; histories update |
| 10 | Admin | **Live Trips → ROVEYA Bike Live** (`/live/bike`) + captain/customer pages |

### C. Extra scenarios (after A works)

| Scenario | Focus |
|----------|--------|
| B — 2 captains | One live offer; reject → reassign; single assignment |
| C — 2 customers / 1 captain | No dual active assignment |
| D — recovery | Data off/on; minimize; lock; restart; no duplicate fee/booking |

### Manual-only steps

All OTP entry, document photos, desk verify clicks, wallet Adjust, physical GPS movement, and payment simulation are **founder/tester manual**. Agent does not fabricate accounts or rides.

---

## 9. End-to-end checklist (ordered)

| # | Step | Class |
|---|------|-------|
| 0 | APKs on Desktop | **READY** |
| 1 | Recreate staging CEO (`super_admin`) — admins table empty | **BLOCKED** / **FOUNDER ACTION REQUIRED** |
| 2 | Brevo account + sender + API key | **FOUNDER ACTION REQUIRED** |
| 3 | Render env + approve commit/deploy staging Admin | **FOUNDER ACTION REQUIRED** |
| 4 | Sideload APKs + smoke | **FOUNDER ACTION REQUIRED** |
| 5 | Register Customer + Captains | **FOUNDER ACTION REQUIRED** |
| 6 | Desk verify + Approve | **FOUNDER ACTION REQUIRED** |
| 7 | ₹50 wallet credits | **FOUNDER ACTION REQUIRED** (separate OK) |
| 8 | Captains online (foreground) | **FOUNDER ACTION REQUIRED** |
| 9 | First completed Bike ride | **FOUNDER ACTION REQUIRED** |
| 10 | FCM | **OPTIONAL** |
| 11 | Razorpay / Phase 4.8 / production / paid subs | **BLOCKED** |

---

## Exact founder instructions (current stop)

Brevo integration is **approved and coded locally**. Clear the gate as follows:

### 1) Brevo Free (credentials)

Follow `ROVEYA_BREVO_STAGING_EMAIL_SETUP.md` sections A–C. Do **not** paste the API key in chat.

### 2) Recreate CEO Admin login

`admin_controls.admins` is empty on staging. From Admin with staging `.env.local`:

`npm run create-admin -- --email YOUR@EMAIL --name "Your Name" --role super_admin`

Store the one-time password securely. Login URL remains `/login`.

### 3) Env + deploy approval (reply to continue)

When Brevo key + sender exist, reply with either:

- **“Brevo credentials are in Render; approve commit + staging Admin deploy”**, or  
- **“Approve commit + deploy; set Render env from values I will provide privately”**

Then the agent will commit/push Admin email changes and deploy **staging Admin only**.

### Option B — Resend + domain you already own (fallback)

1. Add DNS records Resend shows for that domain; verify.
2. Set `RESEND_FROM_EMAIL` to an address on that domain.
3. Restart staging Admin.
4. No code change; no APK rebuild.

Until A or B is done, **stop here** for live multi-phone registration and rides.
