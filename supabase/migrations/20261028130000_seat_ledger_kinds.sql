-- Forward-only repair. Do not apply to development until a separate approval.
-- The recovered seat functions post balanced ledger pairs:
--   seat_payment  rider debit and platform credit
--   seat_refund   rider credit and platform debit
--   seat_earning  captain credit and platform debit
-- operations.sql replaces this check and does not list those kinds.
-- This file runs after that replacement and keeps every kind already allowed.

alter table public.ledger_entries drop constraint if exists ledger_entries_kind_check;

alter table public.ledger_entries add constraint ledger_entries_kind_check check (kind in (
  'topup',
  'ride_payment',
  'ride_earning',
  'ride_bonus',
  'commission',
  'payout',
  'payout_reversal',
  'ad_spend',
  'advertiser_topup',
  'refund',
  'adjustment',
  'promo',
  'seat_payment',
  'seat_refund',
  'seat_earning'
));
