-- Proposed. Staging only after founder preflight.
-- Database-level enforcement: unpaid Captains cannot receive or accept new Bike/Auto offers.
-- Requires active_day_marker_is_charged from 20261121240000_charge_active_day.sql (do not redefine here).
-- Compared to live staging (md5 accept_city_offer=0a8d3920..., offer_next=29c6effd...):
--   - Preserve radius/TTL/freshness/busy/prior-offer/expiry rules
--   - Lock order: captains -> presence -> trips -> offers
--   - Auto-accept and Bike/Auto legacy accept_offer route through accept_city_offer
--   - Long-pickup bonus applied exactly once after successful city accept
-- IST business day uses clock_timestamp(); captain_paid_active_day is VOLATILE.
-- Does not replace settle_trip (live md5 bc2d6d25...).
--
-- FAIL-CLOSED ROLLBACK:
-- 1) Keep charge_active_day prepaid (allow_negative=false). NEVER restore negative fees.
-- 2) NEVER restore non-atomic duty activation.
-- 3) NEVER delete ledger_entries or active_day_* markers.
-- 4) Do NOT restore pre-fee accept_offer / offer_next_captain alone — that would reopen
--    unpaid Captain assignment. If rolling back matching, keep accept_city_offer fee gate
--    and captain_paid_active_day, OR keep the fee-gated accept_offer wrapper.
-- 5) Do not change settle_trip or receipt_email_approved.

