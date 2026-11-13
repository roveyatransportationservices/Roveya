-- ROVEYA Admin Network: Support Desk dashboard and Hiring.
-- Run after 006_money_cases.sql. Safe to run more than once.

-- 1. Each job role opens either the full admin panel or the Support Desk dashboard (no side menu).
alter table admin_controls.roles add column if not exists workspace text not null default 'admin';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'roles_workspace_check') then
    alter table admin_controls.roles add constraint roles_workspace_check check (workspace in ('admin', 'support_desk'));
  end if;
end $$;

insert into admin_controls.roles (key, name, description, permissions, is_system, workspace) values
  ('support_executive', 'Customer Support Executive', 'Works in the Support Desk dashboard: verifies new Vado (captain) documents within 45 minutes and answers support tickets.', array[
    'view.captains', 'captains.review', 'view.support', 'support.reply', 'calls.make'], false, 'support_desk')
on conflict (key) do nothing;

-- 2. Who on the desk is checking a Vado's registration, so two people never work the same one.
create table if not exists admin_controls.vado_claims (
  captain_id uuid primary key,
  admin_id uuid not null references admin_controls.admins (id) on delete cascade,
  admin_name text,
  claimed_at timestamptz not null default now()
);

-- 3. Hiring: every new team email is approved by the CEO before a login is created.
create table if not exists admin_controls.access_requests (
  id bigserial primary key,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  phone text check (phone is null or phone ~ '^[6-9][0-9]{9}$'),
  role text references admin_controls.roles (key) on delete set null,
  job_title text check (job_title is null or char_length(job_title) <= 80),
  note text check (note is null or char_length(note) <= 500),
  source text not null default 'login' check (source in ('login', 'team')),
  requested_by uuid references admin_controls.admins (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references admin_controls.admins (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 300),
  admin_id uuid references admin_controls.admins (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists access_requests_one_pending on admin_controls.access_requests (lower(email)) where status = 'pending';
create index if not exists access_requests_recent on admin_controls.access_requests (status, created_at desc);

alter table admin_controls.vado_claims enable row level security;
alter table admin_controls.access_requests enable row level security;
revoke all on admin_controls.vado_claims, admin_controls.access_requests from public, anon, authenticated;
grant all on admin_controls.vado_claims, admin_controls.access_requests to service_role;
grant usage, select on all sequences in schema admin_controls to service_role;

-- 4. How long the desk has to verify a new Vado, shown to the desk and to the captain.
insert into public.platform_settings (key, value) values ('vado_verification_minutes', '45')
on conflict (key) do nothing;
