-- Durable booking idempotency. Safe to run once on the development project.
-- Adds two nullable columns and one partial unique index. Does not update or delete rows.
-- Existing trips keep a null request key. Wallets, payments, and offers are untouched.
--
-- Rollback:
--   drop index if exists public.trips_one_request_key;
--   alter table public.trips drop column if exists request_fingerprint;
--   alter table public.trips drop column if exists request_key;

begin;

alter table public.trips add column if not exists request_key text;
alter table public.trips add column if not exists request_fingerprint text;

create unique index if not exists trips_one_request_key
  on public.trips (request_key)
  where request_key is not null;

notify pgrst, 'reload schema';

commit;
