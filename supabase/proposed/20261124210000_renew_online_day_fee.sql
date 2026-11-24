-- Proposed. Staging only after founder preflight.
-- Automatic IST daily fee renewal for Captains who remain genuinely online.
-- Lock order:
--   1) captains  2) wallets  3) captain_presence  4) advisory(day key)  5) marker + ledger / presence updates
-- Offline Captains are never charged and are never eligible for new rides.
-- No monthly-plan exemption. Founder amounts: Bike 1000 / Auto 1200 paise.
-- Rollback: drop function public.renew_online_day_fee(uuid, integer); do not delete ledger/markers.

create or replace function public.renew_online_day_fee(
  p_captain uuid,
  p_stale_seconds integer default 180
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
  v_online boolean;
  v_updated timestamptz;
  v_already boolean := false;
  v_now timestamptz := now();
  v_stale_seconds integer := greatest(coalesce(p_stale_seconds, 180), 30);
  v_active_ride boolean := false;
  v_went_offline boolean := false;
begin
  select status, vehicle into v_status, v_vehicle
  from public.captains
  where user_id = p_captain
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'captain_missing', 'eligibleForNewRides', false);
  end if;
  if v_status is distinct from 'active' then
    return jsonb_build_object('ok', false, 'reason', 'captain_not_active', 'eligibleForNewRides', false);
  end if;
  if v_vehicle not in ('bike', 'auto') then
    return jsonb_build_object('ok', false, 'reason', 'vehicle_not_supported', 'eligibleForNewRides', false);
  end if;

  perform 1 from public.wallets where owner_id = p_captain for update;
  if not found then
    insert into public.wallets (owner_id, owner_kind, balance_paise)
    values (p_captain, 'captain', 0)
    on conflict (owner_id) do nothing;
    perform 1 from public.wallets where owner_id = p_captain for update;
  end if;

  select online, updated_at into v_online, v_updated
  from public.captain_presence
  where captain_id = p_captain
  for update;

  v_day := to_char(v_now at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
  v_key := 'active_day_' || p_captain::text || '_' || v_day;
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));

  select value into v_existing from public.platform_settings where key = v_key;
  if v_existing is not null then
    v_already := true;
  end if;

  if not coalesce(v_online, false) then
    select balance_paise into v_balance from public.wallets where owner_id = p_captain;
    return jsonb_build_object(
      'ok', true,
      'day', v_day,
      'alreadyPaid', v_already,
      'charged', false,
      'amountPaise', 0,
      'balancePaise', coalesce(v_balance, 0),
      'feePaise', case when v_vehicle = 'bike' then 1000 else 1200 end,
      'eligibleForNewRides', false,
      'wentOffline', false,
      'reason', 'offline'
    );
  end if;

  -- Stale abandoned sessions must not generate unjustified charges.
  -- Existing assigned/arrived/on_trip rides are preserved (presence stays online for GPS).
  if v_updated is null or v_updated < (v_now - make_interval(secs => v_stale_seconds)) then
    select exists (
      select 1 from public.trips
      where captain_id = p_captain
        and status in ('assigned', 'arrived', 'on_trip')
    ) into v_active_ride;
    if not v_active_ride then
      update public.captain_presence
      set online = false, updated_at = v_now
      where captain_id = p_captain;
      v_went_offline := true;
    end if;
    select balance_paise into v_balance from public.wallets where owner_id = p_captain;
    return jsonb_build_object(
      'ok', true,
      'day', v_day,
      'alreadyPaid', v_already,
      'charged', false,
      'amountPaise', 0,
      'balancePaise', coalesce(v_balance, 0),
      'feePaise', case when v_vehicle = 'bike' then 1000 else 1200 end,
      'eligibleForNewRides', false,
      'wentOffline', v_went_offline,
      'activeRidePreserved', v_active_ride,
      'reason', 'stale_presence'
    );
  end if;

  if v_already then
    select balance_paise into v_balance from public.wallets where owner_id = p_captain;
    return jsonb_build_object(
      'ok', true,
      'day', v_day,
      'alreadyPaid', true,
      'charged', false,
      'amountPaise', 0,
      'balancePaise', coalesce(v_balance, 0),
      'feePaise', case when v_vehicle = 'bike' then 1000 else 1200 end,
      'eligibleForNewRides', true,
      'wentOffline', false,
      'reason', 'already_paid'
    );
  end if;

  v_paise := case when v_vehicle = 'bike' then 1000 else 1200 end;
  select balance_paise into v_balance from public.wallets where owner_id = p_captain;
  if coalesce(v_balance, 0) < v_paise then
    select exists (
      select 1 from public.trips
      where captain_id = p_captain
        and status in ('assigned', 'arrived', 'on_trip')
    ) into v_active_ride;
    if not v_active_ride then
      update public.captain_presence
      set online = false, updated_at = v_now
      where captain_id = p_captain;
      v_went_offline := true;
    end if;
    return jsonb_build_object(
      'ok', false,
      'day', v_day,
      'alreadyPaid', false,
      'charged', false,
      'amountPaise', 0,
      'balancePaise', coalesce(v_balance, 0),
      'feePaise', v_paise,
      'requiredPaise', v_paise - coalesce(v_balance, 0),
      'eligibleForNewRides', false,
      'wentOffline', v_went_offline,
      'activeRidePreserved', v_active_ride,
      'reason', 'insufficient_wallet_balance'
    );
  end if;

  insert into public.platform_settings (key, value, updated_at)
  values (
    v_key,
    jsonb_build_object(
      'transactionId', v_key,
      'day', v_day,
      'vehicle', v_vehicle,
      'amountPaise', v_paise,
      'status', 'charged',
      'source', 'auto_renewal'
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
  select balance_paise into v_balance from public.wallets where owner_id = p_captain;

  return jsonb_build_object(
    'ok', true,
    'day', v_day,
    'alreadyPaid', false,
    'charged', true,
    'amountPaise', v_paise,
    'balancePaise', coalesce(v_balance, 0),
    'feePaise', v_paise,
    'eligibleForNewRides', true,
    'wentOffline', false,
    'reason', 'charged'
  );
end;
$$;

revoke all on function public.renew_online_day_fee(uuid, integer) from public, anon, authenticated;
grant execute on function public.renew_online_day_fee(uuid, integer) to service_role;
