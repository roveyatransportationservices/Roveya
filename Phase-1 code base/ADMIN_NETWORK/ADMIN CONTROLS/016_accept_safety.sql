-- Safety follow-up to 015. Do not run 015 again. Do not run this until you approve it.
-- It does not change wallets, payments, or settle_trip.
-- It does not delete trip or offer rows. Older duplicate live offers are copied
-- into trip_offer_archive and then marked withdrawn, so they can be restored.
--
-- Rollback:
--   drop function if exists public.cancel_city_ride(uuid, uuid, text);
--   -- Then re-apply only the function body from 015 if you must return to that version.
--   -- drop table public.trip_offer_archive;  -- this discards the audit copy

begin;

create table if not exists public.trip_offer_archive (
  offer_id uuid primary key,
  trip_id uuid not null,
  captain_id uuid not null,
  previous_status text not null,
  created_at timestamptz,
  expires_at timestamptz,
  archived_at timestamptz not null default now(),
  reason text not null
);

with doomed as (
  select older.id
  from public.trip_offers older
  join public.trip_offers newer
    on newer.trip_id = older.trip_id
   and newer.status = 'offered'
   and older.status = 'offered'
   and older.id <> newer.id
   and (older.created_at < newer.created_at
        or (older.created_at = newer.created_at and older.id < newer.id))
),
copied as (
  insert into public.trip_offer_archive (offer_id, trip_id, captain_id, previous_status, created_at, expires_at, reason)
  select offer.id, offer.trip_id, offer.captain_id, offer.status, offer.created_at, offer.expires_at, 'duplicate_live_offer'
  from public.trip_offers offer
  where offer.id in (select id from doomed)
  on conflict (offer_id) do nothing
  returning offer_id
)
update public.trip_offers offer
set status = 'withdrawn', decided_at = now()
where offer.id in (select offer_id from copied);

create or replace function public.accept_city_offer(p_offer uuid, p_captain uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip uuid;
  v_status text;
  v_online boolean;
  v_seen timestamptz;
  v_lat double precision;
begin
  -- Same captain: this row lock runs first, so two accepts for one captain cannot deadlock.
  select status into v_status
  from public.captains
  where user_id = p_captain
  for update;
  if not found or v_status is distinct from 'active' then
    update public.trip_offers
    set status = 'withdrawn', decided_at = now()
    where id = p_offer and captain_id = p_captain and status = 'offered';
    return false;
  end if;

  -- Read the trip id, then lock the trip before the offer.
  -- Cancel locks the trip and then the offer. The same order avoids a deadlock.
  select trip_id into v_trip
  from public.trip_offers
  where id = p_offer
    and captain_id = p_captain
    and status = 'offered'
    and expires_at > now();
  if not found then
    return false;
  end if;

  -- Presence before the trip, so a duty change and an accept do not lock in opposite orders.
  select online, updated_at, latitude
  into v_online, v_seen, v_lat
  from public.captain_presence
  where captain_id = p_captain
  for update;
  if not found or v_online is not true or v_lat is null or v_seen <= now() - interval '120 seconds' then
    update public.trip_offers
    set status = 'withdrawn', decided_at = now()
    where id = p_offer and captain_id = p_captain and status = 'offered';
    return false;
  end if;

  perform 1
  from public.trips
  where id = v_trip and status = 'searching' and captain_id is null
  for update;
  if not found then
    update public.trip_offers
    set status = 'withdrawn', decided_at = now()
    where id = p_offer and captain_id = p_captain and status = 'offered';
    return false;
  end if;

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

  -- Lock this captain's other open rides in id order before writing the assignment.
  perform 1
  from public.trips
  where captain_id = p_captain
    and id <> v_trip
    and status in ('assigned', 'arrived', 'on_trip')
  order by id
  for update;
  if found then
    update public.trip_offers
    set status = 'withdrawn', decided_at = now()
    where id = p_offer and status = 'offered';
    return false;
  end if;

  begin
    update public.trips
    set captain_id = p_captain, status = 'assigned', assigned_at = now()
    where id = v_trip and status = 'searching' and captain_id is null;
    if not found then
      update public.trip_offers
      set status = 'withdrawn', decided_at = now()
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
  exception
    when unique_violation then
      update public.trip_offers
      set status = 'withdrawn', decided_at = now()
      where id = p_offer and status = 'offered';
      return false;
  end;
end;
$$;

create or replace function public.cancel_city_ride(p_trip uuid, p_rider uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Lock only the trip. Accept locks the captain, then presence, then the trip.
  perform 1
  from public.trips
  where id = p_trip
    and rider_id = p_rider
    and status in ('searching', 'assigned', 'arrived')
  for update;
  if not found then
    return false;
  end if;

  update public.trips
  set status = 'cancelled',
      cancelled_by = 'rider',
      cancel_reason = left(coalesce(p_reason, ''), 160),
      cancelled_at = now()
  where id = p_trip
    and rider_id = p_rider
    and status in ('searching', 'assigned', 'arrived');
  if not found then
    return false;
  end if;

  update public.trip_offers
  set status = 'withdrawn', decided_at = now()
  where trip_id = p_trip and status = 'offered';

  return true;
end;
$$;

revoke all on function public.accept_city_offer(uuid, uuid) from public;
revoke all on function public.cancel_city_ride(uuid, uuid, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.accept_city_offer(uuid, uuid) from anon;
    revoke all on function public.cancel_city_ride(uuid, uuid, text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.accept_city_offer(uuid, uuid) from authenticated;
    revoke all on function public.cancel_city_ride(uuid, uuid, text) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.accept_city_offer(uuid, uuid) to service_role;
    grant execute on function public.cancel_city_ride(uuid, uuid, text) to service_role;
  end if;
end $$;

commit;
