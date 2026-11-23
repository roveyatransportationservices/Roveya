-- Local-only least-privilege correction, tested on the disposable PostgreSQL 17 database.
-- Do not apply this file to development or production until a separate approval.
-- Anonymous and signed-in clients do not need to empty payout plans.
-- service_role keeps TRUNCATE. set_payout_plan does not use TRUNCATE.

revoke truncate on table public.payout_plans from public, anon, authenticated;
