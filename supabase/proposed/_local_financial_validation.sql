-- Disposable local validation only. Never run against staging/production.
\set ON_ERROR_STOP on
\ir 20261121240000_charge_active_day.sql
\ir 20261124180000_prepaid_go_online.sql

create extension if not exists pgcrypto;

do $$
declare
  u_bike uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  u_auto uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  u_susp uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
  u_rev  uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
  u_rider uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5';
  r jsonb;
  bal bigint;
  day text := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
  markers int;
  ledger_n int;
  online_flag boolean;
  trip_cash uuid;
  trip_upi uuid;
  trip_on uuid;
  trip_cancel uuid;
  earn_n int;
begin
  delete from public.trips where id in (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'::uuid,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3'::uuid,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4'::uuid
  );
  delete from public.platform_settings where key like 'active_day_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa%';
  delete from public.ledger_entries where owner_id in (u_bike, u_auto, u_susp, u_rev, u_rider);
  delete from public.captain_presence where captain_id in (u_bike, u_auto, u_susp, u_rev);
  delete from public.captains where user_id in (u_bike, u_auto, u_susp, u_rev);
  delete from public.riders where user_id = u_rider;
  delete from public.wallets where owner_id in (u_bike, u_auto, u_susp, u_rev, u_rider);
  delete from auth.users where id in (u_bike, u_auto, u_susp, u_rev, u_rider);

  insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
  values
    (u_bike, 'authenticated', 'authenticated', 'p47bike@local.test', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, false, false),
    (u_auto, 'authenticated', 'authenticated', 'p47auto@local.test', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, false, false),
    (u_susp, 'authenticated', 'authenticated', 'p47susp@local.test', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, false, false),
    (u_rev,  'authenticated', 'authenticated', 'p47rev@local.test',  crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, false, false),
    (u_rider,'authenticated', 'authenticated', 'p47rider@local.test',crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, false, false);

  insert into public.riders (user_id, phone, name, created_at, updated_at)
  values (u_rider, '9222222222', 'P47 Rider', now(), now())
  on conflict (user_id) do nothing;

  insert into public.captains (
    user_id, phone, name, dob, gender, city, vehicle, vehicle_no, vehicle_model, vehicle_color, vehicle_year,
    bank_holder, bank_last4, ifsc, emergency_name, emergency_phone, status, approved_at
  ) values
    (u_bike, '9111111111', 'P47 Bike Cap', '1990-01-01', 'Male', 'Hyderabad', 'bike', 'TS09AB1001', 'Activa', 'Black', '2020', 'P47 Bike', '1111', 'SBIN0001234', 'Em', '9111111112', 'active', now()),
    (u_auto, '9111111113', 'P47 Auto Cap', '1990-01-01', 'Male', 'Hyderabad', 'auto', 'TS09AB1002', 'Auto', 'Yellow', '2019', 'P47 Auto', '2222', 'SBIN0001234', 'Em', '9111111114', 'active', now()),
    (u_susp, '9111111115', 'P47 Susp Cap', '1990-01-01', 'Male', 'Hyderabad', 'bike', 'TS09AB1003', 'Activa', 'Black', '2020', 'P47 Susp', '3333', 'SBIN0001234', 'Em', '9111111116', 'suspended', null),
    (u_rev,  '9111111117', 'P47 Rev Cap',  '1990-01-01', 'Male', 'Hyderabad', 'bike', 'TS09AB1004', 'Activa', 'Black', '2020', 'P47 Rev',  '4444', 'SBIN0001234', 'Em', '9111111118', 'review', null);

  insert into public.platform_settings (key, value, updated_at) values
    ('ride_bike_day', '10', now()),
    ('ride_auto_day', '12', now())
  on conflict (key) do update set value = excluded.value, updated_at = now();

  update public.wallets set balance_paise = 1000 where owner_id = u_bike;
  update public.wallets set balance_paise = 1200 where owner_id = u_auto;

  r := public.go_online_with_day_fee(u_bike, 17.385, 78.4867, 0, false);
  if coalesce((r->>'ok')::boolean, false) is not true then raise exception 'bike_10_fail:%', r; end if;
  select balance_paise into bal from public.wallets where owner_id = u_bike;
  if bal <> 0 then raise exception 'bike_balance_expected_0 got %', bal; end if;
  select online into online_flag from public.captain_presence where captain_id = u_bike;
  if online_flag is not true then raise exception 'bike_not_online'; end if;

  update public.captain_presence set online = false where captain_id = u_bike;
  r := public.go_online_with_day_fee(u_bike, 17.385, 78.4867, 0, false);
  if coalesce((r->>'ok')::boolean, false) is not true then raise exception 'same_day_fail:%', r; end if;
  select balance_paise into bal from public.wallets where owner_id = u_bike;
  if bal <> 0 then raise exception 'same_day_balance_changed %', bal; end if;
  select count(*) into markers from public.platform_settings where key = 'active_day_' || u_bike::text || '_' || day;
  if markers <> 1 then raise exception 'same_day_marker_count %', markers; end if;
  select count(*) into ledger_n from public.ledger_entries where owner_id = u_bike and ref_id = 'active_day_' || u_bike::text || '_' || day;
  if ledger_n <> 1 then raise exception 'same_day_ledger_count %', ledger_n; end if;

  update public.captain_presence set online = false where captain_id = u_bike;
  delete from public.platform_settings where key = 'active_day_' || u_bike::text || '_' || day;
  delete from public.ledger_entries where owner_id = u_bike and ref_id = 'active_day_' || u_bike::text || '_' || day;
  update public.wallets set balance_paise = 900 where owner_id = u_bike;
  begin
    r := public.go_online_with_day_fee(u_bike, 17.385, 78.4867, 0, false);
    raise exception 'bike_9_should_fail got %', r;
  exception when others then
    if sqlerrm not like 'insufficient_wallet_balance%' and sqlerrm not like 'insufficient_balance%' then
      raise exception 'bike_9_unexpected:%', sqlerrm;
    end if;
  end;
  select coalesce(online, false) into online_flag from public.captain_presence where captain_id = u_bike;
  if online_flag then raise exception 'bike_9_went_online'; end if;
  select count(*) into markers from public.platform_settings where key = 'active_day_' || u_bike::text || '_' || day;
  if markers <> 0 then raise exception 'bike_9_marker_created'; end if;
  select balance_paise into bal from public.wallets where owner_id = u_bike;
  if bal <> 900 then raise exception 'bike_9_balance_changed %', bal; end if;

  r := public.go_online_with_day_fee(u_auto, 17.385, 78.4867, 0, false);
  if coalesce((r->>'ok')::boolean, false) is not true then raise exception 'auto_12_fail:%', r; end if;
  select balance_paise into bal from public.wallets where owner_id = u_auto;
  if bal <> 0 then raise exception 'auto_balance_expected_0 got %', bal; end if;

  update public.captain_presence set online = false where captain_id = u_auto;
  delete from public.platform_settings where key = 'active_day_' || u_auto::text || '_' || day;
  delete from public.ledger_entries where owner_id = u_auto and ref_id = 'active_day_' || u_auto::text || '_' || day;
  update public.wallets set balance_paise = 1100 where owner_id = u_auto;
  begin
    r := public.go_online_with_day_fee(u_auto, 17.385, 78.4867, 0, false);
    raise exception 'auto_11_should_fail got %', r;
  exception when others then
    if sqlerrm not like 'insufficient_wallet_balance%' and sqlerrm not like 'insufficient_balance%' then
      raise exception 'auto_11_unexpected:%', sqlerrm;
    end if;
  end;

  update public.wallets set balance_paise = 0 where owner_id = u_bike;
  begin
    r := public.go_online_with_day_fee(u_bike, 17.385, 78.4867, 0, false);
    raise exception 'zero_unpaid_should_fail';
  exception when others then
    if sqlerrm not like 'insufficient_wallet_balance%' and sqlerrm not like 'insufficient_balance%' then
      raise exception 'zero_unpaid_unexpected:%', sqlerrm;
    end if;
  end;

  update public.wallets set balance_paise = 5000 where owner_id = u_susp;
  begin
    perform public.go_online_with_day_fee(u_susp, 17.385, 78.4867, 0, false);
    raise exception 'suspended_should_fail';
  exception when others then
    if sqlerrm not like 'captain_not_active%' then raise exception 'suspended_unexpected:%', sqlerrm; end if;
  end;
  begin
    perform public.go_online_with_day_fee(u_rev, 17.385, 78.4867, 0, false);
    raise exception 'review_should_fail';
  exception when others then
    if sqlerrm not like 'captain_not_active%' then raise exception 'review_unexpected:%', sqlerrm; end if;
  end;

  -- Settlement assertions against installed local settle_trip (cash/upi correct body)
  trip_cash := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'::uuid;
  trip_upi  := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid;
  trip_on   := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3'::uuid;
  trip_cancel := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4'::uuid;

  insert into public.trips (
    id, rider_id, captain_id, vehicle, pickup_name, pickup_lat, pickup_lng, drop_name, drop_lat, drop_lng,
    distance_km, eta_min, fare_paise, bonus_paise, payment, payment_status, status, completed_at
  ) values
    (trip_cash, u_rider, u_bike, 'bike', 'A', 17.3, 78.4, 'B', 17.4, 78.5, 5, 12, 15000, 0, 'cash', 'due', 'completed', now()),
    (trip_upi,  u_rider, u_bike, 'bike', 'A', 17.3, 78.4, 'B', 17.4, 78.5, 5, 12, 15000, 0, 'upi',  'due', 'completed', now()),
    (trip_on,   u_rider, u_bike, 'bike', 'A', 17.3, 78.4, 'B', 17.4, 78.5, 5, 12, 15000, 0, 'online','paid','completed', now()),
    (trip_cancel,u_rider,u_bike,'bike','A',17.3,78.4,'B',17.4,78.5,5,12,15000,0,'cash','due','cancelled', now());

  perform public.settle_trip(trip_cash);
  perform public.settle_trip(trip_upi);
  perform public.settle_trip(trip_cancel);
  select count(*) into earn_n from public.ledger_entries
    where kind = 'ride_earning' and ref_id in (trip_cash::text, trip_upi::text, trip_cancel::text);
  if earn_n <> 0 then raise exception 'cash_upi_cancel_should_not_credit got %', earn_n; end if;

  perform public.settle_trip(trip_on);
  select count(*) into earn_n from public.ledger_entries
    where owner_id = u_bike and kind = 'ride_earning' and ref_id = trip_on::text;
  if earn_n <> 1 then raise exception 'online_should_credit got %', earn_n; end if;
  perform public.settle_trip(trip_on);
  select count(*) into earn_n from public.ledger_entries
    where owner_id = u_bike and kind = 'ride_earning' and ref_id = trip_on::text;
  if earn_n <> 1 then raise exception 'duplicate_settle_credited %', earn_n; end if;

  raise notice 'P47_FINANCIAL_CORE_ASSERTIONS_PASSED day=%', day;
end;
$$;
