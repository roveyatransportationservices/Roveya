-- Proposed. Apply to staging only after isolated PostgreSQL validation.
-- Automatic IST daily fee renewal for Captains who remain genuinely online.
-- Founder-approved: renew at Asia/Kolkata day boundary without interrupting existing rides.
--
-- Dependencies: wallets, ledger_post, captains, captain_presence, trips, platform_settings.
-- Rollback:
--   drop function if exists public.renew_online_day_fee(uuid, integer);

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
  v_mode text;
  v_day text;
  v_key text;
  v_existing text;
  v_book text;
  v_rupees numeric;
  v_paise bigint := 0;
  v_balance bigint;
  v_online boolean;
  v_updated timestamptz;
  v_already boolean := false;
  v_now timestamptz := now();
  v_stale_seconds integer := greatest(coalesce(p_stale_seconds, 180), 30);
  v_active_ride boolean := false;
  v_went_offline boolean := false;
  v_eligible boolean := false;
  v_charged boolean := false;
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

  select value into v_mode from public.platform_settings where key = 'ride_plan_mode';
  v_day := to_char(v_now at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
  v_key := 'active_day_' || p_captain::text || '_' || v_day;

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
    v_eligible := true;
  end if;

  select online, updated_at into v_online, v_updated
  from public.captain_presence
  where captain_id = p_captain
  for update;

  if not coalesce(v_online, false) then
    select balance_paise into v_balance from public.wallets where owner_id = p_captain;
    return jsonb_build_object(
      'ok', true,
      'day', v_day,
      'alreadyPaid', v_already,
      'charged', false,
      'amountPaise', 0,
      'balancePaise', coalesce(v_balance, 0),
      'eligibleForNewRides', v_already,
      'wentOffline', false,
      'reason', 'offline'
    );
  end if;

  -- Stale abandoned sessions must not generate unjustified charges.
  if v_updated is null or v_updated < (v_now - make_interval(secs => v_stale_seconds)) then
    update public.captain_presence
    set online = false, updated_at = v_now
    where captain_id = p_captain;
    select balance_paise into v_balance from public.wallets where owner_id = p_captain;
    return jsonb_build_object(
      'ok', true,
      'day', v_day,
      'alreadyPaid', v_already,
      'charged', false,
      'amountPaise', 0,
      'balancePaise', coalesce(v_balance, 0),
      'eligibleForNewRides', false,
      'wentOffline', true,
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
      'eligibleForNewRides', true,
      'wentOffline', false,
      'reason', 'already_paid'
    );
  end if;

  if coalesce(v_mode, 'subscription') is distinct from 'commission' then
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

  if v_paise <= 0 then
    v_eligible := true;
    select balance_paise into v_balance from public.wallets where owner_id = p_captain;
    return jsonb_build_object(
      'ok', true,
      'day', v_day,
      'alreadyPaid', false,
      'charged', false,
      'amountPaise', 0,
      'balancePaise', coalesce(v_balance, 0),
      'eligibleForNewRides', true,
      'wentOffline', false,
      'reason', 'no_fee'
    );
  end if;

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
  v_charged := true;
  select balance_paise into v_balance from public.wallets where owner_id = p_captain;

  return jsonb_build_object(
    'ok', true,
    'day', v_day,
    'alreadyPaid', false,
    'charged', true,
    'amountPaise', v_paise,
    'balancePaise', coalesce(v_balance, 0),
    'eligibleForNewRides', true,
    'wentOffline', false,
    'reason', 'charged'
  );
end;
$$;

revoke all on function public.renew_online_day_fee(uuid, integer) from public, anon, authenticated;
grant execute on function public.renew_online_day_fee(uuid, integer) to service_role;
