-- Proposed only. Do not apply to staging or production until a separate approval.
-- One transaction inserts the India-day marker and posts the ledger line.
-- A failure rolls both back. This file does not edit ledger_post or the fee amounts.
-- Existing markers stay. A day that was marked by the old two-step path is returned and is not charged again.
-- Rollback: drop function public.charge_active_day(uuid, text); do not delete ledger lines or markers.

create or replace function public.charge_active_day(p_captain uuid, p_vehicle text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text;
  v_day text;
  v_key text;
  v_existing text;
  v_book text;
  v_rupees numeric;
  v_paise bigint;
begin
  if p_vehicle not in ('bike', 'auto') then
    return null;
  end if;
  select value into v_mode from public.platform_settings where key = 'ride_plan_mode';
  if v_mode = 'commission' then
    return null;
  end if;
  v_day := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
  select value into v_book from public.platform_settings where key = 'captain_day_' || p_captain::text;
  if v_book is not null
     and (v_book::jsonb ->> 'monthVehicle') = p_vehicle
     and coalesce(v_book::jsonb ->> 'monthUntil', '') >= v_day then
    return null;
  end if;
  v_key := 'active_day_' || p_captain::text || '_' || v_day;
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));
  select value into v_existing from public.platform_settings where key = v_key;
  if v_existing is not null then
    return v_existing::jsonb;
  end if;
  select value::numeric into v_rupees
  from public.platform_settings
  where key = case when p_vehicle = 'bike' then 'ride_bike_day' else 'ride_auto_day' end;
  if v_rupees is null then
    v_rupees := case when p_vehicle = 'bike' then 10 else 12 end;
  end if;
  v_paise := round(v_rupees * 100);
  if v_paise <= 0 then
    return null;
  end if;
  insert into public.platform_settings (key, value, updated_at)
  values (
    v_key,
    jsonb_build_object(
      'transactionId', v_key,
      'day', v_day,
      'vehicle', p_vehicle,
      'amountPaise', v_paise,
      'status', 'charged'
    )::text,
    now()
  );
  perform public.ledger_post(
    p_captain,
    'adjustment',
    -v_paise,
    'admin_adjustment',
    v_key,
    'Active day fee · ' || p_vehicle || ' · ' || v_day,
    true
  );
  return jsonb_build_object('transactionId', v_key, 'day', v_day, 'amountPaise', v_paise, 'status', 'charged');
end;
$$;

revoke all on function public.charge_active_day(uuid, text) from public, anon, authenticated;
grant execute on function public.charge_active_day(uuid, text) to service_role;