create or replace function public.captain_paid_active_day(p_captain uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_day text := to_char(clock_timestamp() at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
  v_key text := 'active_day_' || p_captain::text || '_' || v_day;
  v_value text;
begin
  select value into v_value from public.platform_settings where key = v_key;
  return public.active_day_marker_is_charged(v_value);
end;
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
  -- Lock order: captains -> presence -> trips -> offers.
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
    and expires_at > clock_timestamp();
  if not found then
    return false;
  end if;

  select online, updated_at, latitude
  into v_online, v_seen, v_lat
  from public.captain_presence
  where captain_id = p_captain
  for update;
  if not found or v_online is not true or v_lat is null or v_seen <= clock_timestamp() - interval '120 seconds' then
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
    and expires_at > clock_timestamp()
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

  -- Revalidate IST day payment after all locks, immediately before assignment.
  if not public.captain_paid_active_day(p_captain) then
    update public.trip_offers
    set status = 'withdrawn', decided_at = now()
    where id = p_offer and captain_id = p_captain and status = 'offered';
    return false;
  end if;

  begin
    update public.trips
    set captain_id = p_captain, status = 'assigned', assigned_at = clock_timestamp()
    where id = v_trip and status = 'searching' and captain_id is null;
    if not found then
      update public.trip_offers
      set status = 'withdrawn', decided_at = now()
      where id = p_offer and status = 'offered';
      return false;
    end if;

    update public.trip_offers
    set status = 'accepted', decided_at = clock_timestamp()
    where id = p_offer and status = 'offered';

    update public.trip_offers
    set status = 'withdrawn', decided_at = clock_timestamp()
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
  v_vehicle text;
  v_pickup_lat double precision;
  v_pickup_lng double precision;
  v_rider uuid;
  v_requested timestamptz;
  v_status text;
  v_captain uuid;
  v_km double precision;
  v_auto boolean;
  v_offer uuid;
  v_radius double precision := public.setting_num('match_radius_km', 6);
  v_ttl integer := public.setting_num('offer_ttl_seconds', 15)::int;
  v_cap_status text;
  v_online boolean;
  v_seen timestamptz;
  v_lat double precision;
  v_lng double precision;
  v_pres_vehicle text;
  v_accepted boolean;
  v_pickup_km numeric;
begin
  select status, vehicle, pickup_lat, pickup_lng, rider_id, requested_at
  into v_status, v_vehicle, v_pickup_lat, v_pickup_lng, v_rider, v_requested
  from public.trips
  where id = p_trip;
  if not found or v_status <> 'searching' then
    return null;
  end if;
  if exists (select 1 from public.trip_offers where trip_id = p_trip and status = 'offered' and expires_at > clock_timestamp()) then
    return null;
  end if;

  select p.captain_id, public.km_between(p.latitude, p.longitude, v_pickup_lat, v_pickup_lng), p.auto_accept
  into v_captain, v_km, v_auto
  from public.captain_presence p
  join public.captains c on c.user_id = p.captain_id and c.status = 'active'
  where p.online
    and p.vehicle = v_vehicle
    and p.vehicle in ('bike', 'auto')
    and p.latitude is not null
    and p.updated_at > clock_timestamp() - interval '2 minutes'
    and p.captain_id <> v_rider
    and public.km_between(p.latitude, p.longitude, v_pickup_lat, v_pickup_lng) <= v_radius
    and public.captain_paid_active_day(p.captain_id)
    and not exists (select 1 from public.trip_offers o where o.trip_id = p_trip and o.captain_id = p.captain_id)
    and not exists (select 1 from public.trip_offers o where o.captain_id = p.captain_id and o.status = 'offered' and o.expires_at > clock_timestamp())
    and not exists (select 1 from public.trips t where t.captain_id = p.captain_id and t.status in ('assigned', 'arrived', 'on_trip'))
  order by public.km_between(p.latitude, p.longitude, v_pickup_lat, v_pickup_lng)
  limit 1;

  if v_captain is null then
    if v_requested < clock_timestamp() - interval '3 minutes' then
      select status, requested_at into v_status, v_requested
      from public.trips
      where id = p_trip
      for update;
      if found
         and v_status = 'searching'
         and v_requested < clock_timestamp() - interval '3 minutes'
         and not exists (
           select 1 from public.trip_offers
           where trip_id = p_trip and status = 'offered' and expires_at > clock_timestamp()
         ) then
        update public.trips
        set status = 'expired', updated_at = clock_timestamp()
        where id = p_trip and status = 'searching';
      end if;
    end if;
    return null;
  end if;

  select status into v_cap_status
  from public.captains
  where user_id = v_captain
  for update;
  if not found or v_cap_status is distinct from 'active' then
    return null;
  end if;

  select online, updated_at, latitude, longitude, vehicle, auto_accept
  into v_online, v_seen, v_lat, v_lng, v_pres_vehicle, v_auto
  from public.captain_presence
  where captain_id = v_captain
  for update;
  if not found or v_online is not true or v_lat is null or v_lng is null
     or v_seen <= clock_timestamp() - interval '2 minutes' then
    return null;
  end if;

  select status, vehicle, pickup_lat, pickup_lng, rider_id
  into v_status, v_vehicle, v_pickup_lat, v_pickup_lng, v_rider
  from public.trips
  where id = p_trip
  for update;
  if not found or v_status <> 'searching' then
    return null;
  end if;

  if not public.captain_paid_active_day(v_captain) then
    return null;
  end if;
  if v_pres_vehicle is distinct from v_vehicle or v_pres_vehicle not in ('bike', 'auto') then
    return null;
  end if;
  if v_captain = v_rider then
    return null;
  end if;
  v_km := public.km_between(v_lat, v_lng, v_pickup_lat, v_pickup_lng);
  if v_km > v_radius then
    return null;
  end if;
  if exists (select 1 from public.trip_offers where trip_id = p_trip and status = 'offered' and expires_at > clock_timestamp()) then
    return null;
  end if;
  if exists (select 1 from public.trip_offers o where o.trip_id = p_trip and o.captain_id = v_captain) then
    return null;
  end if;
  if exists (select 1 from public.trip_offers o where o.captain_id = v_captain and o.status = 'offered' and o.expires_at > clock_timestamp()) then
    return null;
  end if;
  if exists (select 1 from public.trips t where t.captain_id = v_captain and t.status in ('assigned', 'arrived', 'on_trip')) then
    return null;
  end if;

  v_pickup_km := round((v_km * 1.3)::numeric, 2);
  begin
    insert into public.trip_offers (trip_id, captain_id, pickup_km, expires_at)
    values (p_trip, v_captain, v_pickup_km, clock_timestamp() + make_interval(secs => v_ttl))
    returning id into v_offer;
  exception
    when unique_violation then
      return null;
  end;

  if v_auto then
    -- Route through accept_offer so long-pickup bonus is applied exactly once in one place.
    begin
      perform public.accept_offer(v_offer, v_captain);
    exception
      when others then
        null; -- offer remains for manual accept / sweep; do not abort offer id return
    end;
  end if;
  return v_offer;
end;
$$;

-- Legacy contract: returns trips, raises offer_not_found / offer_closed / trip_taken / day_fee_unpaid.
-- Bike/Auto routes through accept_city_offer (same locks + fee/GPS/busy gates).
-- Long-pickup bonus applied exactly once here after successful city accept.
create or replace function public.accept_offer(p_offer uuid, p_captain uuid)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.trip_offers;
  v_trip public.trips;
  v_vehicle text;
  v_status text;
  v_online boolean;
  v_seen timestamptz;
  v_lat double precision;
  v_ok boolean;
  v_bonus integer;
begin
  select * into v_offer
  from public.trip_offers
  where id = p_offer and captain_id = p_captain;
  if not found then
    raise exception 'offer_not_found';
  end if;
  if v_offer.status <> 'offered' or v_offer.expires_at < now() - interval '2 seconds' then
    raise exception 'offer_closed';
  end if;

  select vehicle into v_vehicle from public.trips where id = v_offer.trip_id;
  if not found then
    raise exception 'trip_taken';
  end if;

  if v_vehicle in ('bike', 'auto') then
    if not public.captain_paid_active_day(p_captain) then
      raise exception 'day_fee_unpaid';
    end if;

    v_ok := public.accept_city_offer(p_offer, p_captain);
    if not v_ok then
      select * into v_offer from public.trip_offers where id = p_offer;
      if v_offer.id is null or v_offer.captain_id is distinct from p_captain then
        raise exception 'offer_not_found';
      end if;
      select * into v_trip from public.trips where id = v_offer.trip_id;
      if not found then
        raise exception 'trip_taken';
      end if;
      if v_trip.status is distinct from 'searching' or v_trip.captain_id is not null then
        raise exception 'trip_taken';
      end if;
      if v_offer.status <> 'offered' or v_offer.expires_at < now() - interval '2 seconds' then
        raise exception 'offer_closed';
      end if;
      if not public.captain_paid_active_day(p_captain) then
        raise exception 'day_fee_unpaid';
      end if;
      raise exception 'offer_closed';
    end if;

    select * into v_offer from public.trip_offers where id = p_offer;
    v_bonus := case
      when coalesce(v_offer.pickup_km, 0) > public.setting_num('long_pickup_km', 2.5)
        then public.setting_num('long_pickup_bonus_paise', 1500)::int
      else 0
    end;
    update public.trips
    set bonus_paise = bonus_paise + v_bonus,
        updated_at = now()
    where id = v_offer.trip_id
      and captain_id = p_captain
      and status = 'assigned'
    returning * into v_trip;
    if not found then
      raise exception 'trip_taken';
    end if;
    return v_trip;
  end if;

  -- Non Bike/Auto: unified lock order captains -> presence -> trips -> offers.
  select status into v_status
  from public.captains
  where user_id = p_captain
  for update;
  if not found or v_status is distinct from 'active' then
    raise exception 'offer_closed';
  end if;

  select online, updated_at, latitude
  into v_online, v_seen, v_lat
  from public.captain_presence
  where captain_id = p_captain
  for update;
  if not found or v_online is not true or v_lat is null or v_seen <= now() - interval '120 seconds' then
    raise exception 'offer_closed';
  end if;

  select * into v_trip
  from public.trips
  where id = v_offer.trip_id and status = 'searching' and captain_id is null
  for update;
  if not found then
    raise exception 'trip_taken';
  end if;

  select * into v_offer
  from public.trip_offers
  where id = p_offer
    and captain_id = p_captain
    and status = 'offered'
    and expires_at > now() - interval '2 seconds'
  for update;
  if not found then
    raise exception 'offer_closed';
  end if;

  perform 1
  from public.trips
  where captain_id = p_captain
    and id <> v_trip.id
    and status in ('assigned', 'arrived', 'on_trip')
  order by id
  for update;
  if found then
    raise exception 'offer_closed';
  end if;

  begin
    update public.trip_offers set status = 'accepted', decided_at = now() where id = p_offer and status = 'offered';
    if not found then
      raise exception 'offer_closed';
    end if;
    update public.trip_offers set status = 'withdrawn', decided_at = now()
    where trip_id = v_trip.id and id <> p_offer and status = 'offered';
    update public.trips
    set status = 'assigned',
        captain_id = p_captain,
        assigned_at = now(),
        bonus_paise = bonus_paise + case
          when v_offer.pickup_km > public.setting_num('long_pickup_km', 2.5)
            then public.setting_num('long_pickup_bonus_paise', 1500)::int
          else 0
        end,
        updated_at = now()
    where id = v_trip.id and status = 'searching' and captain_id is null
    returning * into v_trip;
    if not found then
      raise exception 'trip_taken';
    end if;
    return v_trip;
  exception
    when unique_violation then
      raise exception 'trip_taken';
  end;
end;
$$;

revoke all on function public.accept_city_offer(uuid, uuid) from public, anon, authenticated;
revoke all on function public.offer_next_captain(uuid) from public, anon, authenticated;
revoke all on function public.accept_offer(uuid, uuid) from public, anon, authenticated;
grant execute on function public.accept_city_offer(uuid, uuid) to service_role;
grant execute on function public.offer_next_captain(uuid) to service_role;
grant execute on function public.accept_offer(uuid, uuid) to service_role;
