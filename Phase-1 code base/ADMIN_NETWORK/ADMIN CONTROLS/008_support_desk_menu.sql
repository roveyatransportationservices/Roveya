-- The Support Desk login now has a side menu with Safety & SOS, so the Customer Support Executive
-- can see SOS presses and acknowledge or resolve them. The CEO can take this away under Hiring > Job roles.
update admin_controls.roles
set permissions = array(select distinct unnest(permissions || array['view.safety', 'safety.respond']) order by 1)
where key = 'support_executive';
