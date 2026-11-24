-- Not applied. Staging project pqnfipleuztivnrsyvkd only.
-- Apply assignment_version_prepare.sql first, then deploy the admin, then apply this file.
-- This file is safe to apply after that prepare step. It does not call the network.

alter table public.trips
  add column if not exists assignment_version integer not null default 0;

create or replace function public.trips_assignment_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.captain_id is not null
     and new.captain_id is distinct from old.captain_id
     and new.status in ('assigned', 'arrived', 'on_trip') then
    new.assignment_version := old.assignment_version + 1;
  else
    new.assignment_version := old.assignment_version;
  end if;
  return new;
end;
$$;

revoke all on function public.trips_assignment_version() from public, anon, authenticated;

drop trigger if exists trips_assignment_version on public.trips;
create trigger trips_assignment_version
  before update on public.trips
  for each row execute function public.trips_assignment_version();

alter table public.communication_events
  add column if not exists user_id uuid,
  add column if not exists title text,
  add column if not exists body text;

create or replace function public.enqueue_notice(
  p_event_key text,
  p_kind text,
  p_channel text,
  p_audience text,
  p_user uuid,
  p_title text,
  p_body text,
  p_ref_type text,
  p_ref_id text,
  p_offer uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.communication_events (
    event_key, kind, channel, audience, ref_type, ref_id, status, attempts,
    user_id, title, body, offer_id
  ) values (
    p_event_key, p_kind, p_channel, p_audience, p_ref_type, p_ref_id, 'queued', 0,
    p_user, left(p_title, 120), left(p_body, 240), p_offer
  )
  on conflict (event_key) do nothing;
end;
$$;

revoke all on function public.enqueue_notice(text, text, text, text, uuid, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.enqueue_notice(text, text, text, text, uuid, text, text, text, text, uuid) to service_role;

create or replace function public.offers_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.trips;
begin
  if new.status is distinct from 'offered' then
    return new;
  end if;
  select * into v from public.trips where id = new.trip_id;
  if found then
    perform public.enqueue_notice(
      'captain:offer:' || new.id::text || ':created',
      'offer_created',
      'offers',
      'captain',
      new.captain_id,
      'New ride request',
      v.code || ' is waiting. Open the app to respond.',
      'trip',
      new.trip_id::text,
      new.id
    );
  end if;
  return new;
end;
$$;

create or replace function public.trips_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is not distinct from old.status and new.captain_id is not distinct from old.captain_id then
    return new;
  end if;
  if new.captain_id is not null
     and new.captain_id is distinct from old.captain_id
     and new.status = 'assigned' then
    if old.captain_id is null then
      perform public.enqueue_notice(
        'city:' || new.id::text || ':assigned:' || new.captain_id::text || ':v' || new.assignment_version::text,
        'captain_assigned', 'rides', 'rider', new.rider_id,
        'Captain assigned', new.code || ' has a captain.',
        'trip', new.id::text, null
      );
    else
      perform public.enqueue_notice(
        'city:' || new.id::text || ':captain-changed:' || new.captain_id::text || ':v' || new.assignment_version::text,
        'captain_assigned', 'rides', 'rider', new.rider_id,
        'New captain for ' || new.code, 'Open the app to track the ride.',
        'trip', new.id::text, null
      );
      perform public.enqueue_notice(
        'city:' || new.id::text || ':desk-assign:' || new.captain_id::text || ':v' || new.assignment_version::text,
        'captain_assigned', 'offers', 'captain', new.captain_id,
        'ROVEYA desk gave you ride ' || new.code, 'Pickup at ' || new.pickup_name || '. Open the app to start.',
        'trip', new.id::text, null
      );
      perform public.enqueue_notice(
        'city:' || new.id::text || ':desk-released:' || old.captain_id::text || ':v' || old.assignment_version::text,
        'ride_cancelled', 'offers', 'captain', old.captain_id,
        'Ride ' || new.code || ' moved to another captain', 'The ROVEYA desk reassigned it. Stay on duty for the next request.',
        'trip', new.id::text, null
      );
    end if;
  end if;
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status = 'searching' and old.status in ('assigned', 'arrived') and old.captain_id is not null and new.captain_id is null then
    perform public.enqueue_notice(
      'city:' || new.id::text || ':captain-released:' || old.captain_id::text || ':v' || old.assignment_version::text,
      'ride_cancelled', 'rides', 'rider', new.rider_id,
      'Looking for another captain', new.code || ' is being offered again.',
      'trip', new.id::text, null
    );
  end if;
  case new.status
    when 'arrived' then
      perform public.enqueue_notice(
        'city:' || new.id::text || ':arrived',
        'captain_arrived', 'rides', 'rider', new.rider_id,
        'Captain arrived', new.code || ' is at the pickup.',
        'trip', new.id::text, null
      );
    when 'on_trip' then
      perform public.enqueue_notice(
        'city:' || new.id::text || ':started',
        'ride_started', 'rides', 'rider', new.rider_id,
        'Ride started', new.code || ' is on the way.',
        'trip', new.id::text, null
      );
    when 'completed' then
      perform public.enqueue_notice(
        'city:' || new.id::text || ':completed',
        'ride_completed', 'rides', 'rider', new.rider_id,
        'Ride completed', new.code || ' is complete. The receipt is in the trip.',
        'trip', new.id::text, null
      );
    when 'expired' then
      perform public.enqueue_notice(
        'city:' || new.id::text || ':no-captain',
        'ride_cancelled', 'rides', 'rider', new.rider_id,
        'No captain was free', new.code || ' ended. Please book again.',
        'trip', new.id::text, null
      );
    when 'cancelled' then
      if new.cancelled_by = 'captain' then
        perform public.enqueue_notice(
          'city:' || new.id::text || ':captain-cancelled',
          'ride_cancelled', 'rides', 'rider', new.rider_id,
          'Your captain cancelled', 'Book again and we will find you another captain.',
          'trip', new.id::text, null
        );
      elsif new.cancelled_by = 'system' then
        perform public.enqueue_notice(
          'city:' || new.id::text || ':desk-cancelled',
          'ride_cancelled', 'rides', 'rider', new.rider_id,
          'Ride ' || new.code || ' was cancelled', coalesce(new.cancel_reason, 'The ROVEYA desk cancelled this ride.'),
          'trip', new.id::text, null
        );
      end if;
      if new.captain_id is not null and new.cancelled_by = 'system' then
        perform public.enqueue_notice(
          'city:' || new.id::text || ':desk-cancelled:' || new.captain_id::text,
          'ride_cancelled', 'offers', 'captain', new.captain_id,
          'Ride ' || new.code || ' was cancelled', 'Stay on duty for the next request.',
          'trip', new.id::text, null
        );
      elsif new.captain_id is not null and new.cancelled_by is distinct from 'captain' then
        perform public.enqueue_notice(
          'city:' || new.id::text || ':rider-cancelled:' || new.captain_id::text,
          'ride_cancelled', 'offers', 'captain', new.captain_id,
          'Ride ' || new.code || ' was cancelled', 'Stay on duty for the next request.',
          'trip', new.id::text, null
        );
      end if;
    else null;
  end case;
  return new;
end;
$$;

drop trigger if exists trips_push on public.trips;
create trigger trips_push
  after update of status, captain_id on public.trips
  for each row execute function public.trips_push();
