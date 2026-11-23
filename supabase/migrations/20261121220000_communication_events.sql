-- Prepared only. Do not apply until a separate approval.
-- Adds delivery tracking and receipt drafts. Does not replace push_send, offers_push, seat_push, or seat_cancel.

create table if not exists public.communication_events (
  id bigint generated always as identity primary key,
  event_key text not null unique,
  kind text not null,
  channel text not null,
  audience text not null,
  ref_type text,
  ref_id text,
  status text not null,
  attempts integer not null default 1,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_events_status_check check (status in ('queued', 'accepted', 'failed', 'unknown', 'skipped'))
);

create table if not exists public.service_receipts (
  id bigint generated always as identity primary key,
  receipt_no text not null unique,
  source text not null,
  ref_id text not null,
  document text not null default 'non_tax_receipt_draft',
  payload jsonb not null,
  email_status text not null default 'not_sent',
  created_at timestamptz not null default now(),
  constraint service_receipts_source_check check (source in ('city', 'carpool')),
  constraint service_receipts_email_status_check check (email_status in ('not_sent', 'accepted', 'failed', 'held')),
  constraint service_receipts_ref_unique unique (source, ref_id)
);

alter table public.communication_events enable row level security;
alter table public.service_receipts enable row level security;

revoke all on table public.communication_events from public, anon, authenticated;
revoke all on table public.service_receipts from public, anon, authenticated;
grant select, insert, update on table public.communication_events to service_role;
grant select, insert, update on table public.service_receipts to service_role;

-- Rollback: remove public.communication_events and public.service_receipts after this migration is the only thing that created them.
-- Leave push_tokens, push_log, trips, seat_bookings, and platform_settings in place.
-- Until this migration is applied, the application records a missing table as pending and does not retry a timed-out push.
