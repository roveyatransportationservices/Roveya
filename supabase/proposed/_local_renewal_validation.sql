-- Disposable local validation for renew_online_day_fee. Never run on staging/production.
\set ON_ERROR_STOP on
\ir 20261121240000_charge_active_day.sql
\ir 20261124180000_prepaid_go_online.sql
\ir 20261124210000_renew_online_day_fee.sql

create extension if not exists pgcrypto;

do $$
declare
  u_online uuid := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  u_off    uuid := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
  u_short  uuid := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
  u_ride   uuid := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc4';
  u_rider  uuid := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc5';
  u_susp   uuid := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc6';
  day text := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
  yday text := to_char((now() at time zone 'Asia/Kolkata')::date - 1, 'YYYY-MM-DD');
  r jsonb;
  bal bigint;
  markers int;
  online_flag boolean;
  trip_id uuid := 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
begin
  delete from public.trips where id = trip_id;
  delete from public.platform_settings where key like 'active_day_cccccccc-cccc-4ccc-8ccc-ccccccccccc%';
  delete from public.ledger_entries where owner_id in (u_online, u_off, u_short, u_ride, u_susp);
  delete from public.captain_presence where captain_id in (u_online, u_off, u_short, u_ride, u_susp);
  delete from public.captains where user_id in (u_online, u_off, u_short, u_ride, u_susp);
  delete from public.riders where user_id = u_rider;
  delete from public.wallets where owner_id in (u_online, u_off, u_short, u_ride, u_rider, u_susp);
  delete from auth.users where id in (u_online, u_off, u_short, u_ride, u_rider, u_susp);

  insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
  values
    (u_online, 'authenticated', 'authenticated', 'p47ren1@local.test', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, false, false),
    (u_off,    'authenticated', 'authenticated', 'p47ren2@local.test', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, false, false),
    (u_short,  'authenticated', 'authenticated', 'p47ren3@local.test', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, false, false),
    (u_ride,   'authenticated', 'authenticated', 'p47ren4@local.test', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, false, false),
    (u_rider,  'authenticated', 'authenticated', 'p47ren5@local.test', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, false, false),
    (u_susp,   'authenticated', 'authenticated', 'p47ren6@local.test', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, false, false);

  insert into public.riders (user_id, phone, name) values (u_rider, '9333333333', 'P47 Renew Rider');
  insert into public.captains (
    user_id, phone, name, dob, gender, city, vehicle, vehicle_no, vehicle_model, vehicle_color, vehicle_year,
    bank_holder, bank_last4, ifsc, emergency_name, emergency_phone, status, approved_at
  ) values
    (u_online, '9333333331', 'P47 On Cap', '1990-01-01', 'Male', 'Hyderabad', 'bike', 'TS09RN1001', 'Activa', 'Black', '2020', 'On', '1111', 'SBIN0001234', 'Em', '9333333341', 'active', now()),
    (u_off,    '9333333332', 'P47 Off Cap','1990-01-01', 'Male', 'Hyderabad', 'bike', 'TS09RN1002', 'Activa', 'Black', '2020', 'Off','2222', 'SBIN0001234', 'Em', '9333333342', 'active', now()),
    (u_short,  '9333333334', 'P47 Short',  '1990-01-01', 'Male', 'Hyderabad', 'auto', 'TS09RN1003', 'Auto', 'Yellow', '2019', 'Sh', '3333', 'SBIN0001234', 'Em', '9333333343', 'active', now()),
    (u_ride,   '9333333335', 'P47 Ride',   '1990-01-01', 'Male', 'Hyderabad', 'bike', 'TS09RN1004', 'Activa', 'Black', '2020', 'Rd', '4444', 'SBIN0001234', 'Em', '9333333344', 'active', now()),
    (u_susp,   '9333333336', 'P47 Susp',   '1990-01-01', 'Male', 'Hyderabad', 'bike', 'TS09RN1005', 'Activa', 'Black', '2020', 'Su', '5555', 'SBIN0001234', 'Em', '9333333345', 'suspended', null);

  insert into public.platform_settings (key, value, updated_at) values
    ('ride_bike_day', '10', now()),
    ('ride_auto_day', '12', now())
  on conflict (key) do update set value = excluded.value, updated_at = now();

  -- Offline captain: no fee
  update public.wallets set balance_paise = 5000 where owner_id = u_off;
  insert into public.captain_presence (captain_id, online, vehicle, latitude, longitude, updated_at)
  values (u_off, false, 'bike', 17.3, 78.4, now())
  on conflict (captain_id) do update set online = false, updated_at = now();
  r := public.renew_online_day_fee(u_off, 180);
  if coalesce((r->>'charged')::boolean, true) then raise exception 'offline_charged %', r; end if;
  select count(*) into markers from public.platform_settings where key = 'active_day_' || u_off || '_' || day;
  if markers <> 0 then raise exception 'offline_marker'; end if;

  -- Online bike with yesterday marker: renew ₹10 once
  update public.wallets set balance_paise = 10000 where owner_id = u_online;
  insert into public.platform_settings(key,value,updated_at) values ('active_day_'||u_online||'_'||yday, '{"status":"charged"}', now());
  insert into public.captain_presence (captain_id, online, vehicle, latitude, longitude, updated_at)
  values (u_online, true, 'bike', 17.3, 78.4, now())
  on conflict (captain_id) do update set online = true, latitude = 17.3, longitude = 78.4, updated_at = now();
  r := public.renew_online_day_fee(u_online, 180);
  if coalesce((r->>'charged')::boolean, false) is not true then raise exception 'online_not_charged %', r; end if;
  if (r->>'amountPaise')::int <> 1000 then raise exception 'online_amount %', r; end if;
  select balance_paise into bal from public.wallets where owner_id = u_online;
  if bal <> 9000 then raise exception 'online_balance %', bal; end if;
  r := public.renew_online_day_fee(u_online, 180);
  if coalesce((r->>'charged')::boolean, true) then raise exception 'duplicate_renew %', r; end if;
  select balance_paise into bal from public.wallets where owner_id = u_online;
  if bal <> 9000 then raise exception 'duplicate_balance %', bal; end if;

  -- Concurrent renew + go_online share uniqueness (already paid path)
  r := public.go_online_with_day_fee(u_online, 17.385, 78.4867, 0, false);
  if coalesce((r->>'ok')::boolean, false) is not true then raise exception 'go_online_after_renew %', r; end if;
  select balance_paise into bal from public.wallets where owner_id = u_online;
  if bal <> 9000 then raise exception 'go_online_extra_charge %', bal; end if;

  -- Insufficient auto: no deduction, goes offline when no ride
  update public.wallets set balance_paise = 500 where owner_id = u_short;
  insert into public.captain_presence (captain_id, online, vehicle, latitude, longitude, updated_at)
  values (u_short, true, 'auto', 17.3, 78.4, now())
  on conflict (captain_id) do update set online = true, vehicle = 'auto', updated_at = now();
  r := public.renew_online_day_fee(u_short, 180);
  if coalesce((r->>'ok')::boolean, true) then raise exception 'short_should_fail %', r; end if;
  if (r->>'reason') <> 'insufficient_wallet_balance' then raise exception 'short_reason %', r; end if;
  select balance_paise into bal from public.wallets where owner_id = u_short;
  if bal <> 500 then raise exception 'short_balance %', bal; end if;
  select online into online_flag from public.captain_presence where captain_id = u_short;
  if online_flag then raise exception 'short_still_online'; end if;
  select count(*) into markers from public.platform_settings where key = 'active_day_' || u_short || '_' || day;
  if markers <> 0 then raise exception 'short_marker'; end if;

  -- Insufficient with active ride: preserve ride presence, block eligibility
  update public.wallets set balance_paise = 0 where owner_id = u_ride;
  insert into public.captain_presence (captain_id, online, vehicle, latitude, longitude, updated_at)
  values (u_ride, true, 'bike', 17.3, 78.4, now())
  on conflict (captain_id) do update set online = true, updated_at = now();
  insert into public.trips (
    id, rider_id, captain_id, vehicle, pickup_name, pickup_lat, pickup_lng, drop_name, drop_lat, drop_lng,
    distance_km, eta_min, fare_paise, payment, payment_status, status, assigned_at
  ) values (
    trip_id, u_rider, u_ride, 'bike', 'A', 17.3, 78.4, 'B', 17.4, 78.5, 5, 12, 15000, 'cash', 'due', 'on_trip', now()
  );
  r := public.renew_online_day_fee(u_ride, 180);
  if coalesce((r->>'activeRidePreserved')::boolean, false) is not true then raise exception 'ride_not_preserved %', r; end if;
  if coalesce((r->>'eligibleForNewRides')::boolean, true) then raise exception 'ride_still_eligible %', r; end if;
  select online into online_flag from public.captain_presence where captain_id = u_ride;
  if online_flag is not true then raise exception 'ride_presence_cleared'; end if;
  select balance_paise into bal from public.wallets where owner_id = u_ride;
  if bal <> 0 then raise exception 'ride_neg_balance %', bal; end if;

  -- Stale presence: no charge, go offline
  update public.captain_presence set online = true, updated_at = now() - interval '10 minutes' where captain_id = u_online;
  delete from public.platform_settings where key = 'active_day_' || u_online || '_' || day;
  -- leave wallet at 9000 but force unpaid day again after deleting marker - wait, ledger already has fee for today from earlier; can't re-insert same ledger ref.
  -- Use u_off for stale after bringing online with old timestamp and funding
  update public.wallets set balance_paise = 5000 where owner_id = u_off;
  update public.captain_presence set online = true, updated_at = now() - interval '10 minutes' where captain_id = u_off;
  r := public.renew_online_day_fee(u_off, 180);
  if (r->>'reason') <> 'stale_presence' then raise exception 'stale_reason %', r; end if;
  if coalesce((r->>'charged')::boolean, true) then raise exception 'stale_charged'; end if;
  select online into online_flag from public.captain_presence where captain_id = u_off;
  if online_flag then raise exception 'stale_still_online'; end if;

  -- Suspended: not renewed
  update public.wallets set balance_paise = 5000 where owner_id = u_susp;
  insert into public.captain_presence (captain_id, online, vehicle, latitude, longitude, updated_at)
  values (u_susp, true, 'bike', 17.3, 78.4, now())
  on conflict (captain_id) do update set online = true, updated_at = now();
  r := public.renew_online_day_fee(u_susp, 180);
  if (r->>'reason') <> 'captain_not_active' then raise exception 'susp_reason %', r; end if;

  raise notice 'P47_RENEWAL_ASSERTIONS_PASSED day=%', day;
end;
$$;
