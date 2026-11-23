-- Forward-only carpool pricing and refund correction. Local until a separate approval.
-- Does not change stored fare, GST, or total on rows that already exist.
-- Existing rows are marked legacy_commission_v0 and keep the old settlement formula.
-- New rows use booking_fee_v1: per seat, fee and GST in integer paise, half-up.

alter table public.seat_bookings add column if not exists pricing_model text;
alter table public.seat_bookings add column if not exists fee_paise integer not null default 0;
alter table public.seat_bookings add column if not exists wallet_collected_paise integer not null default 0;
alter table public.seat_bookings add column if not exists gateway_collected_paise integer not null default 0;
alter table public.seat_bookings add column if not exists desk_collected_paise integer not null default 0;
alter table public.seat_bookings add column if not exists wallet_refunded_paise integer not null default 0;
alter table public.seat_bookings add column if not exists gateway_refund_paise integer not null default 0;
alter table public.seat_bookings add column if not exists gateway_payment_id text;

update public.seat_bookings
set pricing_model = 'legacy_commission_v0'
where pricing_model is null;

alter table public.seat_bookings alter column pricing_model set default 'booking_fee_v1';
alter table public.seat_bookings alter column pricing_model set not null;

alter table public.seat_bookings drop constraint if exists seat_bookings_pricing_model_check;
alter table public.seat_bookings add constraint seat_bookings_pricing_model_check
  check (pricing_model in ('legacy_commission_v0', 'booking_fee_v1'));
alter table public.seat_bookings drop constraint if exists seat_bookings_fee_paise_check;
alter table public.seat_bookings add constraint seat_bookings_fee_paise_check check (fee_paise >= 0);
alter table public.seat_bookings drop constraint if exists seat_bookings_wallet_collected_check;
alter table public.seat_bookings add constraint seat_bookings_wallet_collected_check check (wallet_collected_paise >= 0);
alter table public.seat_bookings drop constraint if exists seat_bookings_gateway_collected_check;
alter table public.seat_bookings add constraint seat_bookings_gateway_collected_check check (gateway_collected_paise >= 0);
alter table public.seat_bookings drop constraint if exists seat_bookings_desk_collected_check;
alter table public.seat_bookings add constraint seat_bookings_desk_collected_check check (desk_collected_paise >= 0);
alter table public.seat_bookings drop constraint if exists seat_bookings_wallet_refunded_check;
alter table public.seat_bookings add constraint seat_bookings_wallet_refunded_check check (wallet_refunded_paise >= 0);
alter table public.seat_bookings drop constraint if exists seat_bookings_gateway_refund_check;
alter table public.seat_bookings add constraint seat_bookings_gateway_refund_check check (gateway_refund_paise >= 0);
alter table public.seat_bookings drop constraint if exists seat_bookings_refund_not_above_collected;
alter table public.seat_bookings add constraint seat_bookings_refund_not_above_collected check (
  wallet_refunded_paise <= wallet_collected_paise + desk_collected_paise
  and gateway_refund_paise <= gateway_collected_paise
);

-- Classify money already posted. This does not change ledger amounts.
update public.seat_bookings b
set wallet_collected_paise = coalesce((
  select sum(-e.amount_paise)::integer
  from public.ledger_entries e
  where e.owner_id = b.rider_id
    and e.kind = 'seat_payment'
    and e.amount_paise < 0
    and e.ref_id = b.id::text
    and e.ref_type in ('seat_booking', 'seat_cash')
), 0)
where b.pricing_model = 'legacy_commission_v0';

update public.seat_bookings b
set gateway_collected_paise = p.amount_paise,
    gateway_payment_id = coalesce(b.gateway_payment_id, p.razorpay_payment_id)
from public.payment_intents p
where p.ref_id = b.id::text
  and p.status = 'paid'
  and p.purpose = 'seat_booking'
  and b.pricing_model = 'legacy_commission_v0'
  and b.gateway_collected_paise = 0;

alter table public.payment_intents drop constraint if exists payment_intents_purpose_check;
alter table public.payment_intents add constraint payment_intents_purpose_check
  check (purpose in ('wallet_topup', 'trip', 'advertiser_topup', 'seat_booking'));
