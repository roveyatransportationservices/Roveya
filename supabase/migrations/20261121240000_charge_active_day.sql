-- Proposed. Staging only after founder preflight.
-- Prepaid India-day fee for Bike/Auto. Marker + ledger in one transaction.
-- Lock order (compatible with accept_city_offer / go_online / renew):
--   1) captains  2) wallets  3) advisory(day key)  4) marker + ledger_post
-- Successful payment = JSON status=charged (key alone is not payment).
-- Uncertain/pending/failed/malformed markers fail closed: do not delete, do not re-charge.
-- No monthly-plan exemption. Offline days are free (this RPC is only called when charging).
-- Rollback: keep this prepaid body (allow_negative=false). Do NOT restore negative-fee behavior.
-- Do not drop this required function. Do not delete ledger rows or active_day_* markers.

create or replace function public.active_day_marker_is_charged(p_value text)
returns boolean
language plpgsql
immutable
as $$
declare
  v_json jsonb;
  v_amt_text text;
  v_amt bigint;
begin
  if p_value is null or btrim(p_value) = '' then
    return false;
  end if;
  begin
    v_json := p_value::jsonb;
  exception
    when others then
      return false;
  end;
  if coalesce(v_json->>'status', '') is distinct from 'charged' then
    return false;
  end if;
  if v_json ? 'amountPaise' then
    v_amt_text := btrim(coalesce(v_json->>'amountPaise', ''));
    if v_amt_text = '' or v_amt_text !~ '^[0-9]+$' or length(v_amt_text) > 15 then
      return false;
    end if;
    begin
      v_amt := v_amt_text::bigint;
    exception
      when others then
        return false;
    end;
    if v_amt <= 0 then
      return false;
    end if;
  end if;
  return true;
end;
$$;

revoke all on function public.active_day_marker_is_charged(text) from public, anon, authenticated;
grant execute on function public.active_day_marker_is_charged(text) to service_role;

create or replace function public.charge_active_day(p_captain uuid, p_vehicle text)
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
  v_paise bigint;
begin
  if p_vehicle not in ('bike', 'auto') then
    return null;
  end if;

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
  if v_vehicle is distinct from p_vehicle or v_vehicle not in ('bike', 'auto') then
    raise exception 'vehicle_not_supported' using errcode = 'P0001';
  end if;

  perform 1 from public.wallets where owner_id = p_captain for update;
  if not found then
    insert into public.wallets (owner_id, owner_kind, balance_paise)
    values (p_captain, 'captain', 0)
    on conflict (owner_id) do nothing;
    perform 1 from public.wallets where owner_id = p_captain for update;
  end if;

  -- Wall-clock IST day AFTER locks (not transaction-start now()).
  v_day := to_char(clock_timestamp() at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
  v_key := 'active_day_' || p_captain::text || '_' || v_day;
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));

  select value into v_existing from public.platform_settings where key = v_key;
  if v_existing is not null then
    if public.active_day_marker_is_charged(v_existing) then
      return v_existing::jsonb;
    end if;
    -- Fail closed: uncertain marker must not be overwritten or re-charged.
    raise exception 'active_day_marker_invalid:%', v_key using errcode = 'P0001';
  end if;

  -- Founder-approved amounts: Bike ₹10 / Auto ₹12 (ignore legacy settings drift).
  v_paise := case when p_vehicle = 'bike' then 1000 else 1200 end;

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
    clock_timestamp()
  );
  -- Prepaid: never allow_negative.
  perform public.ledger_post(
    p_captain,
    'adjustment',
    -v_paise,
    'admin_adjustment',
    v_key,
    'Active day fee · ' || p_vehicle || ' · ' || v_day,
    false
  );
  return jsonb_build_object('transactionId', v_key, 'day', v_day, 'amountPaise', v_paise, 'status', 'charged');
end;
$$;

revoke all on function public.charge_active_day(uuid, text) from public, anon, authenticated;
grant execute on function public.charge_active_day(uuid, text) to service_role;
