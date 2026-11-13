-- ROVEYA operations: push notifications, fare quotes and coupons that the
-- server charges exactly, captain document review, passenger blocks, the
-- support desk, and fares the desk can edit.
-- Run after 20261021100000_mobile_platform.sql.

create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Desk-editable fares and bonuses
-- ---------------------------------------------------------------------------

insert into public.platform_settings (key, value) values
  ('fare_bike_base', '25'), ('fare_bike_per_km', '7'), ('fare_bike_min', '35'),
  ('fare_auto_base', '40'), ('fare_auto_per_km', '13'), ('fare_auto_min', '60'),
  ('fare_cab_base', '60'), ('fare_cab_per_km', '16'), ('fare_cab_min', '90'),
  ('peak_bonus_paise', '1000'),
  ('long_pickup_bonus_paise', '1500'),
  ('long_pickup_km', '2.5'),
  ('quote_ttl_minutes', '10')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- People: passenger blocks, captain suspension notes, document review
-- ---------------------------------------------------------------------------

alter table public.riders add column if not exists status text not null default 'active' check (status in ('active', 'blocked'));
alter table public.riders add column if not exists status_note text check (status_note is null or char_length(status_note) <= 200);
alter table public.captains add column if not exists status_note text check (status_note is null or char_length(status_note) <= 200);

-- Document photos: JPEG/PNG/WebP up to 6 MB.
update storage.buckets
set file_size_limit = 6291456, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'captain-documents';

alter table public.captain_documents add column if not exists review_note text check (review_note is null or char_length(review_note) <= 200);
alter table public.captain_documents add column if not exists reviewed_at timestamptz;
alter table public.captain_documents add column if not exists reviewed_by uuid references public.admin_users (id);

-- ---------------------------------------------------------------------------
-- Coupons and fare quotes
-- ---------------------------------------------------------------------------

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{3,20}$'),
  title text not null check (char_length(btrim(title)) between 3 and 80),
  description text check (description is null or char_length(description) <= 240),
  kind text not null check (kind in ('flat', 'percent')),
  value integer not null check (value > 0),
  max_discount_paise integer check (max_discount_paise is null or max_discount_paise > 0),
  min_fare_paise integer not null default 0 check (min_fare_paise >= 0),
  vehicles text[] not null default '{}',
  new_riders_only boolean not null default false,
  per_rider_limit integer not null default 1 check (per_rider_limit between 1 and 100),
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redeemed_count integer not null default 0,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  active boolean not null default true,
  listed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'percent' or value <= 100),
  check (ends_at is null or ends_at > starts_at)
);

create trigger coupons_touch before update on public.coupons for each row execute function public.touch_updated_at();

