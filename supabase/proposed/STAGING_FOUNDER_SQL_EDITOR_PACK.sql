-- =============================================================================
-- ROVEYA Phase 4.7 — FOUNDER STAGING SQL EDITOR PACK
-- Project (must match): pqnfipleuztivnrsyvkd
-- Dashboard: https://supabase.com/dashboard/project/pqnfipleuztivnrsyvkd/sql
-- DO NOT run on production. DO NOT reset the database.
-- =============================================================================
-- HOW TO USE
-- 1. Open the staging project SQL Editor (URL above).
-- 2. Confirm the project ref in the browser URL is pqnfipleuztivnrsyvkd.
-- 3. Run SECTION A (read-only inspect). Paste results back to engineering.
-- 4. Compare settle_trip body to 019 cash/upi handling.
-- 5. Run SECTION B only after engineering confirms apply order.
-- 6. Run SECTION C to enable authorized receipt emails.
-- 7. Re-run SECTION D verification.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SECTION A — READ-ONLY INSPECTION (safe)
-- -----------------------------------------------------------------------------
select current_database() as db, current_user as db_user;

select proname, pg_get_function_identity_arguments(p.oid) as args,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in (
    'settle_trip',
    'charge_active_day',
    'go_online_with_day_fee',
    'renew_online_day_fee',
    'consume_billing',
    'trips_emit',
    'ledger_post'
  )
order by proname, args;

select p.proname, r.rolname, has_function_privilege(r.oid, p.oid, 'EXECUTE') as can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join pg_roles r
where n.nspname = 'public'
  and p.proname in ('settle_trip', 'charge_active_day', 'go_online_with_day_fee', 'renew_online_day_fee', 'ledger_post')
  and r.rolname in ('anon', 'authenticated', 'service_role', 'postgres')
order by 1, 2;

select key, value, updated_at
from public.platform_settings
where key in ('receipt_email_approved', 'ride_plan_mode', 'ride_bike_day', 'ride_auto_day', 'commission_pct', 'ride_commission_pct')
order by key;

-- Negative captain wallets (aggregates only; no personal fields)
select
  count(*) filter (where w.balance_paise < 0) as negative_captain_wallets,
  coalesce(sum(w.balance_paise) filter (where w.balance_paise < 0), 0) as aggregate_negative_paise
from public.wallets w
join public.captains c on c.user_id = w.owner_id;

-- Potentially incorrect Direct UPI ride_earning credits (read-only list of ids + amounts)
select le.id, le.amount_paise, le.created_at, t.payment, t.status, t.code
from public.ledger_entries le
join public.trips t on t.id::text = le.ref_id
where le.kind = 'ride_earning'
  and le.ref_type = 'trip'
  and t.payment = 'upi'
order by le.created_at desc
limit 50;

-- -----------------------------------------------------------------------------
-- SECTION B — APPLY (run only after inspect confirms need)
-- Paste the reviewed bodies from:
--   supabase/proposed/20261124200000_settle_trip_direct_upi.sql   (ONLY if settle_trip is wrong)
--   supabase/proposed/20261121240000_charge_active_day.sql
--   supabase/proposed/20261124180000_prepaid_go_online.sql
--   supabase/proposed/20261124210000_renew_online_day_fee.sql
-- Apply charge_active_day + go_online + renew always for prepaid model.
-- Apply settle_trip only when SECTION A shows UPI still takes the ride_earning branch.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- SECTION C — RECEIPT EMAIL APPROVAL (staging only)
-- Authorized sandbox recipient is enforced in application code / Resend config:
--   roveyatransportationservices@gmail.com
-- -----------------------------------------------------------------------------
insert into public.platform_settings (key, value, updated_at)
values ('receipt_email_approved', 'true', now())
on conflict (key) do update set value = excluded.value, updated_at = now();

select key, value, updated_at from public.platform_settings where key = 'receipt_email_approved';

-- -----------------------------------------------------------------------------
-- SECTION D — POST-APPLY VERIFICATION
-- -----------------------------------------------------------------------------
select proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('go_online_with_day_fee', 'renew_online_day_fee', 'charge_active_day', 'settle_trip')
order by 1, 2;

-- Expect service_role EXECUTE = true; anon/authenticated = false for wallet RPCs.
select p.proname, r.rolname, has_function_privilege(r.oid, p.oid, 'EXECUTE') as can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join pg_roles r
where n.nspname = 'public'
  and p.proname in ('go_online_with_day_fee', 'renew_online_day_fee', 'charge_active_day', 'settle_trip')
  and r.rolname in ('anon', 'authenticated', 'service_role')
order by 1, 2;
