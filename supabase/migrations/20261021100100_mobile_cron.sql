-- Runs the matching sweep and the event consumers every minute.
-- Enable pg_cron first: Supabase dashboard > Database > Extensions > pg_cron.
-- The API also runs these after every write, so the schedule is a safety net.

create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'roveya-consumers';

select cron.schedule(
  'roveya-consumers',
  '* * * * *',
  $$
    select public.sweep_offers();
    select public.consume_billing(1000);
    select public.consume_analytics(1000);
  $$
);
