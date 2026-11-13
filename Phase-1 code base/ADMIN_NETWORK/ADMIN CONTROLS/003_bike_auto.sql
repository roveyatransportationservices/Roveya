-- ROVEYA ADMIN CONTROLS · part 3
-- ROVEYA Bike and ROVEYA Auto join the same dashboard. Adds the two new
-- permissions to the built-in roles. Run after 002_roles_tasks_calls.sql.
-- Safe to run more than once.

do $$
begin
  if to_regclass('admin_controls.roles') is null then
    raise exception 'Run 001_admin_controls.sql and 002_roles_tasks_calls.sql first, then this file.';
  end if;
end;
$$;

-- Everyone who already sees car seat trips also sees bike and auto rides.
update admin_controls.roles
set permissions = array_append(permissions, 'view.rides')
where 'view.trips' = any (permissions)
  and not ('view.rides' = any (permissions));

-- Roles that already manage trips also manage bike and auto rides.
update admin_controls.roles
set permissions = array_append(permissions, 'rides.manage')
where 'trips.manage' = any (permissions)
  and not ('rides.manage' = any (permissions));
