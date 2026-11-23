-- ROVEYA Admin Network: payment cases for the Payments menu.
-- Run after 005_carpool_networks.sql. Safe to run more than once.
-- A case is the team's record of a money problem on one captain (Rider) or passenger (Vado):
--   kind    fraud (suspected misuse) or support (a technical or payment problem to fix)
--   status  open, watching (keeping an eye), resolved
-- Notes are kept in order inside the case, newest last.

create sequence if not exists admin_controls.money_case_seq start 1001;

create table if not exists admin_controls.money_cases (
  id bigserial primary key,
  code text not null unique default ('MC-' || nextval('admin_controls.money_case_seq')),
  owner_id uuid not null,
  role text not null check (role in ('captain', 'rider')),
  service text not null check (service in ('bike', 'auto', 'taxi', 'carpool')),
  kind text not null check (kind in ('fraud', 'support')),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  status text not null default 'open' check (status in ('open', 'watching', 'resolved')),
  amount_paise bigint,
  reference text check (reference is null or char_length(reference) <= 80),
  notes jsonb not null default '[]'::jsonb check (jsonb_typeof(notes) = 'array'),
  created_by uuid references admin_controls.admins (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists money_cases_owner on admin_controls.money_cases (owner_id, created_at desc);
create index if not exists money_cases_open on admin_controls.money_cases (service, role) where status <> 'resolved';

drop trigger if exists money_cases_touch on admin_controls.money_cases;
create trigger money_cases_touch before update on admin_controls.money_cases
  for each row execute function admin_controls.touch();

alter table admin_controls.money_cases enable row level security;
revoke all on admin_controls.money_cases from public, anon, authenticated;
grant all on admin_controls.money_cases to service_role;
grant usage, select on sequence admin_controls.money_case_seq to service_role;
