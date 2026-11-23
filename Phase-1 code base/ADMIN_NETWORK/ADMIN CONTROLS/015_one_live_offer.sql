-- One live offer per trip, and one database transaction for acceptance.
-- Already applied on the live database. Do not run this file again.
-- The safety follow-up is 016_accept_safety.sql. Do not run 014 again.
-- This does not change payments, wallets, or settle_trip.
--
-- Rollback:
--   drop function if exists public.accept_city_offer(uuid, uuid);
--   drop index if exists public.trip_offers_one_live_trip;

delete from public.trip_offers older
using public.trip_offers newer
where older.status = 'offered'
  and newer.status = 'offered'
  and older.trip_id = newer.trip_id
  and older.id <> newer.id
  and (older.created_at < newer.created_at or (older.created_at = newer.created_at and older.id < newer.id));

create unique index if not exists trip_offers_one_live_trip
  on public.trip_offers (trip_id)
  where status = 'offered';

create or replace function public.accept_city_offer(p_offer uuid, p_captain uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip uuid;
begin
  select trip_id into v_trip
  from public.trip_offers
  where id = p_offer
    and captain_id = p_captain
    and status = 'offered'
    and expires_at > now()
  for update;
  if not found then
    return false;
  end if;

  perform 1 from public.trips
  where id = v_trip and status = 'searching' and captain_id is null
  for update;
  if not found then
    update public.trip_offers set status = 'withdrawn', decided_at = now()
    where id = p_offer and status = 'offered';
    return false;
  end if;

  if exists (
    select 1 from public.trips
    where captain_id = p_captain
      and id <> v_trip
      and status in ('assigned', 'arrived', 'on_trip')
  ) then
    update public.trip_offers set status = 'withdrawn', decided_at = now()
    where id = p_offer and status = 'offered';
    return false;
  end if;

  if not exists (
    select 1 from public.captain_presence
    where captain_id = p_captain
      and online
      and updated_at > now() - interval '120 seconds'
  ) then
    update public.trip_offers set status = 'withdrawn', decided_at = now()
    where id = p_offer and status = 'offered';
    return false;
  end if;

  update public.trips
  set captain_id = p_captain, status = 'assigned', assigned_at = now()
  where id = v_trip and status = 'searching' and captain_id is null;
  if not found then
    update public.trip_offers set status = 'withdrawn', decided_at = now()
    where id = p_offer and status = 'offered';
    return false;
  end if;

  update public.trip_offers
  set status = 'accepted', decided_at = now()
  where id = p_offer and status = 'offered';

  update public.trip_offers
  set status = 'withdrawn', decided_at = now()
  where trip_id = v_trip and id <> p_offer and status = 'offered';

  return true;
end;
$$;

revoke all on function public.accept_city_offer(uuid, uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.accept_city_offer(uuid, uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.accept_city_offer(uuid, uuid) from authenticated;
  end if;
end $$;
