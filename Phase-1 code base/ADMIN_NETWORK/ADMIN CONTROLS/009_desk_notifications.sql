-- Notifications moved to the Support Desk. A Customer Support Executive can message one rider, one Vado,
-- or everyone on a trip. Sending to all riders or all Vado needs "notify.broadcast", which the CEO gives under Hiring > Job roles.
update admin_controls.roles
set permissions = array(select distinct unnest(permissions || array['notify.send']) order by 1)
where key = 'support_executive';
