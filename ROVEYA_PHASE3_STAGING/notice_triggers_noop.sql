-- Not applied. Replaces the trigger functions only.
-- The triggers stay. The application keeps its own sender.
-- This does not insert communication_events and does not wait.

create or replace function public.offers_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  return new;
end;
$$;

create or replace function public.trips_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  return new;
end;
$$;
