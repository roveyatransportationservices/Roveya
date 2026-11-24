-- Proposed. Staging only after founder preflight.
-- Database-level enforcement: unpaid / offline Captains cannot receive or accept new Bike/Auto offers.
-- Does not interrupt assigned/arrived/on_trip rides.
-- Does not replace settle_trip.
-- Rollback: restore prior accept_city_offer from 20261123193000_accept_city_offer.sql
--           and prior offer_next_captain from 20261021100000_mobile_platform.sql
--           drop function if exists public.captain_paid_active_day(uuid);

create or replace function public.captain_paid_active_day(p_captain uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_settings
    where key = 'active_day_' || p_captain::text || '_' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD')
  );
$$;

revoke all on function public.captain_paid_active_day(uuid) from public, anon, authenticated;
grant execute on function public.captain_paid_active_day(uuid) to service_role;

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
  -- Lock order: captains → presence → trips → offers (unchanged family).
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

  -- Authoritative IST day fee: unpaid Captains cannot accept new offers.
  if not public.captain_paid_active_day(p_captain) then
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

create or replace function public.offer_next_captain(p_trip uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips;
  v_captain uuid;
  v_km double precision;
  v_auto boolean;
  v_offer uuid;
  v_radius double precision := public.setting_num('match_radius_km', 6);
  v_ttl integer := public.setting_num('offer_ttl_seconds', 15)::int;
  v_day text := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
begin
  select * into v_trip from public.trips where id = p_trip for update;
  if not found or v_trip.status <> 'searching' then
    return null;
  end if;
  if exists (select 1 from public.trip_offers where trip_id = p_trip and status = 'offered' and expires_at > now()) then
    return null;
  end if;
  select p.captain_id, public.km_between(p.latitude, p.longitude, v_trip.pickup_lat, v_trip.pickup_lng), p.auto_accept
  into v_captain, v_km, v_auto
  from public.captain_presence p
  join public.captains c on c.user_id = p.captain_id and c.status = 'active'
  where p.online
    and p.vehicle = v_trip.vehicle
    and p.vehicle in ('bike', 'auto')
    and p.latitude is not null
    and p.updated_at > now() - interval '2 minutes'
    and p.captain_id <> v_trip.rider_id
    and public.km_between(p.latitude, p.longitude, v_trip.pickup_lat, v_trip.pickup_lng) <= v_radius
    and exists (
      select 1 from public.platform_settings s
      where s.key = 'active_day_' || p.captain_id::text || '_' || v_day
    )
    and not exists (select 1 from public.trip_offers o where o.trip_id = p_trip and o.captain_id = p.captain_id)
    and not exists (select 1 from public.trip_offers o where o.captain_id = p.captain_id and o.status = 'offered' and o.expires_at > now())
    and not exists (select 1 from public.trips t where t.captain_id = p.captain_id and t.status in ('assigned', 'arrived', 'on_trip'))
  order by public.km_between(p.latitude, p.longitude, v_trip.pickup_lat, v_trip.pickup_lng)
  limit 1;
  if v_captain is null then
    if v_trip.requested_at < now() - interval '3 minutes' then
      update public.trips set status = 'expired', updated_at = now() where id = p_trip;
    end if;
    return null;
  end if;
  insert into public.trip_offers (trip_id, captain_id, pickup_km, expires_at)
  values (p_trip, v_captain, round((v_km * 1.3)::numeric, 2), now() + make_interval(secs => v_ttl))
  returning id into v_offer;
  if v_auto then
    perform public.accept_city_offer(v_offer, v_captain);
  end if;
  return v_offer;
end;
$$;

revoke all on function public.accept_city_offer(uuid, uuid) from public, anon, authenticated;
revoke all on function public.offer_next_captain(uuid) from public, anon, authenticated;
grant execute on function public.accept_city_offer(uuid, uuid) to service_role;
grant execute on function public.offer_next_captain(uuid) to service_role;
