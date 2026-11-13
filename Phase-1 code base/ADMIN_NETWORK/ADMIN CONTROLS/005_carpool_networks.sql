-- ROVEYA Admin Network: the Carpool Networks launch planner.
-- Run after 004_admin_theme.sql. Safe to run more than once.
-- One row per city the team is planning or running:
--   planned    on the list, nothing started
--   launching  recruiting captains and boarding points
--   live       open to passengers
--   paused     stopped for now
-- Cities with no row still show in the network once trips run there.

create table if not exists admin_controls.network_cities (
  city_id text primary key check (city_id ~ '^[a-z]{3}$'),
  status text not null default 'planned' check (status in ('planned', 'launching', 'live', 'paused')),
  target_captains integer check (target_captains is null or target_captains between 0 and 10000),
  launch_date date,
  owner_id uuid references admin_controls.admins (id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  updated_by uuid references admin_controls.admins (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists network_cities_touch on admin_controls.network_cities;
create trigger network_cities_touch before update on admin_controls.network_cities
  for each row execute function admin_controls.touch();

alter table admin_controls.network_cities enable row level security;
revoke all on admin_controls.network_cities from public, anon, authenticated;
grant all on admin_controls.network_cities to service_role;
