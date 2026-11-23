-- Anonymous and signed-in clients do not post ledger lines.
-- The service role posts them through ledger_post.
-- Row level security already rejected the insert. This removes the unused grant.

revoke insert on table public.ledger_entries from anon, authenticated;
