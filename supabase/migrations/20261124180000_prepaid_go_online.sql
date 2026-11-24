-- Proposed. Staging only after founder preflight.
-- Atomic prepaid daily fee + captain go-online for Bike/Auto.
-- Lock order:
--   1) captains  2) wallets  3) captain_presence  4) advisory(day key)  5) marker + ledger  6) presence upsert
-- Compatible with accept_city_offer (captains -> presence -> trips -> offers).
-- IST day uses clock_timestamp() AFTER locks. Successful payment = status=charged only.
-- No monthly-plan exemption. Founder amounts: Bike 1000 / Auto 1200 paise.
-- Rollback: drop function public.go_online_with_day_fee(...); keep charge_active_day; do not delete ledger/markers.
-- Application must remain fail-closed if this RPC is missing (no non-atomic fallback).

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
  v_day text;
  v_key text;
  v_existing text;
  v_paise bigint := 0;
  v_balance bigint;
  v_already boolean := false;
  v_now timestamptz;
begin
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

  perform 1 from public.wallets where owner_id = p_captain for update;
  if not found then
    insert into public.wallets (owner_id, owner_kind, balance_paise)
    values (p_captain, 'captain', 0)
    on conflict (owner_id) do nothing;
    perform 1 from public.wallets where owner_id = p_captain for update;
  end if;

  perform 1 from public.captain_presence where captain_id = p_captain for update;

  -- Wall-clock AFTER locks so a pre-midnight txn cannot stamp yesterday after waiting.
  v_now := clock_timestamp();
  v_day := to_char(v_now at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
  v_key := 'active_day_' || p_captain::text || '_' || v_day;
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));

  select value into v_existing from public.platform_settings where key = v_key;
  if v_existing is not null then
    if public.active_day_marker_is_charged(v_existing) then
      v_already := true;
    else
      raise exception 'active_day_marker_invalid:%', v_key using errcode = 'P0001';
    end if;
  else
    v_paise := case when v_vehicle = 'bike' then 1000 else 1200 end;
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
    'feePaidToday', v_already
  );
end;
$$;

revoke all on function public.go_online_with_day_fee(uuid, double precision, double precision, double precision, boolean) from public, anon, authenticated;
grant execute on function public.go_online_with_day_fee(uuid, double precision, double precision, double precision, boolean) to service_role;