alter table public.payment_intents drop constraint if exists payment_intents_status_check;
alter table public.payment_intents add constraint payment_intents_status_check
  check (status in ('created', 'paid', 'failed', 'refunded'));

-- Half-up integer paise. Fee is clamped after the percentage, in paise.
-- GST is 18 percent of that fee by default, never of the seat fare.
create or replace function public.seat_fee_paise(p_fare_paise bigint)
returns table (fee_paise bigint, gst_paise bigint)
language plpgsql
stable
set search_path = public
as $$
declare
  v_percent integer := greatest(0, public.setting_num('booking_fee_percent', 10)::integer);
  v_floor bigint := greatest(0, public.setting_num('booking_fee_floor', 79)::bigint) * 100;
  v_cap bigint := greatest(v_floor, public.setting_num('booking_fee_cap', 149)::bigint * 100);
  v_gst_pct integer := greatest(0, public.setting_num('booking_fee_gst_percent', 18)::integer);
  v_raw bigint;
  v_fee bigint;
begin
  v_raw := (greatest(coalesce(p_fare_paise, 0), 0) * v_percent + 50) / 100;
  v_fee := least(v_cap, greatest(v_floor, v_raw));
  fee_paise := v_fee;
  gst_paise := (v_fee * v_gst_pct + 50) / 100;
  return next;
end;
$$;

revoke all on function public.seat_fee_paise(bigint) from public, anon, authenticated;
grant execute on function public.seat_fee_paise(bigint) to service_role;

create or replace function public.seat_book(p_rider uuid, p_trip uuid, p_travellers jsonb, p_boarding jsonb, p_drop jsonb, p_phone text, p_email text, p_secured boolean, p_coupon uuid, p_discount integer, p_use_cash boolean)
returns public.seat_bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.seat_trips;
  v_booking public.seat_bookings;
  v_item jsonb;
  v_seat public.seat_trip_seats;
  v_ids text[] := '{}';
  v_fare bigint := 0;
  v_fee bigint := 0;
  v_line_fee bigint;
  v_line_gst bigint;
  v_count integer;
  v_gst bigint := 0;
  v_secure bigint;
  v_discount bigint;
  v_before bigint;
  v_cash bigint := 0;
  v_balance bigint;
  v_limit integer;
  v_used integer;
