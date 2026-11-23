-- Local reconstruction from the approved read-only catalog inspections.
-- Columns, defaults, primary key, checks, foreign key, and function bodies are recovered.
-- Security metadata recovered for these two objects: RLS on and not forced, one SELECT policy,
-- explicit table grants, no triggers, no extra indexes, no sequence, and plan_period_end EXECUTE grants.
-- The table owner on development is postgres. A database created by postgres gets that owner.
-- MAINTAIN is present in the development ACL and exists only on PostgreSQL 17 or newer.

create or replace function public.plan_period_end(p_cycle text, p_start timestamp with time zone)
returns timestamp with time zone
language sql
immutable
as $function$
  select (
    date_trunc('day', p_start at time zone 'Asia/Kolkata')
    + case p_cycle when 'daily' then interval '1 day' when 'monthly' then interval '1 month' else interval '7 days' end
  ) at time zone 'Asia/Kolkata';
$function$;

create table public.payout_plans (
  captain_id uuid not null,
  cycle text not null default 'weekly',
  pending_cycle text,
  period_start timestamp with time zone not null default now(),
  period_end timestamp with time zone not null,
  updated_at timestamp with time zone not null default now(),
  constraint payout_plans_pkey primary key (captain_id),
  constraint payout_plans_captain_id_fkey foreign key (captain_id) references public.captains (user_id) on delete cascade,
  constraint payout_plans_cycle_check check (cycle = any (array['daily'::text, 'weekly'::text, 'monthly'::text])),
  constraint payout_plans_pending_cycle_check check (pending_cycle is null or pending_cycle = any (array['daily'::text, 'weekly'::text, 'monthly'::text]))
);

create or replace function public.set_payout_plan(p_captain uuid, p_cycle text)
returns public.payout_plans
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v public.payout_plans;
begin
  if p_cycle not in ('daily', 'weekly', 'monthly') then
    raise exception 'plan_invalid';
  end if;
  select * into v from public.payout_plans where captain_id = p_captain for update;
  if not found then
    insert into public.payout_plans (captain_id, cycle, period_start, period_end)
    values (p_captain, p_cycle, now(), public.plan_period_end(p_cycle, now()))
    returning * into v;
    return v;
  end if;
  update public.payout_plans
  set pending_cycle = case when p_cycle = cycle then null else p_cycle end, updated_at = now()
  where captain_id = p_captain
  returning * into v;
  return v;
end;
$function$;

revoke all on function public.set_payout_plan(uuid, text) from public, anon, authenticated;
grant execute on function public.set_payout_plan(uuid, text) to service_role;

-- Explicit development ACL. PUBLIC has no table privilege. The postgres entries in that ACL are the owner privileges.
revoke all on table public.payout_plans from public;
grant select, insert, update, delete, truncate, references, trigger on table public.payout_plans to anon, authenticated, service_role;

do $$
begin
  if current_setting('server_version_num')::integer >= 170000 then
    execute 'grant maintain on table public.payout_plans to anon, authenticated, service_role';
  end if;
end $$;

alter table public.payout_plans enable row level security;

create policy payout_plans_self on public.payout_plans
  for select to authenticated
  using ((captain_id = auth.uid()) or public.is_staff());

grant execute on function public.plan_period_end(text, timestamptz) to public, anon, authenticated, service_role;
