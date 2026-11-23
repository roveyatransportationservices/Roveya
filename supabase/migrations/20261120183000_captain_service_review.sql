-- Captains already record which desk they belong to and when review started.
-- registerCaptain writes service and review_since. The desk reads both.
-- This file is not applied by Phase 5.8A. Apply it only after a separate approval.

alter table public.captains add column if not exists service text;
alter table public.captains add column if not exists review_since timestamptz;

update public.captains as captain
set service = case
  when exists (select 1 from public.seat_cars as car where car.captain_id = captain.user_id) then 'carpool'
  else 'taxi'
end
where captain.service is null;

update public.captains
set review_since = created_at
where review_since is null;

alter table public.captains drop constraint if exists captains_service_check;
alter table public.captains
  add constraint captains_service_check
  check (service in ('taxi', 'carpool', 'seats'));

alter table public.captains alter column service set not null;
alter table public.captains alter column review_since set not null;
