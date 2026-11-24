# ROVEYA Phase 4.7 — Final Closure Report

**Date:** 2026-11-24  
**Worktree:** `C:\Users\Dell\Desktop\roveya-staging-clean-v1`  
**Branch:** `release/roveya-staging-clean-v1`  
**Phase 4.7 app commit (Admin+Captain):** `4b8c52d88b4ccd6e2548c3ed6572cb7ea1d83e5e`  
**Latest Admin evidence commit:** `918c610206af04edc32aa2130c96d1330ba34dd9`  
**Upstream:** `origin/release/roveya-staging-clean-v1` @ `918c610`  
**Expenditure:** ₹0  

## Verdict

**STAGING SQL GATE PASSED — STAGING ADMIN + CAPTAIN DEPLOYED**

Founder installed Desktop STEP2 and ran STEP3 on staging Supabase `pqnfipleuztivnrsyvkd`. Repository migrations were synced to that STEP2 body, Admin/Captain builds passed, commit pushed, and both staging Render services were deployed. Admin was then redeployed at `918c610` for closure evidence + webhook secret admission harden. Customer was **not** redeployed (no Phase 4.7 Customer-required change).

Phase 4.7 does **not** claim live ride E2E on staging (no fabricated rides / captain accounts).

## Founder STEP3 evidence (staging `pqnfipleuztivnrsyvkd`)

| Check | Result |
|-------|--------|
| `settle_trip_md5` | `bc2d6d25fca6cf5a6665b337a4cc64ce` (unchanged) |
| `negative_captain_wallets` | `0` |
| `incorrect_upi_earnings` | `0` |
| `paid_day_volatility` | `v` |
| `legacy_routes_city` | `true` |
| `permissions_safe` | `true` |
| `receipt_email_approved` | `true` |

STEP2 was **not** re-run by the agent. `settle_trip` was **not** modified.

## Repository sync

Desktop `ROVEYA_PHASE47_STEP2_INSTALL.sql` (34727 bytes) embeds the four proposed SQL bodies. Byte-identical copies promoted into `supabase/migrations/`:

| File | MD5 |
|------|-----|
| `20261121240000_charge_active_day.sql` | `B21A205B60BC255B91083E449EC9C0AB` |
| `20261124180000_prepaid_go_online.sql` | `0D8E7B62848A665492BB9227BBBA9798` |
| `20261124210000_renew_online_day_fee.sql` | `001C89B659648ECD4F09E500225B8BFE` |
| `20261124220000_city_day_fee_matching.sql` | `B84ED22798CA7DA8CD2C9EE9A9DA963A` |

## Compatibility

Admin `cityRides.ts` already calls installed RPCs: `charge_active_day`, `go_online_with_day_fee`, `renew_online_day_fee`, `accept_city_offer`. Captain app uses Admin HTTP APIs (no direct SQL RPC). No Customer code change required for day-fee install.

## Local builds (actual)

| Check | Result |
|-------|--------|
| Admin `npm run typecheck` | PASS |
| Admin `npm run build` | PASS |
| Captain `npx expo export --platform web` | PASS (`Exported: dist`) |

## Git

| Item | Value |
|------|-------|
| Commit | `4b8c52d88b4ccd6e2548c3ed6572cb7ea1d83e5e` |
| Message | Promote Phase 4.7 STEP2 day-fee SQL into migrations and gate wallet top-up closed. |
| Push | `f89e7e4..4b8c52d` → `origin/release/roveya-staging-clean-v1` |
| `main` | **not** pushed |

## Staging deployments (actual)

| Service | Render ID | Deploy ID | Commit | Status |
|---------|-----------|-----------|--------|--------|
| Admin (P4.7 SQL + gated top-up) | `srv-dc26c9e1egvs73di6ts0` | `dep-dc2ridl9fdbs738hif20` | `4b8c52d88b4ccd6e2548c3ed6572cb7ea1d83e5e` | `live` (superseded) |
| Admin (evidence + webhook harden) | `srv-dc26c9e1egvs73di6ts0` | `dep-dc2rm8etlv9c738vllg0` | `918c610206af04edc32aa2130c96d1330ba34dd9` | `live` (current) |
| Captain | `srv-dc26ca61egvs73di6v7g` | `dep-dc2rk0142hec73900fr0` | `4b8c52d88b4ccd6e2548c3ed6572cb7ea1d83e5e` | `live` |
| Customer | — | — | — | **skipped** (not required) |

### Post-deploy verification

| Check | Result |
|-------|--------|
| `GET https://roveya-staging-admin.onrender.com/api/health` | `200 {"ok":true}` |
| `GET https://roveya-staging-admin.onrender.com/api/v1/health` | `200 {"ok":true}` |
| `POST /api/v1/wallet/topup` (unauthenticated) | `401` (auth required; recharge still gated) |
| Admin logs | Deploy available; periodic `sweep` events healthy (no crash loop) |
| `GET https://roveya-staging-captain.onrender.com/` | `200` (static site available) |

## Local PostgreSQL regression (prior; not re-run)

22/22 scenarios previously PASS on local Docker (fees, renewals, concurrent matching, unauthorized RPC, settle checksum). Not repeated after staging gate per restriction.

## Remaining live-testing limitations

| Item | Status |
|------|--------|
| Live Bike/Auto go-online with real staging captain wallet | Deferred — no fabricated captains/rides |
| Live matching + accept on staging traffic | Deferred — no fabricated trips |
| Live receipt email send | Deferred — founder inbox only; no fabricated ride |
| Physical host IST midnight | Deferred — do not change host clock |
| Wallet recharge end-to-end | Deferred — Phase 4.8; gated off until policy + Razorpay test credentials |

## Financial safety verdict

Staging STEP3 confirms zero negative wallets, zero incorrect UPI earnings, volatile paid-day helper, legacy accept routed through city path, permissions safe, receipt flag approved, and `settle_trip` hash unchanged. Staging Admin + Captain run the commit that matches installed STEP2 SQL in repo migrations.

## Phase 4.8 hand-off

Wallet recharge remains **disabled** (`wallet_topup_enabled` unset/false → API 402). Proposed top-up / reconciliation SQL is in repo `supabase/proposed/` only (not installed on staging). Continue Phase 4.8 locally until founder supplies Razorpay **test** credentials + wallet policy decisions.
