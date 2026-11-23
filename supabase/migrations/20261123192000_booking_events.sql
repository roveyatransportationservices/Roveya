-- The city-ride handler records dispatch history here.
-- The handler already ignores a missing table, so existing databases keep working until this is applied.
-- This does not add the extra captain unique index from ADMIN CONTROLS/010_dispatch.sql.
-- That index is already covered by trips_one_open_per_captain.

create table if not exists public.booking_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  kind text not null,
  detail text,
  at timestamptz not null default now()
);

create index if not exists booking_events_trip_idx on public.booking_events (trip_id, at desc);

alter table public.booking_events enable row level security;

revoke all on table public.booking_events from public, anon, authenticated;
grant select, insert on table public.booking_events to service_role;
