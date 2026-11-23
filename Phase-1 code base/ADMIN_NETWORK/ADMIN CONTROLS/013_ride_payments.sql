-- Allow the three ride payments the apps send. Run once in the Supabase SQL editor.
alter table public.trips drop constraint if exists trips_payment_check;
alter table public.trips add constraint trips_payment_check check (payment in ('cash', 'upi', 'online'));
