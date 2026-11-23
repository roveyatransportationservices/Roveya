-- Forward-only. Staging project pqnfipleuztivnrsyvkd already has communication_events.
-- This adds the one missing column the recovery reader selects.
-- offer_id is the trip_offers.id the captain app stores. It is nullable.
-- Existing rows stay, with offer_id null. No foreign key, so removing an offer does not delete the notice.
-- No table is dropped or recreated. Cron, refunds, and ledger rows are not referenced.

alter table public.communication_events
  add column if not exists offer_id uuid;

comment on column public.communication_events.offer_id is
  'Optional trip_offers.id for a captain offer notice. Null for ride and carpool notices.';
