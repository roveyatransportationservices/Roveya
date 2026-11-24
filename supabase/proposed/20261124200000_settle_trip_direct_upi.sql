-- Proposed only. Do not apply to staging or production until founder approval.
-- Aligns settle_trip with the approved city model:
--   cash and direct UPI = paid to the captain (commission line only; commission_pct 0 => no wallet move)
--   online = gateway-processed fare may credit captain wallet
-- Idempotent via ledger_entries unique (owner_id, kind, ref_type, ref_id).
--
-- Impact: stops incorrect ride_earning credits for payment='upi' city rides.
-- Does not change carpool seat settlement.
--
-- Rollback: restore the previous settle_trip body from 20261021100000_mobile_platform.sql
-- (or 20261021120000_operations.sql if that is the live version).

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
begin
  select * into v from public.trips where id = p_trip;
  if not found or v.status <> 'completed' or v.captain_id is null then
    return;
  end if;
  v_ref := v.id::text;
  v_commission := round(v.fare_paise * public.setting_num('commission_pct', 0) / 100.0);
  if v.payment in ('cash', 'upi') then
    perform public.ledger_post(v.captain_id, 'commission', -v_commission, 'trip', v_ref, 'Commission on a captain-collected ride', true);
    perform public.ledger_post(public.platform_wallet(), 'commission', v_commission, 'trip', v_ref);
  else
    perform public.ledger_post(v.captain_id, 'ride_earning', v.fare_paise - v_commission, 'trip', v_ref, 'Online ride ' || v.code);
    perform public.ledger_post(public.platform_wallet(), 'ride_earning', -(v.fare_paise - v_commission), 'trip', v_ref, null, true);
  end if;
  if v.bonus_paise > 0 then
    perform public.ledger_post(v.captain_id, 'ride_bonus', v.bonus_paise, 'trip', v_ref, 'Ride bonus ' || v.code);
    perform public.ledger_post(public.platform_wallet(), 'ride_bonus', -v.bonus_paise, 'trip', v_ref, null, true);
  end if;
end;
$$;

revoke execute on function public.settle_trip(uuid) from public, anon, authenticated;
grant execute on function public.settle_trip(uuid) to service_role;
