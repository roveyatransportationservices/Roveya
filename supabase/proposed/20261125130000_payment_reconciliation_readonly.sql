-- READ-ONLY reconciliation helpers for Phase 4.8.
-- Safe to run on staging after founder approval for inspection.
-- Does not modify data. Does not auto-repair discrepancies.

-- 1) Captured/paid intents without matching ledger credit (wallet_topup)
create or replace view public.recon_wallet_topup_gaps as
select pi.id as intent_id,
       pi.owner_id,
       pi.amount_paise,
       pi.status,
       pi.razorpay_order_id,
       pi.razorpay_payment_id,
       pi.created_at
from public.payment_intents pi
where pi.purpose = 'wallet_topup'
  and pi.status in ('paid', 'captured')
  and not exists (
    select 1 from public.ledger_entries le
    where le.owner_id = pi.owner_id
      and le.kind = 'topup'
      and le.ref_type = 'payment_intent'
      and le.ref_id = coalesce(pi.razorpay_payment_id, pi.id::text)
  );

-- 2) Active-day markers vs ledger deductions
create or replace view public.recon_active_day_fee_gaps as
select ps.key,
       ps.value,
       ps.updated_at
from public.platform_settings ps
where ps.key like 'active_day_%'
  and public.active_day_marker_is_charged(ps.value)
  and not exists (
    select 1 from public.ledger_entries le
    where le.ref_type = 'admin_adjustment'
      and le.ref_id = ps.key
      and le.amount_paise < 0
  );

-- 3) Duplicate gateway payment ids
create or replace view public.recon_duplicate_gateway_payments as
select razorpay_payment_id, count(*) as intent_count
from public.payment_intents
where razorpay_payment_id is not null
group by 1
having count(*) > 1;

revoke all on public.recon_wallet_topup_gaps from public, anon, authenticated;
revoke all on public.recon_active_day_fee_gaps from public, anon, authenticated;
revoke all on public.recon_duplicate_gateway_payments from public, anon, authenticated;
grant select on public.recon_wallet_topup_gaps to service_role;
grant select on public.recon_active_day_fee_gaps to service_role;
grant select on public.recon_duplicate_gateway_payments to service_role;
