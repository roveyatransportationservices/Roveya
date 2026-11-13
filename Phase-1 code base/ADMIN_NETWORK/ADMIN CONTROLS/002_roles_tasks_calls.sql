-- ROVEYA ADMIN CONTROLS · part 2
-- Roles the founder creates from the dashboard, work assigned to team members,
-- and a log of every call the team makes. Run after 001_admin_controls.sql.

do $$
begin
  if to_regclass('admin_controls.admins') is null then
    raise exception 'Run 001_admin_controls.sql first, then this file.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Roles with tick-box permissions
-- ---------------------------------------------------------------------------

create table if not exists admin_controls.roles (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{2,39}$'),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  description text check (description is null or char_length(description) <= 240),
  permissions text[] not null default '{}',
  is_system boolean not null default false,
  created_by uuid references admin_controls.admins (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists roles_touch on admin_controls.roles;
create trigger roles_touch before update on admin_controls.roles for each row execute function admin_controls.touch();

insert into admin_controls.roles (key, name, description, permissions, is_system) values
  ('super_admin', 'Founder · Super admin', 'Everything, including the team and roles.', array[
    'view.dashboard','view.finance','view.bookings','view.trips','view.captains','view.travellers','view.offers','view.support','view.safety','view.audit',
    'bookings.manage','trips.manage','captains.review','captains.edit','travellers.edit','money.payouts','money.wallets','offers.manage',
    'support.reply','safety.respond','calls.make','notify.send','tasks.assign','settings.manage','admins.manage'], true),
  ('safety_desk', 'Safety & Captain Desk', 'Answers SOS and route alerts, calls captains and travellers, and verifies captain documents and cars.', array[
    'view.bookings','view.trips','view.captains','view.travellers','view.safety','view.support',
    'captains.review','safety.respond','calls.make','support.reply','notify.send'], false),
  ('finance', 'Finance', 'Fares, profit, payouts, wallet adjustments, offers and platform settings.', array[
    'view.dashboard','view.finance','view.bookings','view.trips','view.captains','view.travellers','view.offers','view.audit',
    'money.payouts','money.wallets','offers.manage','settings.manage'], false),
  ('operations', 'Operations', 'Captains, cars, trips, bookings, offers and support.', array[
    'view.dashboard','view.bookings','view.trips','view.captains','view.travellers','view.offers','view.support','view.safety',
    'bookings.manage','trips.manage','captains.review','captains.edit','travellers.edit','offers.manage','support.reply','safety.respond','calls.make','notify.send','tasks.assign'], false),
  ('support', 'Support', 'Support tickets, calls and safety alerts.', array[
    'view.bookings','view.trips','view.captains','view.travellers','view.support','view.safety','support.reply','safety.respond','calls.make'], false),
  ('viewer', 'Viewer', 'Reads everything, changes nothing.', array[
    'view.dashboard','view.finance','view.bookings','view.trips','view.captains','view.travellers','view.offers','view.support','view.safety','view.audit'], false)
on conflict (key) do update set permissions = case when admin_controls.roles.is_system then excluded.permissions else admin_controls.roles.permissions end;

-- Admins now point at a role row, and keep a phone for calls through the ROVEYA line.
alter table admin_controls.admins drop constraint if exists admins_role_check;
alter table admin_controls.admins drop constraint if exists admins_role_fkey;
alter table admin_controls.admins add constraint admins_role_fkey foreign key (role) references admin_controls.roles (key) on update cascade;
alter table admin_controls.admins add column if not exists phone text check (phone is null or phone ~ '^[6-9][0-9]{9}$');

-- ---------------------------------------------------------------------------
-- Work the founder (or anyone with tasks.assign) gives to team members
-- ---------------------------------------------------------------------------

create sequence if not exists admin_controls.task_seq start 101;

create table if not exists admin_controls.tasks (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('TK-' || nextval('admin_controls.task_seq')),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  details text check (details is null or char_length(details) <= 2000),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'cancelled')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid references admin_controls.admins (id) on delete set null,
  created_by uuid references admin_controls.admins (id) on delete set null,
  entity text check (entity is null or entity in ('captain', 'traveller', 'trip', 'booking', 'ticket', 'safety', 'payout', 'other')),
  entity_id text,
  link text check (link is null or link ~ '^/[A-Za-z0-9/_?=&.-]*$'),
  due_at timestamptz,
  completed_at timestamptz,
  last_note text check (last_note is null or char_length(last_note) <= 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_assignee on admin_controls.tasks (assigned_to, status);
create index if not exists tasks_entity on admin_controls.tasks (entity, entity_id);
drop trigger if exists tasks_touch on admin_controls.tasks;
create trigger tasks_touch before update on admin_controls.tasks for each row execute function admin_controls.touch();

-- ---------------------------------------------------------------------------
-- Calls made from the dashboard
-- ---------------------------------------------------------------------------

create table if not exists admin_controls.call_log (
  id bigserial primary key,
  admin_id uuid references admin_controls.admins (id) on delete set null,
  admin_name text,
  to_phone text not null check (to_phone ~ '^[6-9][0-9]{9}$'),
  to_name text,
  to_kind text check (to_kind is null or to_kind in ('Captain', 'Traveller', 'Contact', 'Other')),
  entity text,
  entity_id text,
  mode text not null check (mode in ('bridged', 'direct')),
  provider_sid text,
  outcome text check (outcome is null or outcome in ('reached', 'no_answer', 'busy', 'wrong_number', 'callback')),
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists call_log_recent on admin_controls.call_log (created_at desc);
create index if not exists call_log_phone on admin_controls.call_log (to_phone, created_at desc);

-- ---------------------------------------------------------------------------
-- Access: the dashboard's server only
-- ---------------------------------------------------------------------------

alter table admin_controls.roles enable row level security;
alter table admin_controls.tasks enable row level security;
alter table admin_controls.call_log enable row level security;

revoke all on all tables in schema admin_controls from public, anon, authenticated;
grant all on all tables in schema admin_controls to service_role;
grant all on all sequences in schema admin_controls to service_role;

notify pgrst, 'reload schema';