begin
  select * into v_trip from public.seat_trips where id = p_trip for update;
  if not found or v_trip.status <> 'scheduled' then
    raise exception 'trip_closed';
  end if;
  if v_trip.depart_at < now() + interval '10 minutes' then
    raise exception 'trip_departed';
  end if;

  perform public.seat_release_expired(p_trip);

  v_count := jsonb_array_length(p_travellers);
  if v_count < 1 or v_count > 4 then
    raise exception 'seat_count';
  end if;

  for v_item in select value from jsonb_array_elements(p_travellers) loop
    select * into v_seat from public.seat_trip_seats where trip_id = p_trip and seat_id = v_item ->> 'seatId' for update;
    if not found then
      raise exception 'seat_missing';
    end if;
    if v_seat.state <> 'available' then
      raise exception 'seat_taken';
    end if;
    if coalesce(v_item ->> 'gender', '') <> 'Female' and public.seat_women_only(p_trip, v_seat.seat_id) then
      raise exception 'seat_women_only';
    end if;
    v_ids := v_ids || v_seat.seat_id;
    v_fare := v_fare + v_seat.price_paise;
    select f.fee_paise, f.gst_paise into v_line_fee, v_line_gst from public.seat_fee_paise(v_seat.price_paise) f;
    v_fee := v_fee + v_line_fee;
    v_gst := v_gst + v_line_gst;
  end loop;

  if (select count(distinct id) from unnest(v_ids) as id) <> v_count then
    raise exception 'seat_duplicate';
  end if;

  if p_coupon is not null then
    select per_rider_limit into v_limit
    from public.coupons
    where id = p_coupon and active and starts_at <= now() and (ends_at is null or ends_at > now())
      and (max_redemptions is null or redeemed_count < max_redemptions);
    if not found then
      raise exception 'coupon_unavailable';
    end if;
    select count(*) into v_used from public.seat_bookings
    where rider_id = p_rider and coupon_id = p_coupon and status in ('pending', 'confirmed', 'completed');
    if v_used >= v_limit then
      raise exception 'coupon_used';
    end if;
  end if;

  v_secure := case when p_secured then 1900 * v_count else 0 end;
  v_discount := least(greatest(coalesce(p_discount, 0), 0), v_fare);
  v_before := greatest(0, v_fare + v_fee + v_gst + v_secure - v_discount);
  if p_use_cash then
    select balance_paise into v_balance from public.wallets where owner_id = p_rider;
    v_cash := least(greatest(coalesce(v_balance, 0), 0), (v_before * 20) / 100);
    v_cash := (v_cash / 100) * 100;
  end if;

  insert into public.seat_bookings (
    trip_id, rider_id, phone, email, seat_ids, travellers, boarding, drop_point,
    fare_paise, fee_paise, gst_paise, secure_paise, discount_paise, cash_paise, total_paise,
    secured, coupon_id, hold_until, pricing_model
  ) values (
    p_trip, p_rider, p_phone, nullif(btrim(coalesce(p_email, '')), ''), v_ids, p_travellers, p_boarding, p_drop,
    v_fare, v_fee, v_gst, v_secure, v_discount, v_cash, v_before - v_cash,
    p_secured, p_coupon, now() + make_interval(mins => public.setting_num('seat_hold_minutes', 10)::int),
    'booking_fee_v1'
  )
  returning * into v_booking;

  update public.seat_trip_seats s
  set state = 'held', gender = t.value ->> 'gender', booking_id = v_booking.id, held_until = v_booking.hold_until
  from jsonb_array_elements(p_travellers) t
  where s.trip_id = p_trip and s.seat_id = t.value ->> 'seatId';

  return v_booking;
end;
$$;

