-- Shared API rate limit. Safe to run once. Does not read or change riders, captains, trips, or wallets.
-- Rollback:
--   drop function if exists public.take_api_slot(text, integer, integer);
--   drop table if exists public.api_rate_buckets;

begin;

create table if not exists public.api_rate_buckets (
  bucket text primary key,
  hits integer not null,
  window_start timestamptz not null
);

alter table public.api_rate_buckets enable row level security;
revoke all on table public.api_rate_buckets from public;

create or replace function public.take_api_slot(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hits integer;
begin
  if p_bucket is null or length(p_bucket) < 8 or length(p_bucket) > 80 then
    return false;
  end if;
  if p_limit < 1 or p_limit > 1000 or p_window_seconds < 1 or p_window_seconds > 86400 then
    return false;
  end if;
  insert into public.api_rate_buckets as b (bucket, hits, window_start)
  values (p_bucket, 1, clock_timestamp())
  on conflict (bucket) do update
  set
    hits = case
      when b.window_start <= clock_timestamp() - make_interval(secs => p_window_seconds) then 1
      else b.hits + 1
    end,
    window_start = case
      when b.window_start <= clock_timestamp() - make_interval(secs => p_window_seconds) then clock_timestamp()
      else b.window_start
    end
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;

revoke all on function public.take_api_slot(text, integer, integer) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.api_rate_buckets from anon;
    revoke all on function public.take_api_slot(text, integer, integer) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table public.api_rate_buckets from authenticated;
    revoke all on function public.take_api_slot(text, integer, integer) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.take_api_slot(text, integer, integer) to service_role;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
