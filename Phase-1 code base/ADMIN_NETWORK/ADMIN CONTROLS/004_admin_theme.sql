-- ROVEYA Admin Network: each team member's colour theme.
-- Run after 003_bike_auto.sql. Safe to run more than once.
--   dark   ROVEYA plum (the default)
--   light  cream and white
--   system follows the computer's or phone's setting

alter table admin_controls.admins
  add column if not exists theme text not null default 'dark';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'admins_theme_check') then
    alter table admin_controls.admins add constraint admins_theme_check check (theme in ('dark', 'light', 'system'));
  end if;
end $$;