revoke all on function public.seat_book(uuid, uuid, jsonb, jsonb, jsonb, text, text, boolean, uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.seat_book(uuid, uuid, jsonb, jsonb, jsonb, text, text, boolean, uuid, integer, boolean) to service_role;

drop function if exists public.seat_confirm(uuid, text, boolean);

create or replace function public.seat_confirm(
  p_booking uuid,
  p_paid_with text,
  p_from_wallet boolean default false,
  p_gateway_paise bigint default null,
  p_gateway_payment_id text default null
)
returns public.seat_bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.seat_bookings;
  v_trip public.seat_trips;
  v_taken integer;
  v_ref text;
  v_wallet bigint := 0;
  v_gateway bigint := 0;
  v_desk bigint := 0;
begin
  select * into v from public.seat_bookings where id = p_booking for update;
  if not found then
    raise exception 'booking_missing';
  end if;
  if v.status in ('confirmed', 'completed') then
    return v;
  end if;
  if v.status not in ('pending', 'expired') then
    raise exception 'booking_closed';
  end if;
  select * into v_trip from public.seat_trips where id = v.trip_id for update;
  if v_trip.status <> 'scheduled' then
    raise exception 'trip_closed';
  end if;
  select count(*) into v_taken from public.seat_trip_seats
  where trip_id = v.trip_id and seat_id = any (v.seat_ids)
    and not (state = 'available' or (state = 'held' and booking_id = v.id));
  if v_taken > 0 then
    raise exception 'seat_taken';
  end if;

  v_ref := v.id::text;
  if p_from_wallet and coalesce(p_gateway_paise, 0) > 0 then
    raise exception 'payment_split';
  end if;
  if p_from_wallet and v.total_paise > 0 then
    perform public.ledger_post(v.rider_id, 'seat_payment', -v.total_paise, 'seat_booking', v_ref, 'Seats on ' || v.pnr);
    perform public.ledger_post(public.platform_wallet(), 'seat_payment', v.total_paise, 'seat_booking', v_ref);
    v_wallet := v_wallet + v.total_paise;
  end if;
  if v.cash_paise > 0 then
    perform public.ledger_post(v.rider_id, 'seat_payment', -v.cash_paise, 'seat_cash', v_ref, 'ROVEYA Cash on ' || v.pnr);
    perform public.ledger_post(public.platform_wallet(), 'seat_payment', v.cash_paise, 'seat_cash', v_ref);
    v_wallet := v_wallet + v.cash_paise;
  end if;
  if coalesce(p_gateway_paise, 0) > 0 then
    if p_gateway_paise <> v.total_paise then
      raise exception 'gateway_amount';
    end if;
    v_gateway := p_gateway_paise;
  end if;
  if p_paid_with = 'Desk · cash' then
    v_desk := v.total_paise;
  end if;

  update public.seat_trip_seats s
  set state = 'booked', booking_id = v.id, held_until = null,
      gender = (select t.value ->> 'gender' from jsonb_array_elements(v.travellers) t where t.value ->> 'seatId' = s.seat_id limit 1)
  where s.trip_id = v.trip_id and s.seat_id = any (v.seat_ids);

  update public.seat_bookings
  set status = 'confirmed',
      paid_with = p_paid_with,
      confirmed_at = now(),
      hold_until = greatest(hold_until, now()),
      wallet_collected_paise = wallet_collected_paise + v_wallet,
      gateway_collected_paise = gateway_collected_paise + v_gateway,
      desk_collected_paise = desk_collected_paise + v_desk,
      gateway_payment_id = coalesce(nullif(btrim(coalesce(p_gateway_payment_id, '')), ''), gateway_payment_id)
  where id = v.id
  returning * into v;

  if v.coupon_id is not null then
    update public.coupons set redeemed_count = redeemed_count + 1 where id = v.coupon_id;
  end if;

  perform public.seat_push(v_trip.captain_id, 'captain', 'New booking · ' || array_to_string(v.seat_ids, ', '),
    v.pnr || ' on ' || v_trip.code || ' · ' || jsonb_array_length(v.travellers) || ' traveller(s) from ' || coalesce(v.boarding ->> 'name', 'boarding'),
    jsonb_build_object('tripId', v_trip.id, 'bookingId', v.id));
  perform public.seat_push(v.rider_id, 'rider', 'Seats confirmed · ' || v.pnr,
    'Seats ' || array_to_string(v.seat_ids, ', ') || '. Captain details arrive 2 hours before boarding.',
    jsonb_build_object('pnr', v.pnr, 'bookingId', v.id));
  return v;
end;
$$;

revoke all on function public.seat_confirm(uuid, text, boolean, bigint, text) from public, anon, authenticated;
grant execute on function public.seat_confirm(uuid, text, boolean, bigint, text) to service_role;

create or replace function public.seat_cancel(p_booking uuid, p_by text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.seat_bookings;
  v_trip public.seat_trips;
  v_hours numeric;
  v_pct integer;
  v_collected bigint;
  v_base bigint;
  v_target bigint := 0;
  v_wallet_pool bigint;
  v_gateway_pool bigint;
  v_pools bigint;
  v_wallet_part bigint := 0;
  v_gateway_part bigint := 0;
begin
  select * into v from public.seat_bookings where id = p_booking for update;
  if not found then
    raise exception 'booking_missing';
  end if;
  if v.status = 'cancelled' then
    return coalesce(v.refund_paise, 0);
  end if;
  if v.status = 'pending' then
    update public.seat_bookings
    set status = 'cancelled', cancelled_at = now(), cancelled_by = p_by, refund_paise = 0
    where id = v.id;
    update public.seat_trip_seats
    set state = 'available', gender = null, booking_id = null, held_until = null
    where trip_id = v.trip_id and booking_id = v.id;
    return 0;
  end if;
  if v.status <> 'confirmed' then
    raise exception 'booking_closed';
  end if;

  select * into v_trip from public.seat_trips where id = v.trip_id for update;
  v_collected := v.wallet_collected_paise + v.gateway_collected_paise + v.desk_collected_paise;
  v_wallet_pool := greatest(0, v.wallet_collected_paise + v.desk_collected_paise - v.wallet_refunded_paise);
  v_gateway_pool := greatest(0, v.gateway_collected_paise - v.gateway_refund_paise);
  v_pools := v_wallet_pool + v_gateway_pool;

  if v_collected <= 0 or v_pools <= 0 then
    v_target := 0;
  elsif p_by = 'rider' then
    if v_trip.status <> 'scheduled' then
      raise exception 'trip_started';
    end if;
    v_hours := extract(epoch from (v_trip.depart_at - now())) / 3600.0;
    v_pct := case
      when v.secured and v_hours >= 6 then 100
      when v_hours >= 48 then 100
      when v_hours >= 24 then 90
      when v_hours >= 6 then 75
      when v_hours >= 2 then 50
      else 0
    end;
    v_base := greatest(0, v_collected - v.secure_paise);
    v_target := round(v_base * v_pct / 100.0 / 100.0) * 100;
  else
    v_target := v_collected;
  end if;
  if v_target > v_pools then
    v_target := v_pools;
  end if;
  if v_target < 0 then
    v_target := 0;
  end if;

  if v_target > 0 and v_pools > 0 then
    v_wallet_part := least(v_wallet_pool, (v_target * v_wallet_pool) / v_pools);
    v_gateway_part := least(v_gateway_pool, v_target - v_wallet_part);
    if v_wallet_part + v_gateway_part < v_target then
      v_gateway_part := least(v_gateway_pool, v_target - v_wallet_part);
      v_wallet_part := least(v_wallet_pool, v_target - v_gateway_part);
    end if;
  end if;

  if v_wallet_part > 0 then
    perform public.ledger_post(v.rider_id, 'seat_refund', v_wallet_part, 'seat_booking', v.id::text, 'Refund for ' || v.pnr);
    perform public.ledger_post(public.platform_wallet(), 'seat_refund', -v_wallet_part, 'seat_booking', v.id::text, null, true);
  end if;

  update public.seat_trip_seats
  set state = 'available', gender = null, booking_id = null, held_until = null
  where trip_id = v.trip_id and booking_id = v.id;
  update public.seat_bookings
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = p_by,
      refund_paise = v_wallet_part + v_gateway_part,
      wallet_refunded_paise = wallet_refunded_paise + v_wallet_part,
      gateway_refund_paise = gateway_refund_paise + v_gateway_part
  where id = v.id;

  if p_by = 'rider' then
    perform public.seat_push(v_trip.captain_id, 'captain', 'Booking cancelled · ' || array_to_string(v.seat_ids, ', '),
      v.pnr || ' on ' || v_trip.code || '. The seats are open for booking again.', jsonb_build_object('tripId', v_trip.id));
  else
    perform public.seat_push(v.rider_id, 'rider', 'Your trip was cancelled',
      v.pnr || ' was cancelled.', jsonb_build_object('pnr', v.pnr));
  end if;
  return v_wallet_part + v_gateway_part;
end;
$$;

revoke all on function public.seat_cancel(uuid, text) from public, anon, authenticated;
grant execute on function public.seat_cancel(uuid, text) to service_role;

create or replace function public.seat_trip_complete(p_trip uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.seat_trips;
  v_net bigint;
begin
  update public.seat_trips set status = 'completed', completed_at = now()
  where id = p_trip and status in ('scheduled', 'on_trip')
  returning * into v;
  if not found then
    raise exception 'trip_closed';
  end if;
  update public.seat_bookings set status = 'completed' where trip_id = p_trip and status = 'confirmed';
  update public.seat_bookings set status = 'expired' where trip_id = p_trip and status = 'pending';
  select coalesce(sum(
    case
      when pricing_model = 'booking_fee_v1'
        and (wallet_collected_paise + gateway_collected_paise + desk_collected_paise) > 0
        then fare_paise
      when pricing_model = 'legacy_commission_v0'
        then fare_paise - round(fare_paise * public.setting_num('seat_commission_pct', 10) / 100.0)::bigint
      else 0
    end
  ), 0) into v_net
  from public.seat_bookings
  where trip_id = p_trip and status = 'completed';
  if v_net > 0 then
    perform public.ledger_post(v.captain_id, 'seat_earning', v_net, 'seat_trip', p_trip::text, 'Seats on ' || v.code);
    perform public.ledger_post(public.platform_wallet(), 'seat_earning', -v_net, 'seat_trip', p_trip::text, null, true);
  end if;
  return v_net;
end;
$$;

revoke all on function public.seat_trip_complete(uuid) from public, anon, authenticated;
grant execute on function public.seat_trip_complete(uuid) to service_role;

create schema if not exists admin_controls;

create or replace view admin_controls.seat_booking_facts as
select
  b.id,
  b.pnr,
  b.status,
  b.trip_id,
  t.code as trip_code,
  t.from_city,
  t.to_city,
  t.depart_at,
  t.captain_id,
  b.rider_id,
  b.phone,
  cardinality(b.seat_ids) as seats,
  b.seat_ids,
  b.paid_with,
  b.coupon_id,
  b.created_at,
  b.confirmed_at,
  b.cancelled_at,
  b.cancelled_by,
  (coalesce(b.confirmed_at, b.created_at) at time zone 'Asia/Kolkata')::date as day,
  b.fare_paise,
  b.gst_paise,
  b.secure_paise,
  b.discount_paise,
  b.cash_paise,
  b.total_paise,
  case
    when b.pricing_model = 'booking_fee_v1'
      then (b.wallet_collected_paise + b.gateway_collected_paise + b.desk_collected_paise)
    else (b.total_paise + b.cash_paise)
  end as paid_paise,
  coalesce(b.refund_paise, 0) as refund_paise,
  case
    when b.status in ('confirmed', 'completed') and b.pricing_model = 'booking_fee_v1'
      and (b.wallet_collected_paise + b.gateway_collected_paise + b.desk_collected_paise) > 0
      then b.fee_paise
    when b.status in ('confirmed', 'completed') and b.pricing_model = 'legacy_commission_v0'
      then round(b.fare_paise * public.setting_num('seat_commission_pct', 10) / 100.0)::bigint
    else 0
  end as commission_paise,
  case
    when b.status in ('confirmed', 'completed') and b.pricing_model = 'booking_fee_v1'
      and (b.wallet_collected_paise + b.gateway_collected_paise + b.desk_collected_paise) > 0
      then b.fare_paise
    when b.status in ('confirmed', 'completed') and b.pricing_model = 'legacy_commission_v0'
      then (b.fare_paise - round(b.fare_paise * public.setting_num('seat_commission_pct', 10) / 100.0))::bigint
    else 0
  end as captain_share_paise,
  case
    when b.status = 'cancelled' and b.confirmed_at is not null and b.pricing_model = 'booking_fee_v1'
      then greatest(0, b.wallet_collected_paise + b.gateway_collected_paise + b.desk_collected_paise - coalesce(b.refund_paise, 0))::bigint
    when b.status = 'cancelled' and b.confirmed_at is not null
      then greatest(0, b.total_paise + b.cash_paise - coalesce(b.refund_paise, 0))::bigint
    else 0
  end as kept_on_cancel_paise,
  case
    when b.status in ('confirmed', 'completed') and b.pricing_model = 'booking_fee_v1'
      and (b.wallet_collected_paise + b.gateway_collected_paise + b.desk_collected_paise) > 0
      then (b.fee_paise + b.secure_paise - b.discount_paise)::bigint
    when b.status in ('confirmed', 'completed') and b.pricing_model = 'legacy_commission_v0'
      then (round(b.fare_paise * public.setting_num('seat_commission_pct', 10) / 100.0) + b.secure_paise - b.discount_paise)::bigint
    when b.status = 'cancelled' and b.confirmed_at is not null and b.pricing_model = 'booking_fee_v1'
      then greatest(0, b.wallet_collected_paise + b.gateway_collected_paise + b.desk_collected_paise - coalesce(b.refund_paise, 0))::bigint
    when b.status = 'cancelled' and b.confirmed_at is not null
      then greatest(0, b.total_paise + b.cash_paise - coalesce(b.refund_paise, 0))::bigint
    else 0
  end as profit_paise
from public.seat_bookings b
join public.seat_trips t on t.id = b.trip_id;
