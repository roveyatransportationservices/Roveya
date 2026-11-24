-- =============================================================================
-- ROVEYA Phase 4.7 — FOUNDER STAGING FINANCIAL INSTALL PACK (final safety)
-- Project (must match): pqnfipleuztivnrsyvkd
-- URL: https://supabase.com/dashboard/project/pqnfipleuztivnrsyvkd/sql
-- DO NOT run on production. DO NOT reset the database. DO NOT change settle_trip.
-- receipt_email_approved is already true — not included.
-- =============================================================================
-- EXECUTION ORDER
-- 1. SECTION A — read-only preflight
-- 2. Paste and run, in order, the full contents of:
--      C:\Users\Dell\Desktop\roveya-staging-clean-v1\supabase\proposed\20261121240000_charge_active_day.sql
--      C:\Users\Dell\Desktop\roveya-staging-clean-v1\supabase\proposed\20261124180000_prepaid_go_online.sql
--      C:\Users\Dell\Desktop\roveya-staging-clean-v1\supabase\proposed\20261124210000_renew_online_day_fee.sql
--      C:\Users\Dell\Desktop\roveya-staging-clean-v1\supabase\proposed\20261124220000_city_day_fee_matching.sql
-- 3. SECTION C — post-install verification
-- 4. Notify engineering to redeploy Admin then Captain (commit after this pack).
--
-- APPLICATION / DATABASE ORDER
--   Apply this SQL first, then deploy Admin (fail-closed duty + renewal).
--   Never deploy fail-closed Admin before go_online_with_day_fee exists.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SECTION A — READ-ONLY PREFLIGHT
-- -----------------------------------------------------------------------------
select current_database() as db;

select proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in (
    'settle_trip','charge_active_day','go_online_with_day_fee','renew_online_day_fee',
    'accept_city_offer','offer_next_captain','ledger_post','captain_paid_active_day'
  )
order by 1, 2;

-- Confirm settle_trip still treats cash/upi without ride_earning for those modes
select pg_get_functiondef('public.settle_trip(uuid)'::regprocedure);

select key, value from public.platform_settings
where key in ('receipt_email_approved','ride_plan_mode','commission_pct','ride_commission_pct','ride_bike_day','ride_auto_day')
order by 1;

select
  count(*) filter (where w.balance_paise < 0) as negative_captain_wallets,
  coalesce(sum(w.balance_paise) filter (where w.balance_paise < 0), 0) as aggregate_negative_paise
from public.wallets w
join public.captains c on c.user_id = w.owner_id;

select count(*) as active_day_markers
from public.platform_settings
where key like 'active_day_%';

-- -----------------------------------------------------------------------------
-- SECTION B — INSTALL
-- Run the four absolute-path SQL files listed in EXECUTION ORDER above.
-- Each file is its own create-or-replace unit. Prefer one statement group per file.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- SECTION C — POST-INSTALL VERIFICATION
-- -----------------------------------------------------------------------------
select proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in (
    'charge_active_day','go_online_with_day_fee','renew_online_day_fee',
    'accept_city_offer','offer_next_captain','captain_paid_active_day'
  )
order by 1, 2;

select p.proname, r.rolname, has_function_privilege(r.oid, p.oid, 'EXECUTE') as can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join pg_roles r
where n.nspname = 'public'
  and p.proname in (
    'charge_active_day','go_online_with_day_fee','renew_online_day_fee',
    'accept_city_offer','offer_next_captain','captain_paid_active_day'
  )
  and r.rolname in ('anon','authenticated','service_role')
order by 1, 2;

-- Expect: service_role true; anon/authenticated false for the financial RPCs.
-- Expect go_online / renew / charge bodies contain allow_negative false and 1000/1200.
select
  (pg_get_functiondef('public.go_online_with_day_fee(uuid,double precision,double precision,double precision,boolean)'::regprocedure)
    like '%insufficient_wallet_balance%') as go_online_ok,
  (pg_get_functiondef('public.renew_online_day_fee(uuid,integer)'::regprocedure)
    like '%eligibleForNewRides'', false%') as renew_offline_ineligible,
  (pg_get_functiondef('public.accept_city_offer(uuid,uuid)'::regprocedure)
    like '%captain_paid_active_day%') as accept_fee_gated;

-- -----------------------------------------------------------------------------
-- SECTION D — SAFE ROLLBACK (only if needed)
-- Do NOT drop charge_active_day. Restore previous allow_negative=true body instead
-- (git show c56e474:supabase/proposed/20261121240000_charge_active_day.sql).
-- Then:
--   drop function if exists public.go_online_with_day_fee(uuid, double precision, double precision, double precision, boolean);
--   drop function if exists public.renew_online_day_fee(uuid, integer);
--   drop function if exists public.captain_paid_active_day(uuid);
-- Restore accept_city_offer from migrations/20261123193000_accept_city_offer.sql
-- Restore offer_next_captain from migrations/20261021100000_mobile_platform.sql
-- Application rollback: redeploy prior Admin that does not require go_online RPC
--   BEFORE dropping go_online_with_day_fee, or Captains cannot go online.
-- Never delete ledger_entries or active_day_* markers.
-- Do NOT restore non-atomic setDuty fallback.
-- -----------------------------------------------------------------------------
