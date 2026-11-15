-- Proposed only. Do not apply this file to development or production until the owner approves it.
-- It is backward compatible with existing rows: created, paid, failed, and refunded stay valid.
-- New statuses record a captured payment whose booking is not confirmed, and a refund that has not finished.
-- The partial unique index is the guarantee that one booking or ride has one active payment attempt.

alter table public.payment_intents drop constraint if exists payment_intents_purpose_check;
alter table public.payment_intents add constraint payment_intents_purpose_check
  check (purpose in ('wallet_topup', 'trip', 'advertiser_topup', 'seat_booking', 'ride_fare'));

alter table public.payment_intents drop constraint if exists payment_intents_status_check;
alter table public.payment_intents add constraint payment_intents_status_check
  check (status in ('created', 'captured', 'paid', 'reconcile', 'refund_pending', 'refunded', 'failed'));

alter table public.payment_intents add column if not exists order_pending_at timestamptz;
alter table public.payment_intents add column if not exists refund_claim_at timestamptz;
alter table public.payment_intents add column if not exists last_error text;

create table if not exists public.payment_webhook_events (
  event_id text primary key,
  event_name text not null,
  payload jsonb not null,
  status text not null default 'received',
  created_at timestamptz not null default now()
);

alter table public.payment_webhook_events enable row level security;
revoke all on table public.payment_webhook_events from public, anon, authenticated;

do $$
begin
  if exists (
    select 1
    from public.payment_intents
    where ref_id is not null
      and status in ('created', 'captured', 'reconcile', 'refund_pending')
    group by purpose, ref_id
    having count(*) > 1
  ) then
    raise exception 'active_payment_duplicates';
  end if;
end $$;

create unique index if not exists payment_intents_one_active
  on public.payment_intents (purpose, ref_id)
  where status in ('created', 'captured', 'reconcile', 'refund_pending');

