-- ROVEYA ADMIN CONTROLS
-- Everything the ADMIN_NETWORK dashboard owns lives in its own schema,
-- admin_controls, in the same Supabase project as the apps. The apps' tables in
-- public are read and changed through the dashboard's server, never directly.
--
-- Run once in the Supabase SQL editor, after the seat marketplace and safety
-- migrations. Then add admin_controls to Project Settings > Data API >
-- Exposed schemas so the dashboard's server (service role) can reach it.

do $$
begin
  if to_regclass('public.seat_bookings') is null then
    raise exception 'Run supabase/migrations/20261028120000_seat_marketplace.sql first, then this file.';
  end if;
end;
$$;

create extension if not exists pgcrypto;
create schema if not exists admin_controls;

-- ---------------------------------------------------------------------------
-- Admin accounts and sessions
-- ---------------------------------------------------------------------------

create table if not exists admin_controls.admins (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  role text not null default 'viewer' check (role in ('super_admin', 'finance', 'operations', 'support', 'viewer')),
  password_hash text not null,
  active boolean not null default true,
  must_change_password boolean not null default false,
  failed_logins integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_by uuid references admin_controls.admins (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists admin_controls.sessions (
  token_hash text primary key check (char_length(token_hash) = 64),
  admin_id uuid not null references admin_controls.admins (id) on delete cascade,
  expires_at timestamptz not null,
  user_agent text,
  ip text,
  created_at timestamptz not null default now()
);

create index if not exists sessions_admin on admin_controls.sessions (admin_id);
create index if not exists sessions_expiry on admin_controls.sessions (expires_at);

-- Every change made from the dashboard, with who made it.
create table if not exists admin_controls.audit_log (
  id bigserial primary key,
  admin_id uuid references admin_controls.admins (id) on delete set null,
  admin_email text,
  action text not null,
  entity text not null,
  entity_id text,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);

create index if not exists audit_log_recent on admin_controls.audit_log (at desc);
create index if not exists audit_log_entity on admin_controls.audit_log (entity, entity_id);

create or replace function admin_controls.touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists admins_touch on admin_controls.admins;
create trigger admins_touch before update on admin_controls.admins for each row execute function admin_controls.touch();

-- ---------------------------------------------------------------------------
-- Finance views (read only)
-- ---------------------------------------------------------------------------

-- One row per seat booking with the money split worked out.
-- Commission uses the live seat_commission_pct; completed trips match the ledger.
create or replace view admin_controls.seat_booking_facts as
select
  b.id,
  b.pnr,
  b.status,
  b.trip_id,
  t.code as trip_code,
  t.from_city,
  t.to_city,
  t.depart_at,
  t.captain_id,
  b.rider_id,
  b.phone,
  cardinality(b.seat_ids) as seats,
  b.seat_ids,
  b.paid_with,
  b.coupon_id,
  b.created_at,
  b.confirmed_at,
  b.cancelled_at,
  b.cancelled_by,
  (coalesce(b.confirmed_at, b.created_at) at time zone 'Asia/Kolkata')::date as day,
  b.fare_paise,
  b.gst_paise,
  b.secure_paise,
  b.discount_paise,
  b.cash_paise,
  b.total_paise,
  (b.total_paise + b.cash_paise) as paid_paise,
  coalesce(b.refund_paise, 0) as refund_paise,
  case when b.status in ('confirmed', 'completed')
    then round(b.fare_paise * public.setting_num('seat_commission_pct', 10) / 100.0)::bigint else 0 end as commission_paise,
  case when b.status in ('confirmed', 'completed')
    then (b.fare_paise - round(b.fare_paise * public.setting_num('seat_commission_pct', 10) / 100.0))::bigint else 0 end as captain_share_paise,
  case when b.status = 'cancelled' and b.confirmed_at is not null
    then greatest(0, b.total_paise + b.cash_paise - coalesce(b.refund_paise, 0))::bigint else 0 end as kept_on_cancel_paise,
  case
    when b.status in ('confirmed', 'completed')
      then (round(b.fare_paise * public.setting_num('seat_commission_pct', 10) / 100.0) + b.secure_paise - b.discount_paise)::bigint
    when b.status = 'cancelled' and b.confirmed_at is not null
      then greatest(0, b.total_paise + b.cash_paise - coalesce(b.refund_paise, 0))::bigint
    else 0
  end as profit_paise
from public.seat_bookings b
join public.seat_trips t on t.id = b.trip_id;

-- Money per IST day, for the dashboard charts.
create or replace view admin_controls.daily_finance as
select
  day,
  count(*) filter (where status in ('confirmed', 'completed')) as bookings,
  coalesce(sum(seats) filter (where status in ('confirmed', 'completed')), 0) as seats,
  count(*) filter (where status = 'cancelled' and confirmed_at is not null) as cancellations,
  coalesce(sum(paid_paise) filter (where confirmed_at is not null), 0) as collected_paise,
  coalesce(sum(fare_paise) filter (where status in ('confirmed', 'completed')), 0) as fare_paise,
  coalesce(sum(gst_paise) filter (where status in ('confirmed', 'completed')), 0) as gst_paise,
  coalesce(sum(secure_paise) filter (where status in ('confirmed', 'completed')), 0) as secure_paise,
  coalesce(sum(discount_paise) filter (where status in ('confirmed', 'completed')), 0) as discount_paise,
  coalesce(sum(refund_paise), 0) as refund_paise,
  coalesce(sum(commission_paise), 0) as commission_paise,
  coalesce(sum(captain_share_paise), 0) as captain_share_paise,
  coalesce(sum(kept_on_cancel_paise), 0) as kept_on_cancel_paise,
  coalesce(sum(profit_paise), 0) as profit_paise
from admin_controls.seat_booking_facts
where confirmed_at is not null
group by day;

-- One row per seat trip: fill, fares, and what the captain and ROVEYA earn.
create or replace view admin_controls.trip_finance as
select
  t.id,
  t.code,
  t.status,
  t.from_city,
  t.to_city,
  t.depart_at,
  t.arrive_at,
  t.base_fare_paise,
  t.women_friendly,
  t.captain_id,
  c.name as captain_name,
  c.captain_code,
  c.phone as captain_phone,
  t.car_id,
  car.make_model,
  car.plate,
  car.car_class,
  (select count(*) from public.seat_trip_seats s where s.trip_id = t.id) as seats_total,
  (select count(*) from public.seat_trip_seats s where s.trip_id = t.id and s.state = 'booked') as seats_booked,
  coalesce(f.bookings, 0) as bookings,
  coalesce(f.fare_paise, 0) as fare_paise,
  coalesce(f.collected_paise, 0) as collected_paise,
  coalesce(f.commission_paise, 0) as commission_paise,
  coalesce(f.captain_share_paise, 0) as captain_share_paise,
  coalesce(f.profit_paise, 0) as profit_paise,
  (select coalesce(sum(l.amount_paise), 0) from public.ledger_entries l
    where l.owner_id = t.captain_id and l.kind = 'seat_earning' and l.ref_type = 'seat_trip' and l.ref_id = t.id::text) as captain_paid_paise,
  t.created_at
from public.seat_trips t
join public.captains c on c.user_id = t.captain_id
join public.seat_cars car on car.id = t.car_id
left join (
  select trip_id,
    count(*) filter (where status in ('confirmed', 'completed')) as bookings,
    sum(fare_paise) filter (where status in ('confirmed', 'completed')) as fare_paise,
    sum(paid_paise) filter (where confirmed_at is not null) as collected_paise,
    sum(commission_paise) as commission_paise,
    sum(captain_share_paise) as captain_share_paise,
    sum(profit_paise) as profit_paise
  from admin_controls.seat_booking_facts
  group by trip_id
) f on f.trip_id = t.id;

-- Fares and earnings by route.
create or replace view admin_controls.route_finance as
select
  from_city,
  to_city,
  count(*) as trips,
  count(*) filter (where status = 'completed') as completed_trips,
  coalesce(sum(seats_total), 0) as seats_offered,
  coalesce(sum(seats_booked), 0) as seats_sold,
  coalesce(sum(bookings), 0) as bookings,
  coalesce(sum(fare_paise), 0) as fare_paise,
  coalesce(round(avg(base_fare_paise)), 0)::bigint as avg_base_fare_paise,
  coalesce(sum(commission_paise), 0) as commission_paise,
  coalesce(sum(profit_paise), 0) as profit_paise
from admin_controls.trip_finance
group by from_city, to_city;

-- ---------------------------------------------------------------------------
-- Access: the dashboard's server only
-- ---------------------------------------------------------------------------

alter table admin_controls.admins enable row level security;
alter table admin_controls.sessions enable row level security;
alter table admin_controls.audit_log enable row level security;

revoke all on schema admin_controls from public, anon, authenticated;
revoke all on all tables in schema admin_controls from public, anon, authenticated;
grant usage on schema admin_controls to service_role;
grant all on all tables in schema admin_controls to service_role;
grant all on all sequences in schema admin_controls to service_role;
grant execute on all functions in schema admin_controls to service_role;
alter default privileges in schema admin_controls grant all on tables to service_role;
alter default privileges in schema admin_controls grant all on sequences to service_role;

-- Expired sessions are cleared hourly.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'admin-controls-sessions';
    perform cron.schedule('admin-controls-sessions', '17 * * * *', $job$delete from admin_controls.sessions where expires_at < now()$job$);
  end if;
end;
$$;

notify pgrst, 'reload schema';
