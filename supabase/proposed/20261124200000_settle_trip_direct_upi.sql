-- Proposed. Apply to staging only after confirming live settle_trip still credits UPI.
-- Matches ADMIN CONTROLS/019_upi_direct_settlement.sql (installed correctly on local p217).
-- cash + upi = captain-collected (commission line only when ride_plan_mode=commission)
-- online = gateway ride_earning credit
-- Idempotent via ledger existence check + ledger unique keys.
-- Does not change carpool seat settlement.
--
-- Rollback: restore prior settle_trip body from 20261021100000_mobile_platform.sql
-- or the previously installed definition captured via pg_get_functiondef.

begin;

create or replace function public.settle_trip(p_trip uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.trips;
  v_commission bigint;
  v_ref text;
  v_mode text;
begin
  select * into v from public.trips where id = p_trip;
  if not found or v.status <> 'completed' or v.captain_id is null then
    return;
  end if;
  v_ref := v.id::text;
  if exists (
    select 1 from public.ledger_entries
    where ref_type = 'trip' and ref_id = v_ref and kind in ('commission', 'ride_earning', 'ride_bonus')
  ) then
    return;
  end if;
  select coalesce(value, 'subscription') into v_mode from public.platform_settings where key = 'ride_plan_mode';
  if v.payment not in ('cash', 'upi', 'online') then
    raise exception 'payment_not_settled';
  end if;
  if v_mode is null or v_mode <> 'commission' then
    v_commission := 0;
  else
    v_commission := round(v.fare_paise * public.setting_num('ride_commission_pct', 0) / 100.0);
  end if;
  if v.payment = 'cash' or v.payment = 'upi' then
    if v_commission > 0 then
      perform public.ledger_post(v.captain_id, 'commission', -v_commission, 'trip', v_ref, 'Commission on a direct ride', true);
      perform public.ledger_post(public.platform_wallet(), 'commission', v_commission, 'trip', v_ref);
    end if;
  elsif v.payment = 'online' and v.fare_paise - v_commission > 0 then
    perform public.ledger_post(v.captain_id, 'ride_earning', v.fare_paise - v_commission, 'trip', v_ref, 'Online ride ' || v.code);
    perform public.ledger_post(public.platform_wallet(), 'ride_earning', -(v.fare_paise - v_commission), 'trip', v_ref, null, true);
  end if;
  if v.bonus_paise > 0 then
    perform public.ledger_post(v.captain_id, 'ride_bonus', v.bonus_paise, 'trip', v_ref, 'Ride bonus ' || v.code);
    perform public.ledger_post(public.platform_wallet(), 'ride_bonus', -v.bonus_paise, 'trip', v_ref, null, true);
  end if;
end;
$$;

revoke all on function public.settle_trip(uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.settle_trip(uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.settle_trip(uuid) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.settle_trip(uuid) to service_role;
  end if;
end $$;

commit;
