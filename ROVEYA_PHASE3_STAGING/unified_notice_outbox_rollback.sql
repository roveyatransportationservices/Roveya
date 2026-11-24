-- Not applied. Restores the trigger bodies saved before the outbox patch.
-- Run only on staging pqnfipleuztivnrsyvkd, and only to undo unified_notice_outbox.sql.
-- The notice columns stay. The triggers stay. This brings network delivery back inside the trigger.
-- After these two functions, drop the outbox helper:
-- drop function if exists public.enqueue_notice(text, text, text, text, uuid, text, text, text, text, uuid);

-- Saved 24 Nov 2026. Owner postgres. Security definer. Triggers trip_offers_push and trips_push stay enabled.
-- Grants at that time: anon, authenticated, and service_role could execute both trigger functions.

CREATE OR REPLACE FUNCTION public.offers_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v public.trips;
begin
  select * into v from public.trips where id = new.trip_id;
  if found then
    perform public.push_send(
      new.captain_id, 'captain', 'offer', 'New ride request · ' || public.rupee_text(v.fare_paise),
      v.pickup_name || ' to ' || v.drop_name || ' · ' || new.pickup_km || ' km away',
      jsonb_build_object('offerId', new.id, 'tripId', new.trip_id), 'offers',
      greatest(10, extract(epoch from new.expires_at - now())::int)
    );
  end if;
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.trips_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_name text;
  v_vehicle text;
  v_payable bigint := new.fare_paise - new.discount_paise;
  v_data jsonb := jsonb_build_object('tripId', new.id, 'code', new.code);
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.captain_id is not null then
    select split_part(name, ' ', 1), vehicle_model || ' · ' || vehicle_no into v_name, v_vehicle from public.captains where user_id = new.captain_id;
  end if;
  case new.status
    when 'assigned' then
      perform public.push_send(new.rider_id, 'rider', 'trip', coalesce(v_name, 'Your captain') || ' is on the way', coalesce(v_vehicle, 'Open the app to track your ride.'), v_data, 'rides');
    when 'arrived' then
      perform public.push_send(new.rider_id, 'rider', 'trip', 'Your captain has arrived', 'Meet ' || coalesce(v_name, 'your captain') || ' at the pickup and share your ride code.', v_data, 'rides');
    when 'on_trip' then
      perform public.push_send(new.rider_id, 'rider', 'trip', 'Ride started', 'Heading to ' || new.drop_name || '. Share your ride from the app.', v_data, 'rides');
    when 'completed' then
      perform public.push_send(new.rider_id, 'rider', 'trip', 'You have arrived', 'Fare ' || public.rupee_text(v_payable) || ' for ' || new.code || '. Rate your captain in the app.', v_data, 'rides');
    when 'expired' then
      perform public.push_send(new.rider_id, 'rider', 'trip', 'Captains are busy right now', 'Try booking again in a minute.', v_data, 'rides');
    when 'cancelled' then
      if new.cancelled_by = 'captain' then
        perform public.push_send(new.rider_id, 'rider', 'trip', 'Your captain cancelled', 'Book again and we will find you another captain.', v_data, 'rides');
      elsif new.cancelled_by = 'system' then
        perform public.push_send(new.rider_id, 'rider', 'trip', 'Ride ' || new.code || ' was cancelled', coalesce(new.cancel_reason, 'The ROVEYA desk cancelled this ride.'), v_data, 'rides');
      end if;
      if new.captain_id is not null and new.cancelled_by <> 'captain' then
        perform public.push_send(new.captain_id, 'captain', 'trip', 'Ride ' || new.code || ' was cancelled', 'Stay on duty for the next request.', v_data, 'offers');
      end if;
    else null;
  end case;
  return new;
end;
$function$

-- offers_push owner=postgres security_definer=t
-- trips_push owner=postgres security_definer=t
-- grant offers_push anon execute=t
-- grant offers_push authenticated execute=t
-- grant offers_push service_role execute=t
-- grant trips_push anon execute=t
-- grant trips_push authenticated execute=t
-- grant trips_push service_role execute=t
-- trigger trip_offers_push on trip_offers calls offers_push enabled=O
-- trigger trips_push on trips calls trips_push enabled=O

drop function if exists public.enqueue_notice(text, text, text, text, uuid, text, text, text, text, uuid);

drop trigger if exists trips_push on public.trips;
create trigger trips_push
  after update of status on public.trips
  for each row execute function public.trips_push();

-- assignment_version and trips_assignment_version stay. Existing version numbers are not reset.