create table public.fare_quotes (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders (user_id) on delete cascade,
  pickup_name text not null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  drop_name text not null,
  drop_lat double precision not null,
  drop_lng double precision not null,
  distance_km numeric(7, 2) not null check (distance_km > 0),
  duration_min integer not null check (duration_min > 0),
  route_source text not null default 'estimate' check (route_source in ('google', 'osrm', 'estimate')),
  options jsonb not null,
  coupon_id uuid references public.coupons (id),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index fare_quotes_rider on public.fare_quotes (rider_id, created_at desc);

alter table public.trips add column if not exists quote_id uuid references public.fare_quotes (id) on delete set null;
alter table public.trips add column if not exists coupon_id uuid references public.coupons (id);
alter table public.trips add column if not exists discount_paise integer not null default 0 check (discount_paise >= 0);
alter table public.trips add column if not exists route_source text not null default 'estimate';
alter table public.trips drop constraint if exists trips_discount_within_fare;
alter table public.trips add constraint trips_discount_within_fare check (discount_paise <= fare_paise);

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id),
  rider_id uuid not null references public.riders (user_id) on delete cascade,
  trip_id uuid not null unique references public.trips (id) on delete cascade,
  discount_paise integer not null check (discount_paise > 0),
  status text not null default 'held' check (status in ('held', 'used', 'released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index coupon_redemptions_rider on public.coupon_redemptions (coupon_id, rider_id) where status <> 'released';
create trigger coupon_redemptions_touch before update on public.coupon_redemptions for each row execute function public.touch_updated_at();

-- Holds one use of a coupon for a trip, checking every limit under a row lock.
create or replace function public.redeem_coupon(p_coupon uuid, p_rider uuid, p_trip uuid, p_discount integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.coupons;
  v_used integer;
begin
  select * into v from public.coupons where id = p_coupon for update;
  if not found or not v.active or v.starts_at > now() or (v.ends_at is not null and v.ends_at <= now()) then
    raise exception 'coupon_unavailable';
  end if;
  if v.max_redemptions is not null and v.redeemed_count >= v.max_redemptions then
    raise exception 'coupon_unavailable';
  end if;
  select count(*) into v_used from public.coupon_redemptions where coupon_id = p_coupon and rider_id = p_rider and status <> 'released';
  if v_used >= v.per_rider_limit then
    raise exception 'coupon_used';
  end if;
  insert into public.coupon_redemptions (coupon_id, rider_id, trip_id, discount_paise) values (p_coupon, p_rider, p_trip, p_discount);
  update public.coupons set redeemed_count = redeemed_count + 1 where id = p_coupon;
end;
$$;

-- A cancelled or unmatched ride gives the coupon back; a completed ride uses it.
create or replace function public.trips_coupon()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.coupon_id is null or new.status is not distinct from old.status then
    return new;
  end if;
  if new.status in ('cancelled', 'expired') then
    update public.coupon_redemptions set status = 'released' where trip_id = new.id and status = 'held';
    if found then
      update public.coupons set redeemed_count = greatest(0, redeemed_count - 1) where id = new.coupon_id;
    end if;
  elsif new.status = 'completed' then
    update public.coupon_redemptions set status = 'used' where trip_id = new.id and status = 'held';
  end if;
  return new;
end;
$$;

create trigger trips_coupon after update of status on public.trips for each row execute function public.trips_coupon();

-- ---------------------------------------------------------------------------
-- Ledger: coupon cost is a 'promo' line, refunds already exist
-- ---------------------------------------------------------------------------

alter table public.ledger_entries drop constraint if exists ledger_entries_kind_check;
alter table public.ledger_entries add constraint ledger_entries_kind_check check (kind in (
  'topup', 'ride_payment', 'ride_earning', 'ride_bonus', 'commission', 'payout', 'payout_reversal',
  'ad_spend', 'advertiser_topup', 'refund', 'adjustment', 'promo'
));

-- Commission is on the full fare. On a cash ride the captain collected the
-- discounted amount, so ROVEYA pays the coupon back into the captain's wallet.
create or replace function public.settle_trip(p_trip uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.trips;
  v_commission bigint;
  v_ref text;
begin
  select * into v from public.trips where id = p_trip;
  if not found or v.status <> 'completed' or v.captain_id is null then
    return;
  end if;
  v_ref := v.id::text;
  v_commission := round(v.fare_paise * public.setting_num('commission_pct', 0) / 100.0);
  if v.payment = 'cash' then
    perform public.ledger_post(v.captain_id, 'commission', -v_commission, 'trip', v_ref, 'Commission on a cash ride', true);
    perform public.ledger_post(public.platform_wallet(), 'commission', v_commission, 'trip', v_ref);
    if v.discount_paise > 0 then
      perform public.ledger_post(v.captain_id, 'promo', v.discount_paise, 'trip', v_ref, 'Coupon paid by ROVEYA on ' || v.code);
      perform public.ledger_post(public.platform_wallet(), 'promo', -v.discount_paise, 'trip', v_ref, null, true);
    end if;
  else
    perform public.ledger_post(v.captain_id, 'ride_earning', v.fare_paise - v_commission, 'trip', v_ref, 'Online ride ' || v.code);
    perform public.ledger_post(public.platform_wallet(), 'ride_earning', -(v.fare_paise - v_commission), 'trip', v_ref, null, true);
  end if;
  if v.bonus_paise > 0 then
    perform public.ledger_post(v.captain_id, 'ride_bonus', v.bonus_paise, 'trip', v_ref, 'Ride bonus ' || v.code);
    perform public.ledger_post(public.platform_wallet(), 'ride_bonus', -v.bonus_paise, 'trip', v_ref, null, true);
  end if;
end;
$$;

-- Long-pickup bonus now follows the desk settings.
create or replace function public.accept_offer(p_offer uuid, p_captain uuid)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.trip_offers;
  v_trip public.trips;
begin
  select * into v_offer from public.trip_offers where id = p_offer and captain_id = p_captain for update;
  if not found then
    raise exception 'offer_not_found';
  end if;
  if v_offer.status <> 'offered' or v_offer.expires_at < now() - interval '2 seconds' then
    raise exception 'offer_closed';
  end if;
  select * into v_trip from public.trips where id = v_offer.trip_id for update;
  if v_trip.status <> 'searching' then
    raise exception 'trip_taken';
  end if;
  update public.trip_offers set status = 'accepted', decided_at = now() where id = p_offer;
  update public.trip_offers set status = 'withdrawn', decided_at = now()
  where trip_id = v_trip.id and id <> p_offer and status = 'offered';
  update public.trips
  set status = 'assigned',
      captain_id = p_captain,
      assigned_at = now(),
      bonus_paise = bonus_paise + case
        when v_offer.pickup_km > public.setting_num('long_pickup_km', 2.5) then public.setting_num('long_pickup_bonus_paise', 1500)::int
        else 0
      end,
      updated_at = now()
  where id = v_trip.id
  returning * into v_trip;
  return v_trip;
end;
$$;

-- Trip events now carry the discount so analytics can total coupon spend.
create or replace function public.trips_emit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform public.emit_event('trip.' || new.status, new.id::text, jsonb_build_object(
      'trip_id', new.id, 'code', new.code, 'vehicle', new.vehicle, 'rider_id', new.rider_id,
      'captain_id', new.captain_id, 'fare_paise', new.fare_paise, 'bonus_paise', new.bonus_paise,
      'discount_paise', new.discount_paise, 'payment', new.payment, 'cancelled_by', new.cancelled_by,
      'distance_km', new.distance_km
    ));
  end if;
  return new;
end;
$$;

create or replace function public.consume_analytics(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last bigint;
  v_max bigint;
  v_count integer := 0;
  v_day date;
  e record;
begin
  select last_id into v_last from public.event_offsets where consumer = 'analytics' for update skip locked;
  if not found then
    return 0;
  end if;
  for e in select * from public.events where id > v_last order by id limit p_limit loop
    v_day := (e.created_at at time zone 'Asia/Kolkata')::date;
    case e.topic
      when 'trip.searching' then perform public.analytics_bump(v_day, 'trips_requested', e.payload ->> 'vehicle', 1);
      when 'trip.assigned' then perform public.analytics_bump(v_day, 'trips_assigned', e.payload ->> 'vehicle', 1);
      when 'trip.completed' then
        perform public.analytics_bump(v_day, 'trips_completed', e.payload ->> 'vehicle', 1);
        perform public.analytics_bump(v_day, 'gmv_paise', e.payload ->> 'vehicle', (e.payload ->> 'fare_paise')::numeric);
        if coalesce((e.payload ->> 'discount_paise')::numeric, 0) > 0 then
          perform public.analytics_bump(v_day, 'discount_paise', e.payload ->> 'vehicle', (e.payload ->> 'discount_paise')::numeric);
        end if;
      when 'trip.cancelled' then perform public.analytics_bump(v_day, 'trips_cancelled', e.payload ->> 'cancelled_by', 1);
      when 'trip.expired' then perform public.analytics_bump(v_day, 'trips_unmatched', e.payload ->> 'vehicle', 1);
      when 'payment.captured' then perform public.analytics_bump(v_day, 'payments_paise', e.payload ->> 'purpose', (e.payload ->> 'amount_paise')::numeric);
      when 'payout.requested' then perform public.analytics_bump(v_day, 'payouts_requested_paise', '', (e.payload ->> 'amount_paise')::numeric);
      when 'rider.signed_up' then perform public.analytics_bump(v_day, 'riders_signed_up', '', 1);
      when 'captain.registered' then perform public.analytics_bump(v_day, 'captains_registered', e.payload ->> 'city', 1);
      when 'ad.impression' then
        perform public.analytics_bump(v_day, 'ad_impressions', e.payload ->> 'campaign_id', 1);
        perform public.analytics_bump(v_day, 'ad_revenue_paise', e.payload ->> 'campaign_id', (e.payload ->> 'price_paise')::numeric);
      when 'ad.click' then
        perform public.analytics_bump(v_day, 'ad_clicks', e.payload ->> 'campaign_id', 1);
        perform public.analytics_bump(v_day, 'ad_revenue_paise', e.payload ->> 'campaign_id', (e.payload ->> 'price_paise')::numeric);
      else null;
    end case;
    v_max := e.id;
    v_count := v_count + 1;
  end loop;
  if v_max is not null then
    update public.event_offsets set last_id = v_max, updated_at = now() where consumer = 'analytics';
  end if;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Support desk
-- ---------------------------------------------------------------------------

create sequence public.support_ticket_seq start 1001;

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('ST-' || nextval('public.support_ticket_seq')),
  app text not null check (app in ('rider', 'captain')),
  user_id uuid not null references auth.users (id) on delete cascade,
  trip_id uuid references public.trips (id) on delete set null,
  trip_code text check (trip_code is null or char_length(trip_code) <= 20),
  topic text not null check (char_length(btrim(topic)) between 2 and 60),
  status text not null default 'open' check (status in ('open', 'pending', 'resolved', 'closed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid references public.admin_users (id),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_tickets_queue on public.support_tickets (status, last_message_at desc);
create index support_tickets_user on public.support_tickets (user_id, created_at desc);
create trigger support_tickets_touch before update on public.support_tickets for each row execute function public.touch_updated_at();

create table public.support_messages (
  id bigserial primary key,
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author text not null check (author in ('user', 'staff')),
  staff_id uuid references public.admin_users (id),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index support_messages_ticket on public.support_messages (ticket_id, id);

-- ---------------------------------------------------------------------------
-- Push notifications through the Expo push service, sent by pg_net after commit
-- ---------------------------------------------------------------------------

create table public.push_tokens (
  token text primary key check (char_length(token) between 10 and 200),
  user_id uuid not null references auth.users (id) on delete cascade,
  app text not null check (app in ('rider', 'captain')),
  platform text not null check (platform in ('android', 'ios', 'web')),
  updated_at timestamptz not null default now()
);

create index push_tokens_user on public.push_tokens (user_id, app);

create table public.push_log (
  id bigserial primary key,
  user_id uuid,
  app text not null,
  kind text not null,
  title text not null,
  body text not null,
  devices integer not null default 0,
  request_id bigint,
  created_at timestamptz not null default now()
);

create index push_log_recent on public.push_log (created_at desc);

create or replace function public.push_send(
  p_user uuid,
  p_app text,
  p_kind text,
  p_title text,
  p_body text,
  p_data jsonb default '{}',
  p_channel text default 'default',
  p_ttl integer default 3600
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_messages jsonb;
  v_count integer;
  v_request bigint;
  v_headers jsonb := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb;
  v_token text := (select value from public.platform_settings where key = 'expo_access_token');
begin
  select
    jsonb_agg(jsonb_build_object(
      'to', token, 'title', p_title, 'body', p_body, 'sound', 'default', 'priority', 'high',
      'channelId', p_channel, 'ttl', p_ttl, 'data', coalesce(p_data, '{}'::jsonb) || jsonb_build_object('kind', p_kind)
    )),
    count(*)
  into v_messages, v_count
  from public.push_tokens
  where user_id = p_user and app = p_app and platform <> 'web';
  if coalesce(v_count, 0) = 0 then
    return 0;
  end if;
  if coalesce(v_token, '') <> '' then
    v_headers := v_headers || jsonb_build_object('Authorization', 'Bearer ' || v_token);
  end if;
  begin
    select net.http_post(url := 'https://exp.host/--/api/v2/push/send', body := v_messages, headers := v_headers) into v_request;
  exception when others then
    v_request := null;
  end;
  insert into public.push_log (user_id, app, kind, title, body, devices, request_id) values (p_user, p_app, p_kind, p_title, p_body, v_count, v_request);
  return v_count;
end;
$$;

create or replace function public.rupee_text(p_paise bigint)
returns text
language sql
immutable
as $$
  select '₹' || trim(to_char(round(p_paise / 100.0), 'FM99,99,99,990'));
$$;

-- A new ride request wakes the captain's phone even when the app is closed.
create or replace function public.offers_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.trips;
begin
  select * into v from public.trips where id = new.trip_id;
  if found then
    perform public.push_send(
      new.captain_id, 'captain', 'offer', 'New ride request · ' || public.rupee_text(v.fare_paise),
      v.pickup_name || ' to ' || v.drop_name || ' · ' || new.pickup_km || ' km away',
      jsonb_build_object('offerId', new.id, 'tripId', new.trip_id), 'offers',
      greatest(10, extract(epoch from new.expires_at - now())::int)
    );
  end if;
  return new;
end;
$$;

create trigger trip_offers_push after insert on public.trip_offers for each row execute function public.offers_push();

create or replace function public.trips_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_vehicle text;
  v_payable bigint := new.fare_paise - new.discount_paise;
  v_data jsonb := jsonb_build_object('tripId', new.id, 'code', new.code);
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.captain_id is not null then
    select split_part(name, ' ', 1), vehicle_model || ' · ' || vehicle_no into v_name, v_vehicle from public.captains where user_id = new.captain_id;
  end if;
  case new.status
    when 'assigned' then
      perform public.push_send(new.rider_id, 'rider', 'trip', coalesce(v_name, 'Your captain') || ' is on the way', coalesce(v_vehicle, 'Open the app to track your ride.'), v_data, 'rides');
    when 'arrived' then
      perform public.push_send(new.rider_id, 'rider', 'trip', 'Your captain has arrived', 'Meet ' || coalesce(v_name, 'your captain') || ' at the pickup and share your ride code.', v_data, 'rides');
    when 'on_trip' then
      perform public.push_send(new.rider_id, 'rider', 'trip', 'Ride started', 'Heading to ' || new.drop_name || '. Share your ride from the app.', v_data, 'rides');
    when 'completed' then
      perform public.push_send(new.rider_id, 'rider', 'trip', 'You have arrived', 'Fare ' || public.rupee_text(v_payable) || ' for ' || new.code || '. Rate your captain in the app.', v_data, 'rides');
    when 'expired' then
      perform public.push_send(new.rider_id, 'rider', 'trip', 'Captains are busy right now', 'Try booking again in a minute.', v_data, 'rides');
    when 'cancelled' then
      if new.cancelled_by = 'captain' then
        perform public.push_send(new.rider_id, 'rider', 'trip', 'Your captain cancelled', 'Book again and we will find you another captain.', v_data, 'rides');
      elsif new.cancelled_by = 'system' then
        perform public.push_send(new.rider_id, 'rider', 'trip', 'Ride ' || new.code || ' was cancelled', coalesce(new.cancel_reason, 'The ROVEYA desk cancelled this ride.'), v_data, 'rides');
      end if;
      if new.captain_id is not null and new.cancelled_by <> 'captain' then
        perform public.push_send(new.captain_id, 'captain', 'trip', 'Ride ' || new.code || ' was cancelled', 'Stay on duty for the next request.', v_data, 'offers');
      end if;
    else null;
  end case;
  return new;
end;
$$;

create trigger trips_push after update of status on public.trips for each row execute function public.trips_push();

create or replace function public.payouts_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status = 'paid' then
    perform public.push_send(new.captain_id, 'captain', 'payout', public.rupee_text(new.amount_paise) || ' sent to your bank', 'Bank ••' || new.bank_last4 || coalesce(' · UTR ' || new.reference, ''), jsonb_build_object('payoutId', new.id));
  elsif new.status = 'rejected' then
    perform public.push_send(new.captain_id, 'captain', 'payout', 'Payout returned to your wallet', public.rupee_text(new.amount_paise) || ' is back in your ROVEYA wallet.', jsonb_build_object('payoutId', new.id));
  end if;
  return new;
end;
$$;

create trigger payout_requests_push after update of status on public.payout_requests for each row execute function public.payouts_push();

create or replace function public.captains_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status = 'active' then
    perform public.push_send(new.user_id, 'captain', 'account', 'You are approved', 'Go on duty and start taking rides with ROVEYA.', '{}'::jsonb);
  elsif new.status = 'suspended' then
    perform public.push_send(new.user_id, 'captain', 'account', 'Your captain account is paused', coalesce(new.status_note, 'Call the ROVEYA desk to know more.'), '{}'::jsonb);
  end if;
  return new;
end;
$$;

create trigger captains_push after update of status on public.captains for each row execute function public.captains_push();

create or replace function public.documents_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'rejected' and old.status is distinct from 'rejected' then
    perform public.push_send(new.captain_id, 'captain', 'document', 'Upload a fresh copy', coalesce(new.review_note, 'One of your documents needs a clearer photo.'), jsonb_build_object('kind', new.kind));
  end if;
  return new;
end;
$$;

create trigger captain_documents_push after update of status on public.captain_documents for each row execute function public.documents_push();

create or replace function public.support_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.support_tickets;
begin
  if new.author <> 'staff' then
    return new;
  end if;
  select * into t from public.support_tickets where id = new.ticket_id;
  if found then
    perform public.push_send(t.user_id, t.app, 'support', 'The ROVEYA desk replied · ' || t.code, left(new.body, 120), jsonb_build_object('ticketId', t.id));
  end if;
  return new;
end;
$$;

create trigger support_messages_push after insert on public.support_messages for each row execute function public.support_push();

-- ---------------------------------------------------------------------------
-- Indexes for the desk
-- ---------------------------------------------------------------------------

create index if not exists trips_recent on public.trips (requested_at desc);
create index if not exists payment_intents_owner on public.payment_intents (owner_id, created_at desc);
create index if not exists payout_requests_captain on public.payout_requests (captain_id, created_at desc);
create index if not exists ad_events_campaign_time on public.ad_events (campaign_id, created_at);
create index if not exists captains_status on public.captains (status, created_at);

-- ---------------------------------------------------------------------------
-- Row level security: these tables are read and written by the API only,
-- except owners reading their own tickets and quotes.
-- ---------------------------------------------------------------------------

alter table public.coupons enable row level security;
alter table public.fare_quotes enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.push_tokens enable row level security;
alter table public.push_log enable row level security;

create policy fare_quotes_owner on public.fare_quotes for select to authenticated using (rider_id = auth.uid());
create policy support_tickets_owner on public.support_tickets for select to authenticated using (user_id = auth.uid());
create policy support_messages_owner on public.support_messages for select to authenticated using (
  exists (select 1 from public.support_tickets t where t.id = support_messages.ticket_id and t.user_id = auth.uid())
);
create policy staff_read_support on public.support_tickets for select to authenticated using (public.is_staff());
create policy staff_read_coupons on public.coupons for select to authenticated using (public.is_staff());

revoke execute on function public.redeem_coupon(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.push_send(uuid, text, text, text, text, jsonb, text, integer) from public, anon, authenticated;

-- Old quotes are only needed for a week of support questions.
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'roveya-quote-cleanup';
  perform cron.schedule('roveya-quote-cleanup', '17 3 * * *', $job$delete from public.fare_quotes where created_at < now() - interval '7 days' and used_at is null$job$);
exception
  when undefined_table or invalid_schema_name or undefined_function then null;
end;
$$;

-- A starter coupon the desk can edit or switch off.
insert into public.coupons (code, title, description, kind, value, max_discount_paise, min_fare_paise, new_riders_only, per_rider_limit)
values ('ROVEYA50', '₹50 off your first ride', 'For new passengers on rides of ₹100 or more.', 'flat', 5000, null, 10000, true, 1)
on conflict (code) do nothing;
