\set ON_ERROR_STOP on
do $$
declare
  u uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  today text := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
  yday text := to_char((now() at time zone 'Asia/Kolkata')::date - 1, 'YYYY-MM-DD');
  r jsonb;
  bal bigint;
begin
  delete from public.platform_settings where key like 'active_day_' || u::text || '_%';
  delete from public.ledger_entries where owner_id = u and ref_type = 'admin_adjustment' and ref_id like 'active_day_%';
  insert into public.platform_settings(key,value,updated_at)
  values ('active_day_'||u||'_'||yday, '{"status":"charged"}', now());
  update public.wallets set balance_paise = 1000 where owner_id = u;
  update public.captain_presence set online = false where captain_id = u;
  r := public.go_online_with_day_fee(u, 17.385, 78.4867, 0, false);
  if (r->>'day') is distinct from today then raise exception 'day_mismatch %', r; end if;
  if r->'dayCharge' is null then raise exception 'yday_marker_waived_today %', r; end if;
  select balance_paise into bal from public.wallets where owner_id = u;
  if bal <> 0 then raise exception 'ist_rollover_balance %', bal; end if;
  raise notice 'P47_IST_ROLLOVER_PASSED';
end;
$$;
