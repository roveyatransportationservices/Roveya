-- Not applied. Run this on staging before deploying the admin that reads assignment_version.
-- Additive. Existing trips stay at version 0. No notice rows are changed.
-- The notification triggers are not replaced here.

alter table public.trips
  add column if not exists assignment_version integer not null default 0;

comment on column public.trips.assignment_version is
  'Increments only when a different captain is assigned. Existing rows start at 0.';

create or replace function public.trips_assignment_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.captain_id is not null
     and new.captain_id is distinct from old.captain_id
     and new.status in ('assigned', 'arrived', 'on_trip') then
    new.assignment_version := old.assignment_version + 1;
  else
    new.assignment_version := old.assignment_version;
  end if;
  return new;
end;
$$;

revoke all on function public.trips_assignment_version() from public, anon, authenticated;

drop trigger if exists trips_assignment_version on public.trips;
create trigger trips_assignment_version
  before update on public.trips
  for each row execute function public.trips_assignment_version();
