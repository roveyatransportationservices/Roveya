-- The captain app calls accept_city_offer. The body is the approved candidate from
-- ADMIN CONTROLS/016_accept_safety.sql without the one-time duplicate-offer archive.
-- Execute stays with service_role. This file does not change fares or ledger rules.

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

  select trip_id into v_trip
  from public.trip_offers
  where id = p_offer
    and captain_id = p_captain
    and status = 'offered'
    and expires_at > now();
  if not found then
    return false;
  end if;

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

revoke all on function public.accept_city_offer(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cancel_city_ride(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.accept_city_offer(uuid, uuid) to service_role;
grant execute on function public.cancel_city_ride(uuid, uuid, text) to service_role;
