-- Email sign-in does not have a mobile number yet.
-- A phone that is present must still be a 10-digit Indian mobile.
-- No rows are deleted or rewritten.

alter table public.riders alter column phone drop not null;
