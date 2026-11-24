-- Concurrent same-day fee: exactly one debit. Disposable local only.
\set ON_ERROR_STOP on

do $$
declare
  u uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  day text := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
begin
  delete from public.platform_settings where key = 'active_day_' || u::text || '_' || day;
  delete from public.ledger_entries where owner_id = u and ref_id = 'active_day_' || u::text || '_' || day;
  update public.captain_presence set online = false where captain_id = u;
  update public.wallets set balance_paise = 1000 where owner_id = u;
end;
$$;