-- Locks the booking or trip, then inserts or reuses one attempt.
-- p_amount is ignored. The fare row is the only amount that can be stored.
create or replace function public.reserve_payment_attempt(
  p_owner uuid,
  p_purpose text,
  p_ref text,
  p_amount integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount integer;
  v_rider uuid;
  v_status text;
  v_payment text;
  v_intent public.payment_intents;
  v_id uuid;
begin
  if p_purpose = 'seat_booking' then
    select rider_id, status, total_paise
      into v_rider, v_status, v_amount
    from public.seat_bookings
    where id = p_ref::uuid
    for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_rider is distinct from p_owner then
      return jsonb_build_object('status', 'not_owner');
    end if;
    if v_status in ('confirmed', 'completed') then
      return jsonb_build_object('status', 'paid', 'action', 'paid');
    end if;
    if v_status not in ('pending', 'expired') then
      return jsonb_build_object('status', 'closed', 'action', 'blocked');
    end if;
  elsif p_purpose in ('ride_fare', 'trip') then
    select rider_id, payment, fare_paise
      into v_rider, v_payment, v_amount
    from public.trips
    where id = p_ref::uuid
    for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_rider is distinct from p_owner then
      return jsonb_build_object('status', 'not_owner');
    end if;
    if v_payment is distinct from 'online' then
      return jsonb_build_object('status', 'direct', 'action', 'blocked');
    end if;
  else
    return jsonb_build_object('status', 'rejected', 'action', 'blocked');
  end if;

  if v_amount is null or v_amount < 100 or v_amount > 5000000 then
    return jsonb_build_object('status', 'rejected', 'action', 'blocked');
  end if;
  -- p_amount is the caller's figure. It is never stored. A negative figure is rejected before the row is read further.
  if p_amount is not null and p_amount < 0 then
    return jsonb_build_object('status', 'rejected', 'action', 'blocked');
  end if;

  select * into v_intent
  from public.payment_intents
  where purpose = p_purpose
    and ref_id = p_ref
    and status in ('created', 'captured', 'reconcile', 'refund_pending', 'paid', 'refunded')
  order by created_at desc
  for update;

  if found then
    if v_intent.status in ('paid', 'refunded', 'captured', 'reconcile', 'refund_pending') then
      return jsonb_build_object(
        'status', v_intent.status,
        'action', case when v_intent.status = 'paid' then 'paid' else 'blocked' end,
        'intent_id', v_intent.id,
        'amount_paise', v_intent.amount_paise,
        'order_id', v_intent.razorpay_order_id
      );
    end if;
    if v_intent.razorpay_order_id is not null then
      return jsonb_build_object('status', 'created', 'action', 'reuse', 'intent_id', v_intent.id, 'amount_paise', v_intent.amount_paise, 'order_id', v_intent.razorpay_order_id);
    end if;
    if v_intent.order_pending_at is not null and v_intent.order_pending_at > now() - interval '15 minutes' then
      return jsonb_build_object('status', 'created', 'action', 'pending', 'intent_id', v_intent.id, 'amount_paise', v_intent.amount_paise);
    end if;
    update public.payment_intents
      set amount_paise = v_amount, order_pending_at = now(), last_error = null
      where id = v_intent.id;
    return jsonb_build_object('status', 'created', 'action', 'create', 'intent_id', v_intent.id, 'amount_paise', v_amount);
  end if;

  begin
    insert into public.payment_intents (owner_id, purpose, ref_id, amount_paise, status, order_pending_at)
    values (p_owner, p_purpose, p_ref, v_amount, 'created', now())
    returning id into v_id;
  exception
    when unique_violation then
      select * into v_intent
      from public.payment_intents
      where purpose = p_purpose
        and ref_id = p_ref
        and status in ('created', 'captured', 'reconcile', 'refund_pending')
      for update;
      if v_intent.razorpay_order_id is not null then
        return jsonb_build_object('status', 'created', 'action', 'reuse', 'intent_id', v_intent.id, 'amount_paise', v_intent.amount_paise, 'order_id', v_intent.razorpay_order_id);
      end if;
      return jsonb_build_object('status', 'created', 'action', 'pending', 'intent_id', v_intent.id, 'amount_paise', v_intent.amount_paise);
  end;

  return jsonb_build_object('status', 'created', 'action', 'create', 'intent_id', v_id, 'amount_paise', v_amount);
end;
$$;

create or replace function public.attach_gateway_order(p_intent uuid, p_order text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_order is null or btrim(p_order) = '' then
    return jsonb_build_object('status', 'rejected');
  end if;
  update public.payment_intents
    set razorpay_order_id = btrim(p_order), last_error = null
    where id = p_intent
      and status = 'created'
      and razorpay_order_id is null
    returning id into v_id;
  if v_id is null then
    return jsonb_build_object('status', 'not_attached');
  end if;
  return jsonb_build_object('status', 'attached', 'intent_id', v_id);
end;
$$;

-- A timeout is not a failed payment. The attempt stays visible and blocks a replacement order.
create or replace function public.mark_gateway_uncertain(p_intent uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.payment_intents
    set status = 'reconcile', last_error = 'gateway_uncertain'
    where id = p_intent
      and status = 'created'
      and razorpay_payment_id is null
    returning id into v_id;
  if v_id is null then
    return jsonb_build_object('status', 'unchanged');
  end if;
  return jsonb_build_object('status', 'reconcile', 'intent_id', v_id);
end;
$$;

-- Used only when the gateway refused the order and no order id was stored.
create or replace function public.mark_gateway_rejected(p_intent uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.payment_intents
    set status = 'failed', last_error = 'gateway_rejected'
    where id = p_intent
      and status = 'created'
      and razorpay_order_id is null
      and razorpay_payment_id is null
    returning id into v_id;
  if v_id is null then
    return jsonb_build_object('status', 'unchanged');
  end if;
  return jsonb_build_object('status', 'failed', 'intent_id', v_id);
end;
$$;

-- One transaction: the intent is paid only after seat_confirm returns a confirmed booking.
-- A failure inside seat_confirm rolls that booking work back and commits reconcile instead.
create or replace function public.apply_captured_intent(
  p_intent uuid,
  p_order text,
  p_payment text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.payment_intents;
  v_booking public.seat_bookings;
  v_booking_status text;
  v_trip_id uuid;
begin
  select * into v from public.payment_intents where id = p_intent for update;
  if not found then
    return jsonb_build_object('status', 'missing');
  end if;
  if v.razorpay_order_id is distinct from p_order then
    return jsonb_build_object('status', 'mismatch');
  end if;

  if v.status = 'paid' then
    if v.purpose = 'seat_booking' then
      select status into v_booking_status from public.seat_bookings where id = v.ref_id::uuid;
      if v_booking_status in ('confirmed', 'completed') then
        return jsonb_build_object('status', 'paid', 'purpose', v.purpose, 'booking_status', v_booking_status, 'ref_id', v.ref_id, 'payment_id', v.razorpay_payment_id);
      end if;
      update public.payment_intents set status = 'reconcile', last_error = 'paid_without_booking' where id = v.id;
      return jsonb_build_object('status', 'reconcile', 'purpose', v.purpose, 'booking_status', v_booking_status, 'ref_id', v.ref_id, 'payment_id', v.razorpay_payment_id, 'refund_required', false);
    end if;
    return jsonb_build_object('status', 'paid', 'purpose', v.purpose, 'ref_id', v.ref_id, 'payment_id', v.razorpay_payment_id);
  end if;

  if v.status in ('refunded', 'refund_pending', 'failed', 'reconcile') then
    return jsonb_build_object('status', v.status, 'purpose', v.purpose, 'ref_id', v.ref_id, 'payment_id', coalesce(v.razorpay_payment_id, p_payment), 'refund_required', false);
  end if;

  if v.status not in ('created', 'captured') then
    return jsonb_build_object('status', 'reconcile', 'purpose', v.purpose, 'ref_id', v.ref_id, 'refund_required', false);
  end if;

  update public.payment_intents
    set status = 'captured', razorpay_payment_id = p_payment, last_error = null
    where id = v.id;

  if v.purpose = 'seat_booking' then
    begin
      v_booking := public.seat_confirm(v.ref_id::uuid, 'Online', false, v.amount_paise::bigint, p_payment);
      if v_booking.status not in ('confirmed', 'completed') then
        update public.payment_intents
          set status = 'reconcile', last_error = 'booking_not_confirmed'
          where id = v.id;
        return jsonb_build_object('status', 'reconcile', 'purpose', v.purpose, 'booking_status', v_booking.status, 'ref_id', v.ref_id, 'payment_id', p_payment, 'amount_paise', v.amount_paise, 'refund_required', true);
      end if;
      update public.payment_intents set status = 'paid', last_error = null where id = v.id;
      return jsonb_build_object('status', 'paid', 'purpose', v.purpose, 'booking_status', v_booking.status, 'ref_id', v.ref_id, 'payment_id', p_payment, 'amount_paise', v.amount_paise);
    exception
      when others then
        update public.payment_intents
          set status = 'reconcile', last_error = left(sqlstate || ':' || sqlerrm, 120)
          where id = v.id;
        return jsonb_build_object('status', 'reconcile', 'purpose', v.purpose, 'ref_id', v.ref_id, 'payment_id', p_payment, 'amount_paise', v.amount_paise, 'refund_required', true);
    end;
  end if;

  if v.purpose in ('ride_fare', 'trip') then
    v_trip_id := v.ref_id::uuid;
    update public.trips
      set payment_status = 'paid'
      where id = v_trip_id
        and rider_id = v.owner_id
        and payment = 'online';
    if not found then
      update public.payment_intents set status = 'reconcile', last_error = 'ride_not_updated' where id = v.id;
      return jsonb_build_object('status', 'reconcile', 'purpose', v.purpose, 'ref_id', v.ref_id, 'payment_id', p_payment, 'refund_required', false);
    end if;
    update public.payment_intents set status = 'paid', last_error = null where id = v.id;
    return jsonb_build_object('status', 'paid', 'purpose', v.purpose, 'ref_id', v.ref_id, 'payment_id', p_payment, 'amount_paise', v.amount_paise);
  end if;

  update public.payment_intents set status = 'paid', last_error = null where id = v.id;
  return jsonb_build_object('status', 'paid', 'purpose', v.purpose, 'ref_id', v.ref_id, 'payment_id', p_payment);
end;
$$;

create or replace function public.confirm_gateway_payment(
  p_intent uuid,
  p_order text,
  p_payment text,
  p_owner uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_result jsonb;
begin
  select owner_id into v_owner from public.payment_intents where id = p_intent for update;
  if not found then
    return jsonb_build_object('status', 'missing');
  end if;
  if p_owner is not null and p_owner is distinct from v_owner then
    return jsonb_build_object('status', 'not_owner');
  end if;
  v_result := public.apply_captured_intent(p_intent, p_order, p_payment);
  return v_result;
end;
$$;

create or replace function public.claim_reconcile_refund(p_intent uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.payment_intents;
begin
  update public.payment_intents
    set refund_claim_at = now()
    where id = p_intent
      and status = 'reconcile'
      and razorpay_payment_id is not null
      and (refund_claim_at is null or refund_claim_at < now() - interval '2 minutes')
    returning * into v;
  if v.id is null then
    return jsonb_build_object('send', false);
  end if;
  return jsonb_build_object('send', true, 'ref_id', v.ref_id, 'amount_paise', v.amount_paise, 'payment_id', v.razorpay_payment_id);
end;
$$;

create or replace function public.mark_refund_pending(p_intent uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.payment_intents
    set status = 'refund_pending'
    where id = p_intent
      and status = 'reconcile'
    returning id into v_id;
  if v_id is null then
    return jsonb_build_object('status', 'unchanged');
  end if;
  return jsonb_build_object('status', 'refund_pending', 'intent_id', v_id);
end;
$$;

create or replace function public.release_refund_claim(p_intent uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.payment_intents
    set refund_claim_at = null
    where id = p_intent
      and status = 'reconcile';
  return jsonb_build_object('status', 'released');
end;
$$;

-- Inserts the event and applies the money change in the same transaction.
-- A second delivery of the same event id waits, then returns duplicate.
create or replace function public.accept_gateway_event(
  p_event_id text,
  p_event_name text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted text;
  v_status text;
  v_order text;
  v_payment text;
  v_intent uuid;
  v_result jsonb;
  v_updated uuid;
begin
  if p_event_id is null or btrim(p_event_id) = '' then
    return jsonb_build_object('status', 'invalid');
  end if;

  insert into public.payment_webhook_events (event_id, event_name, payload, status)
  values (btrim(p_event_id), coalesce(p_event_name, ''), coalesce(p_payload, '{}'::jsonb), 'processing')
  on conflict (event_id) do nothing
  returning event_id into v_inserted;

  if v_inserted is null then
    select status into v_status
    from public.payment_webhook_events
    where event_id = btrim(p_event_id)
    for update;
    if v_status = 'processed' or v_status = 'unmatched' then
      return jsonb_build_object('status', 'duplicate');
    end if;
    return jsonb_build_object('status', 'duplicate');
  end if;

  if p_event_name = 'payment.captured' then
    v_order := p_payload #>> '{payload,payment,entity,order_id}';
    v_payment := p_payload #>> '{payload,payment,entity,id}';
    select id into v_intent from public.payment_intents where razorpay_order_id = v_order for update;
    if v_intent is null then
      update public.payment_webhook_events set status = 'unmatched' where event_id = btrim(p_event_id);
      return jsonb_build_object('status', 'unmatched');
    end if;
    v_result := public.apply_captured_intent(v_intent, v_order, v_payment);
    update public.payment_webhook_events set status = 'processed' where event_id = btrim(p_event_id);
    return v_result || jsonb_build_object('event', 'applied');
  end if;

  if p_event_name in ('refund.processed', 'refund.failed') then
    v_payment := p_payload #>> '{payload,refund,entity,payment_id}';
    if p_event_name = 'refund.processed' then
      update public.payment_intents
        set status = 'refunded'
        where razorpay_payment_id = v_payment
          and status in ('paid', 'captured', 'reconcile', 'refund_pending')
        returning id into v_updated;
    end if;
    update public.payment_webhook_events set status = 'processed' where event_id = btrim(p_event_id);
    return jsonb_build_object('status', 'applied', 'kind', case when p_event_name = 'refund.processed' then 'refund' else 'refund_failed' end, 'payment_id', v_payment, 'changed', v_updated is not null);
  end if;

  update public.payment_webhook_events set status = 'processed' where event_id = btrim(p_event_id);
  return jsonb_build_object('status', 'ignored');
end;
$$;

revoke all on function public.reserve_payment_attempt(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.attach_gateway_order(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_gateway_uncertain(uuid) from public, anon, authenticated;
revoke all on function public.mark_gateway_rejected(uuid) from public, anon, authenticated;
revoke all on function public.apply_captured_intent(uuid, text, text) from public, anon, authenticated;
revoke all on function public.confirm_gateway_payment(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.claim_reconcile_refund(uuid) from public, anon, authenticated;
revoke all on function public.mark_refund_pending(uuid) from public, anon, authenticated;
revoke all on function public.release_refund_claim(uuid) from public, anon, authenticated;
revoke all on function public.accept_gateway_event(text, text, jsonb) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.reserve_payment_attempt(uuid, text, text, integer) to service_role;
    grant execute on function public.attach_gateway_order(uuid, text) to service_role;
    grant execute on function public.mark_gateway_uncertain(uuid) to service_role;
    grant execute on function public.mark_gateway_rejected(uuid) to service_role;
    grant execute on function public.apply_captured_intent(uuid, text, text) to service_role;
    grant execute on function public.confirm_gateway_payment(uuid, text, text, uuid) to service_role;
    grant execute on function public.claim_reconcile_refund(uuid) to service_role;
    grant execute on function public.mark_refund_pending(uuid) to service_role;
    grant execute on function public.release_refund_claim(uuid) to service_role;
    grant execute on function public.accept_gateway_event(text, text, jsonb) to service_role;
  end if;
end $$;
