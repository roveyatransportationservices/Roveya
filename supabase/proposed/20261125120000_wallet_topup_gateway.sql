-- Proposed. Staging only after founder approval.
-- Adds Captain prepaid wallet_topup to reserve_payment_attempt + apply_captured_intent.
-- Credits wallet once via ledger_post on verified capture. Idempotent on replay.
-- Does NOT enable product by itself. App remains gated until platform_settings
-- wallet_topup_enabled=true AND Razorpay test credentials are configured.
-- Rollback: restore reserve_payment_attempt / apply_captured_intent from
-- 20261115123000_payment_attempt_reliability.sql. Never delete ledger rows.

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
  v_cap_status text;
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
  elsif p_purpose = 'wallet_topup' then
    select status into v_cap_status
    from public.captains
    where user_id = p_owner
    for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_cap_status is distinct from 'active' then
      return jsonb_build_object('status', 'rejected', 'action', 'blocked');
    end if;
    -- Server amount only. Provisional bounds pending founder policy approval.
    if p_amount is null or p_amount < 1000 or p_amount > 100000 then
      return jsonb_build_object('status', 'rejected', 'action', 'blocked');
    end if;
    v_amount := p_amount;
    -- One active top-up attempt per captain (ref is intent-scoped unique token).
    if p_ref is null or btrim(p_ref) = '' then
      return jsonb_build_object('status', 'rejected', 'action', 'blocked');
    end if;
  else
    return jsonb_build_object('status', 'rejected', 'action', 'blocked');
  end if;

  if v_amount is null or v_amount < 100 or v_amount > 5000000 then
    return jsonb_build_object('status', 'rejected', 'action', 'blocked');
  end if;
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

  if v.purpose = 'wallet_topup' then
    begin
      perform 1 from public.wallets where owner_id = v.owner_id for update;
      if not found then
        insert into public.wallets (owner_id, owner_kind, balance_paise)
        values (v.owner_id, 'captain', 0)
        on conflict (owner_id) do nothing;
        perform 1 from public.wallets where owner_id = v.owner_id for update;
      end if;
      -- Idempotent credit keyed by payment id.
      perform public.ledger_post(
        v.owner_id,
        'topup',
        v.amount_paise::bigint,
        'payment_intent',
        coalesce(p_payment, v.id::text),
        'Wallet top-up',
        false
      );
      update public.payment_intents set status = 'paid', last_error = null where id = v.id;
      return jsonb_build_object('status', 'paid', 'purpose', v.purpose, 'ref_id', v.ref_id, 'payment_id', p_payment, 'amount_paise', v.amount_paise);
    exception
      when unique_violation then
        update public.payment_intents set status = 'paid', last_error = null where id = v.id;
        return jsonb_build_object('status', 'paid', 'purpose', v.purpose, 'ref_id', v.ref_id, 'payment_id', p_payment, 'amount_paise', v.amount_paise);
      when others then
        update public.payment_intents
          set status = 'reconcile', last_error = left(sqlstate || ':' || sqlerrm, 120)
          where id = v.id;
        return jsonb_build_object('status', 'reconcile', 'purpose', v.purpose, 'ref_id', v.ref_id, 'payment_id', p_payment, 'amount_paise', v.amount_paise, 'refund_required', false);
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

revoke all on function public.reserve_payment_attempt(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.apply_captured_intent(uuid, text, text) from public, anon, authenticated;
grant execute on function public.reserve_payment_attempt(uuid, text, text, integer) to service_role;
grant execute on function public.apply_captured_intent(uuid, text, text) to service_role;
