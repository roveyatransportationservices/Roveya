-- Proposed. Apply to staging only after isolated PostgreSQL validation.
-- Atomic prepaid daily fee + captain go-online for Bike/Auto.
-- Replaces non-atomic charge_active_day-then-upsert presence.
-- Does not interrupt on_trip rides. Continuous-online midnight rollover is not auto-charged here.
--
-- Dependencies: public.wallets, public.ledger_post, public.captains, public.captain_presence, public.platform_settings.
-- Rollback:
--   drop function if exists public.go_online_with_day_fee(uuid, double precision, double precision, double precision, boolean);
--   -- restore prior setDuty application path that called charge_active_day separately

create or replace function public.go_online_with_day_fee(
  p_captain uuid,
  p_lat double precision,
  p_lng double precision,
  p_heading double precision default 0,
  p_auto_accept boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_vehicle text;
  v_mode text;
  v_day text;
  v_key text;
  v_existing text;
  v_book text;
  v_rupees numeric;
  v_paise bigint := 0;
  v_balance bigint;
  v_online boolean;
  v_already boolean := false;
  v_now timestamptz := now();
begin
  -- Lock captain row first (same family as accept_city_offer).
  select status, vehicle into v_status, v_vehicle
  from public.captains
  where user_id = p_captain
  for update;
  if not found then
    raise exception 'captain_missing' using errcode = 'P0001';
  end if;
  if v_status is distinct from 'active' then
    raise exception 'captain_not_active' using errcode = 'P0001';
  end if;
  if v_vehicle not in ('bike', 'auto') then
    raise exception 'vehicle_not_supported' using errcode = 'P0001';
  end if;
  if p_lat is null or p_lng is null or p_lat < 6.5 or p_lat > 37.6 or p_lng < 68 or p_lng > 97.5 then
    raise exception 'location_required' using errcode = 'P0001';
  end if;

  select value into v_mode from public.platform_settings where key = 'ride_plan_mode';
  v_day := to_char(v_now at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
  v_key := 'active_day_' || p_captain::text || '_' || v_day;

  -- Wallet lock before fee marker to keep a stable order with other wallet writers.
  perform 1 from public.wallets where owner_id = p_captain for update;
  if not found then
    insert into public.wallets (owner_id, balance_paise) values (p_captain, 0)
    on conflict (owner_id) do nothing;
    perform 1 from public.wallets where owner_id = p_captain for update;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));
  select value into v_existing from public.platform_settings where key = v_key;
  if v_existing is not null then
    v_already := true;
  end if;

  select online into v_online from public.captain_presence where captain_id = p_captain for update;

  if not v_already and coalesce(v_mode, 'subscription') is distinct from 'commission' then
    select value into v_book from public.platform_settings where key = 'captain_day_' || p_captain::text;
    if v_book is null
       or (v_book::jsonb ->> 'monthVehicle') is distinct from v_vehicle
       or coalesce(v_book::jsonb ->> 'monthUntil', '') < v_day then
      select value::numeric into v_rupees
      from public.platform_settings
      where key = case when v_vehicle = 'bike' then 'ride_bike_day' else 'ride_auto_day' end;
      if v_rupees is null then
        v_rupees := case when v_vehicle = 'bike' then 10 else 12 end;
      end if;
      v_paise := round(v_rupees * 100);
    end if;
  end if;

  if v_paise > 0 then
    select balance_paise into v_balance from public.wallets where owner_id = p_captain;
    if coalesce(v_balance, 0) < v_paise then
      raise exception 'insufficient_wallet_balance:%:%:%', coalesce(v_balance, 0), v_paise, v_day
        using errcode = 'P0001';
    end if;
    insert into public.platform_settings (key, value, updated_at)
    values (
      v_key,
      jsonb_build_object(
        'transactionId', v_key,
        'day', v_day,
        'vehicle', v_vehicle,
        'amountPaise', v_paise,
        'status', 'charged'
      )::text,
      v_now
    );
    -- Prepaid: never allow_negative.
    perform public.ledger_post(
      p_captain,
      'adjustment',
      -v_paise,
      'admin_adjustment',
      v_key,
      'Active day fee · ' || v_vehicle || ' · ' || v_day,
      false
    );
    v_already := true;
  end if;

  insert into public.captain_presence as cp (
    captain_id, online, vehicle, latitude, longitude, heading, auto_accept, updated_at, online_since
  ) values (
    p_captain, true, v_vehicle, p_lat, p_lng, coalesce(p_heading, 0), coalesce(p_auto_accept, false), v_now, v_now
  )
  on conflict (captain_id) do update
  set online = true,
      vehicle = excluded.vehicle,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      heading = excluded.heading,
      auto_accept = excluded.auto_accept,
      updated_at = excluded.updated_at,
      online_since = case when coalesce(cp.online, false) then cp.online_since else excluded.online_since end;

  select balance_paise into v_balance from public.wallets where owner_id = p_captain;

  return jsonb_build_object(
    'ok', true,
    'day', v_day,
    'alreadyPaid', (v_paise = 0 and v_already),
    'dayCharge', case
      when v_paise > 0 then jsonb_build_object('transactionId', v_key, 'day', v_day, 'amountPaise', v_paise, 'status', 'charged')
      else null
    end,
    'balancePaise', coalesce(v_balance, 0),
    'feePaise', case when v_vehicle = 'bike' then 1000 else 1200 end,
    'feePaidToday', v_already or v_paise > 0
  );
end;
$$;

revoke all on function public.go_online_with_day_fee(uuid, double precision, double precision, double precision, boolean) from public, anon, authenticated;
grant execute on function public.go_online_with_day_fee(uuid, double precision, double precision, double precision, boolean) to service_role;
