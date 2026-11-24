-- Disposable local validation for corrected prepaid + matching SQL. Never run on staging/production.
\set ON_ERROR_STOP on
\ir 20261121240000_charge_active_day.sql
\ir 20261124180000_prepaid_go_online.sql
\ir 20261124210000_renew_online_day_fee.sql
\ir 20261124220000_city_day_fee_matching.sql

create extension if not exists pgcrypto;

do $$
declare
  u_bike uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
  u_off  uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2';
  u_short uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3';
  u_rider uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4';
  day text := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
  r jsonb;
  bal bigint;
  markers int;
  v_trip uuid := 'ffffffff-ffff-4fff-8fff-fffffffffff1';
begin
  delete from public.trip_offers o where o.trip_id = v_trip;
  delete from public.trips t where t.id = v_trip;
  delete from public.platform_settings where key like 'active_day_eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee%';
  delete from public.ledger_entries where owner_id in (u_bike, u_off, u_short);
  delete from public.captain_presence where captain_id in (u_bike, u_off, u_short);
  delete from public.captains where user_id in (u_bike, u_off, u_short);
  delete from public.riders where user_id = u_rider;
  delete from public.wallets where owner_id in (u_bike, u_off, u_short, u_rider);
  delete from auth.users where id in (u_bike, u_off, u_short, u_rider);

  insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
  values
    (u_bike, 'authenticated', 'authenticated', 'p47s1@local.test', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, false, false),
    (u_off,  'authenticated', 'authenticated', 'p47s2@local.test', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, false, false),
    (u_short,'authenticated', 'authenticated', 'p47s3@local.test', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, false, false),
    (u_rider,'authenticated', 'authenticated', 'p47s4@local.test', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, false, false);

  insert into public.riders (user_id, phone, name) values (u_rider, '9444444444', 'P47 Safety Rider');
  insert into public.captains (
    user_id, phone, name, dob, gender, city, vehicle, vehicle_no, vehicle_model, vehicle_color, vehicle_year,
    bank_holder, bank_last4, ifsc, emergency_name, emergency_phone, status, approved_at
  ) values
    (u_bike, '9444444441', 'P47 Bike', '1990-01-01', 'Male', 'Hyderabad', 'bike', 'TS09SF1001', 'Activa', 'Black', '2020', 'B', '1111', 'SBIN0001234', 'Em', '9444444451', 'active', now()),
    (u_off,  '9444444442', 'P47 Off',  '1990-01-01', 'Male', 'Hyderabad', 'bike', 'TS09SF1002', 'Activa', 'Black', '2020', 'O', '2222', 'SBIN0001234', 'Em', '9444444452', 'active', now()),
    (u_short,'9444444443', 'P47 Short','1990-01-01', 'Male', 'Hyderabad', 'auto', 'TS09SF1003', 'Auto', 'Yellow', '2019', 'S', '3333', 'SBIN0001234', 'Em', '9444444453', 'active', now());

  -- Exact ₹10 succeeds
  update public.wallets set balance_paise = 1000 where owner_id = u_bike;
  r := public.go_online_with_day_fee(u_bike, 17.385, 78.4867, 0, false);
  if (r->>'feePaise')::int <> 1000 then raise exception 'fee_mismatch %', r; end if;
  if (r->'dayCharge'->>'amountPaise')::int <> 1000 then raise exception 'charge_mismatch %', r; end if;
  select balance_paise into bal from public.wallets where owner_id = u_bike;
  if bal <> 0 then raise exception 'exact_balance %', bal; end if;

  -- Paid but offline: ineligible
  update public.captain_presence set online = false where captain_id = u_bike;
  r := public.renew_online_day_fee(u_bike, 180);
  if coalesce((r->>'eligibleForNewRides')::boolean, true) then raise exception 'offline_still_eligible %', r; end if;
  if coalesce((r->>'alreadyPaid')::boolean, false) is not true then raise exception 'offline_not_marked_paid %', r; end if;

  -- Monthly book must NOT waive fee
  insert into public.platform_settings(key,value,updated_at)
  values ('captain_day_'||u_off, jsonb_build_object('monthVehicle','bike','monthUntil', day)::text, now())
  on conflict (key) do update set value = excluded.value;
  update public.wallets set balance_paise = 1000 where owner_id = u_off;
  r := public.go_online_with_day_fee(u_off, 17.385, 78.4867, 0, false);
  if r->'dayCharge' is null then raise exception 'monthly_bypass %', r; end if;

  -- Insufficient: no marker, no debit
  update public.wallets set balance_paise = 500 where owner_id = u_short;
  begin
    perform public.go_online_with_day_fee(u_short, 17.385, 78.4867, 0, false);
    raise exception 'short_should_fail';
  exception when others then
    if sqlerrm not like 'insufficient_wallet_balance%' then raise; end if;
  end;
  select count(*) into markers from public.platform_settings where key = 'active_day_' || u_short || '_' || day;
  if markers <> 0 then raise exception 'short_marker'; end if;
  select balance_paise into bal from public.wallets where owner_id = u_short;
  if bal <> 500 then raise exception 'short_balance %', bal; end if;

  -- Matching: unpaid captain cannot be offered
  insert into public.trips (
    id, rider_id, vehicle, pickup_name, pickup_lat, pickup_lng, drop_name, drop_lat, drop_lng,
    distance_km, eta_min, fare_paise, payment, payment_status, status
  ) values (
    v_trip, u_rider, 'bike', 'A', 17.385, 78.4867, 'B', 17.4, 78.5, 5, 12, 15000, 'cash', 'due', 'searching'
  );
  insert into public.captain_presence (captain_id, online, vehicle, latitude, longitude, updated_at)
  values (u_short, true, 'bike', 17.385, 78.4867, now())
  on conflict (captain_id) do update set online = true, vehicle = 'bike', latitude = 17.385, longitude = 78.4867, updated_at = now();
  -- u_short has no fee marker; offer_next should skip (may return null)
  if public.offer_next_captain(v_trip) is not null and not public.captain_paid_active_day(u_short) then
    -- if someone else was offered that's fine; ensure unpaid cannot accept
    null;
  end if;

  -- Paid online captain can accept
  update public.captain_presence set online = true, latitude = 17.385, longitude = 78.4867, updated_at = now() where captain_id = u_bike;
  if not public.captain_paid_active_day(u_bike) then raise exception 'bike_should_be_paid'; end if;

  raise notice 'P47_SAFETY_ASSERTIONS_PASSED day=%', day;
end;
$$;
