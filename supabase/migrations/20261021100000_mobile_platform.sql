-- ROVEYA mobile platform: passenger app, captain app, wallet ledger, payments,
-- ad services, and the event outbox that feeds analytics and billing.
-- Run in the Supabase SQL editor after the earlier migrations.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

create table public.platform_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (key, value) values
  ('commission_pct', '10'),
  ('match_radius_km', '6'),
  ('offer_ttl_seconds', '15'),
  ('ad_reserve_cpm_paise', '2000')
on conflict (key) do nothing;

create or replace function public.setting_num(p_key text, p_default numeric)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select value::numeric from public.platform_settings where key = p_key), p_default);
$$;

-- ---------------------------------------------------------------------------
-- Sign-in codes (service role only)
-- ---------------------------------------------------------------------------

create table public.app_otps (
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  app text not null check (app in ('rider', 'captain')),
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  sent_count integer not null default 1,
  window_started_at timestamptz not null default now(),
  primary key (phone, app)
);

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

create table public.riders (
  user_id uuid primary key references auth.users (id) on delete cascade,
  phone text not null unique check (phone ~ '^[6-9][0-9]{9}$'),
  name text not null default 'ROVEYA rider' check (char_length(btrim(name)) between 2 and 80),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence public.captain_code_seq start 100001;

create table public.captains (
  user_id uuid primary key references auth.users (id) on delete cascade,
  captain_code text not null unique default ('RC' || nextval('public.captain_code_seq')),
  phone text not null unique check (phone ~ '^[6-9][0-9]{9}$'),
  name text not null check (char_length(btrim(name)) between 3 and 80),
  dob date not null,
  gender text not null check (gender in ('Male', 'Female', 'Other')),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  city text not null,
  vehicle text not null check (vehicle in ('bike', 'auto', 'cab')),
  vehicle_no text not null unique check (vehicle_no ~ '^[A-Z]{2} ?[0-9]{1,2} ?[A-Z]{0,3} ?[0-9]{3,4}$'),
  vehicle_model text not null,
  vehicle_color text not null,
  vehicle_year text not null,
  bank_holder text not null,
  bank_last4 text not null check (bank_last4 ~ '^[0-9]{4}$'),
  ifsc text not null check (ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  upi text,
  emergency_name text not null,
  emergency_phone text not null check (emergency_phone ~ '^[6-9][0-9]{9}$'),
  status text not null default 'review' check (status in ('review', 'active', 'suspended')),
  rating numeric(3, 2) not null default 5.00,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.captain_documents (
  captain_id uuid not null references public.captains (user_id) on delete cascade,
  kind text not null check (kind in ('dlFront', 'dlBack', 'rc', 'aadhaar', 'pan', 'selfie')),
  status text not null default 'uploaded' check (status in ('uploaded', 'verified', 'rejected')),
  storage_path text,
  updated_at timestamptz not null default now(),
  primary key (captain_id, kind)
);

create table public.captain_presence (
  captain_id uuid primary key references public.captains (user_id) on delete cascade,
  online boolean not null default false,
  vehicle text not null check (vehicle in ('bike', 'auto', 'cab')),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  heading real not null default 0,
  auto_accept boolean not null default false,
  online_since timestamptz,
  updated_at timestamptz not null default now()
);

create index captain_presence_online on public.captain_presence (vehicle) where online;

-- ---------------------------------------------------------------------------
-- Trips
-- ---------------------------------------------------------------------------

create sequence public.trip_number_seq start 10001;

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('RV-' || nextval('public.trip_number_seq')),
  rider_id uuid not null references public.riders (user_id),
  captain_id uuid references public.captains (user_id),
  vehicle text not null check (vehicle in ('bike', 'auto', 'cab')),
  pickup_name text not null,
  pickup_lat double precision not null check (pickup_lat between -90 and 90),
  pickup_lng double precision not null check (pickup_lng between -180 and 180),
  drop_name text not null,
  drop_lat double precision not null check (drop_lat between -90 and 90),
  drop_lng double precision not null check (drop_lng between -180 and 180),
  distance_km numeric(7, 2) not null check (distance_km > 0 and distance_km < 500),
  eta_min integer not null check (eta_min > 0),
  fare_paise integer not null check (fare_paise > 0),
  bonus_paise integer not null default 0 check (bonus_paise >= 0),
  payment text not null check (payment in ('cash', 'wallet', 'online')),
  payment_status text not null default 'due' check (payment_status in ('due', 'paid', 'failed', 'refunded')),
  status text not null default 'searching' check (status in ('searching', 'assigned', 'arrived', 'on_trip', 'completed', 'cancelled', 'expired')),
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 120),
  cancelled_by text check (cancelled_by in ('rider', 'captain', 'system')),
  requested_at timestamptz not null default now(),
  assigned_at timestamptz,
  arrived_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now()
);

create index trips_rider_recent on public.trips (rider_id, requested_at desc);
create index trips_captain_recent on public.trips (captain_id, requested_at desc);
create index trips_open on public.trips (status) where status in ('searching', 'assigned', 'arrived', 'on_trip');
create unique index trips_one_open_per_rider on public.trips (rider_id) where status in ('searching', 'assigned', 'arrived', 'on_trip');
create unique index trips_one_open_per_captain on public.trips (captain_id) where status in ('assigned', 'arrived', 'on_trip');

-- The ride OTP lives apart from the trip so the captain can never read it.
create table public.trip_secrets (
  trip_id uuid primary key references public.trips (id) on delete cascade,
  otp text not null check (otp ~ '^[0-9]{4}$')
);

create table public.trip_offers (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  captain_id uuid not null references public.captains (user_id) on delete cascade,
  status text not null default 'offered' check (status in ('offered', 'accepted', 'rejected', 'expired', 'withdrawn')),
  pickup_km numeric(6, 2) not null,
  expires_at timestamptz not null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (trip_id, captain_id)
);

create index trip_offers_live on public.trip_offers (captain_id) where status = 'offered';

create table public.trip_ratings (
  trip_id uuid not null references public.trips (id) on delete cascade,
  by_role text not null check (by_role in ('rider', 'captain')),
  stars integer not null check (stars between 1 and 5),
  tags text[] not null default '{}',
  note text check (note is null or char_length(note) <= 400),
  created_at timestamptz not null default now(),
  primary key (trip_id, by_role)
);

-- ---------------------------------------------------------------------------
-- Money: wallets, ledger, payments, payouts
-- ---------------------------------------------------------------------------

create table public.advertisers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  contact_email text,
  created_at timestamptz not null default now()
);

create table public.wallets (
  owner_id uuid primary key,
  owner_kind text not null check (owner_kind in ('rider', 'captain', 'advertiser', 'platform')),
  balance_paise bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table public.ledger_entries (
  id bigserial primary key,
  owner_id uuid not null references public.wallets (owner_id),
  kind text not null check (kind in ('topup', 'ride_payment', 'ride_earning', 'ride_bonus', 'commission', 'payout', 'payout_reversal', 'ad_spend', 'advertiser_topup', 'refund', 'adjustment')),
  amount_paise bigint not null check (amount_paise <> 0),
  ref_type text,
  ref_id text,
  note text,
  created_at timestamptz not null default now()
);

create unique index ledger_entries_once on public.ledger_entries (owner_id, kind, ref_type, ref_id);
create index ledger_entries_owner_recent on public.ledger_entries (owner_id, created_at desc);

-- Fixed id for ROVEYA's own account in the ledger.
insert into public.wallets (owner_id, owner_kind) values ('00000000-0000-0000-0000-000000000001', 'platform')
on conflict (owner_id) do nothing;

create or replace function public.platform_wallet()
returns uuid
language sql
immutable
as $$
  select '00000000-0000-0000-0000-000000000001'::uuid;
$$;

create table public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.wallets (owner_id),
  purpose text not null check (purpose in ('wallet_topup', 'trip', 'advertiser_topup')),
  ref_id text,
  amount_paise integer not null check (amount_paise between 100 and 5000000),
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  status text not null default 'created' check (status in ('created', 'paid', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  captain_id uuid not null references public.captains (user_id),
  amount_paise integer not null check (amount_paise >= 10000),
  bank_last4 text not null,
  status text not null default 'requested' check (status in ('requested', 'paid', 'rejected')),
  reference text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index payout_requests_open on public.payout_requests (status, created_at);

-- Posts one ledger line and moves the wallet balance in the same transaction.
-- The (owner, kind, ref_type, ref_id) index makes every post idempotent.
create or replace function public.ledger_post(
  p_owner uuid,
  p_kind text,
  p_amount bigint,
  p_ref_type text,
  p_ref_id text,
  p_note text default null,
  p_allow_negative boolean default false
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_balance bigint;
begin
  if p_amount = 0 then
    select balance_paise into v_balance from public.wallets where owner_id = p_owner;
    return v_balance;
  end if;
  insert into public.ledger_entries (owner_id, kind, amount_paise, ref_type, ref_id, note)
  values (p_owner, p_kind, p_amount, p_ref_type, p_ref_id, p_note)
  on conflict (owner_id, kind, ref_type, ref_id) do nothing
  returning id into v_id;
  if v_id is null then
    select balance_paise into v_balance from public.wallets where owner_id = p_owner;
    return v_balance;
  end if;
  update public.wallets
  set balance_paise = balance_paise + p_amount, updated_at = now()
  where owner_id = p_owner
  returning balance_paise into v_balance;
  if v_balance is null then
    raise exception 'wallet_missing';
  end if;
  if p_amount < 0 and v_balance < 0 and not p_allow_negative then
    raise exception 'insufficient_balance';
  end if;
  return v_balance;
end;
$$;

create or replace function public.open_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := to_jsonb(new);
begin
  insert into public.wallets (owner_id, owner_kind)
  values (
    coalesce(v_row ->> 'user_id', v_row ->> 'id')::uuid,
    case tg_table_name when 'riders' then 'rider' when 'captains' then 'captain' else 'advertiser' end
  )
  on conflict (owner_id) do nothing;
  return new;
end;
$$;

create trigger riders_open_wallet after insert on public.riders for each row execute function public.open_wallet();
create trigger captains_open_wallet after insert on public.captains for each row execute function public.open_wallet();
create trigger advertisers_open_wallet after insert on public.advertisers for each row execute function public.open_wallet();

-- ---------------------------------------------------------------------------
-- Ad services
-- ---------------------------------------------------------------------------

create table public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  advertiser_id uuid not null references public.advertisers (id),
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'ended')),
  pricing text not null check (pricing in ('cpm', 'cpc')),
  bid_paise integer not null check (bid_paise > 0),
  daily_budget_paise integer not null check (daily_budget_paise > 0),
  total_budget_paise integer not null check (total_budget_paise >= daily_budget_paise),
  spent_paise numeric(14, 4) not null default 0,
  spent_today_paise numeric(14, 4) not null default 0,
  spent_day date,
  carry_paise numeric(14, 4) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ad_creatives (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.ad_campaigns (id) on delete cascade,
  slot text not null check (slot in ('rider_home', 'rider_trip', 'captain_duty', 'captain_tabs')),
  kicker text not null check (char_length(kicker) <= 40),
  title text not null check (char_length(title) <= 90),
  cta text check (cta is null or char_length(cta) <= 24),
  image_url text not null,
  link_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index ad_creatives_slot on public.ad_creatives (slot) where active;

create table public.ad_targeting (
  campaign_id uuid primary key references public.ad_campaigns (id) on delete cascade,
  apps text[] not null default '{rider,captain}',
  cities text[] not null default '{}',
  vehicles text[] not null default '{}',
  hours integer[] not null default '{}',
  min_trips integer not null default 0
);

create table public.ad_events (
  id bigserial primary key,
  token_id text not null,
  kind text not null check (kind in ('impression', 'click')),
  campaign_id uuid not null references public.ad_campaigns (id),
  creative_id uuid not null references public.ad_creatives (id),
  user_id uuid,
  slot text not null,
  price_paise numeric(12, 4) not null default 0,
  created_at timestamptz not null default now(),
  unique (token_id, kind)
);

-- ---------------------------------------------------------------------------
-- Event outbox (Kafka-style topics in Postgres) and analytics
-- ---------------------------------------------------------------------------

create table public.events (
  id bigserial primary key,
  topic text not null,
  key text,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index events_topic on public.events (topic, id);

create table public.event_offsets (
  consumer text primary key,
  last_id bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.event_offsets (consumer) values ('analytics'), ('billing') on conflict do nothing;

create table public.analytics_daily (
  day date not null,
  metric text not null,
  dimension text not null default '',
  value numeric not null default 0,
  primary key (day, metric, dimension)
);

create or replace function public.emit_event(p_topic text, p_key text, p_payload jsonb)
returns bigint
language sql
security definer
set search_path = public
as $$
  insert into public.events (topic, key, payload) values (p_topic, p_key, coalesce(p_payload, '{}')) returning id;
$$;

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
      'payment', new.payment, 'cancelled_by', new.cancelled_by, 'distance_km', new.distance_km
    ));
  end if;
  return new;
end;
$$;

create trigger trips_emit after insert or update of status on public.trips for each row execute function public.trips_emit();

create or replace function public.people_emit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'riders' then
    perform public.emit_event('rider.signed_up', new.user_id::text, jsonb_build_object('user_id', new.user_id));
  else
    perform public.emit_event('captain.registered', new.user_id::text, to_jsonb(new) - 'bank_holder' - 'bank_last4' - 'ifsc' - 'upi' - 'emergency_phone' - 'dob');
  end if;
  return new;
end;
$$;

create trigger riders_emit after insert on public.riders for each row execute function public.people_emit();
create trigger captains_emit after insert on public.captains for each row execute function public.people_emit();

create or replace function public.ad_events_emit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.emit_event('ad.' || new.kind, new.campaign_id::text, jsonb_build_object(
    'ad_event_id', new.id, 'campaign_id', new.campaign_id, 'creative_id', new.creative_id,
    'slot', new.slot, 'user_id', new.user_id, 'price_paise', new.price_paise
  ));
  return new;
end;
$$;

create trigger ad_events_emit after insert on public.ad_events for each row execute function public.ad_events_emit();

create or replace function public.money_emit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'payment_intents' then
    if new.status = 'paid' and old.status is distinct from 'paid' then
      perform public.emit_event('payment.captured', new.id::text, jsonb_build_object('intent_id', new.id, 'purpose', new.purpose, 'amount_paise', new.amount_paise, 'owner_id', new.owner_id));
    end if;
  elsif tg_op = 'INSERT' then
    perform public.emit_event('payout.requested', new.id::text, jsonb_build_object('payout_id', new.id, 'captain_id', new.captain_id, 'amount_paise', new.amount_paise));
  elsif new.status is distinct from old.status then
    perform public.emit_event('payout.' || new.status, new.id::text, jsonb_build_object('payout_id', new.id, 'captain_id', new.captain_id, 'amount_paise', new.amount_paise));
  end if;
  return new;
end;
$$;

create trigger payment_intents_emit after update of status on public.payment_intents for each row execute function public.money_emit();
create trigger payout_requests_emit after insert or update of status on public.payout_requests for each row execute function public.money_emit();

create or replace function public.analytics_bump(p_day date, p_metric text, p_dimension text, p_value numeric)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.analytics_daily (day, metric, dimension, value)
  values (p_day, p_metric, coalesce(p_dimension, ''), p_value)
  on conflict (day, metric, dimension) do update set value = public.analytics_daily.value + excluded.value;
$$;

-- Analytics consumer: reads new events once, in order, and rolls them up per day (IST).
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

-- Splits a completed fare: the captain's earning, ROVEYA's commission, and any bonus.
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

-- Charges an advertiser for one ad event. Fractions of a paisa carry over to the next event.
create or replace function public.charge_ad_event(p_event_id bigint, p_campaign uuid, p_price numeric, p_kind text, p_day date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_advertiser uuid;
  v_carry numeric;
  v_spent numeric;
  v_total integer;
  v_charge bigint;
begin
  update public.ad_campaigns
  set spent_paise = spent_paise + p_price,
      spent_today_paise = case when spent_day = p_day then spent_today_paise + p_price else p_price end,
      spent_day = p_day,
      carry_paise = carry_paise + p_price,
      impressions = impressions + (p_kind = 'impression')::int,
      clicks = clicks + (p_kind = 'click')::int,
      updated_at = now()
  where id = p_campaign
  returning advertiser_id, carry_paise, spent_paise, total_budget_paise into v_advertiser, v_carry, v_spent, v_total;
  if v_advertiser is null then
    return;
  end if;
  if v_carry >= 1 then
    v_charge := floor(v_carry);
    update public.ad_campaigns set carry_paise = carry_paise - v_charge where id = p_campaign;
    perform public.ledger_post(v_advertiser, 'ad_spend', -v_charge, 'ad_event', p_event_id::text, null, true);
    perform public.ledger_post(public.platform_wallet(), 'ad_spend', v_charge, 'ad_event', p_event_id::text);
  end if;
  if v_spent >= v_total then
    update public.ad_campaigns set status = 'ended' where id = p_campaign and status = 'active';
  end if;
end;
$$;

-- Billing consumer: settles completed trips and charges advertisers, once per event.
create or replace function public.consume_billing(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last bigint;
  v_max bigint;
  v_count integer := 0;
  e record;
begin
  select last_id into v_last from public.event_offsets where consumer = 'billing' for update skip locked;
  if not found then
    return 0;
  end if;
  for e in select * from public.events where id > v_last order by id limit p_limit loop
    if e.topic = 'trip.completed' then
      perform public.settle_trip((e.payload ->> 'trip_id')::uuid);
    elsif e.topic in ('ad.impression', 'ad.click') and (e.payload ->> 'price_paise')::numeric > 0 then
      perform public.charge_ad_event(
        (e.payload ->> 'ad_event_id')::bigint,
        (e.payload ->> 'campaign_id')::uuid,
        (e.payload ->> 'price_paise')::numeric,
        substr(e.topic, 4),
        (e.created_at at time zone 'Asia/Kolkata')::date
      );
    end if;
    v_max := e.id;
    v_count := v_count + 1;
  end loop;
  if v_max is not null then
    update public.event_offsets set last_id = v_max, updated_at = now() where consumer = 'billing';
  end if;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Matching
-- ---------------------------------------------------------------------------

create or replace function public.km_between(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 6371 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

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
      bonus_paise = bonus_paise + case when v_offer.pickup_km > 2.5 then 1500 else 0 end,
      updated_at = now()
  where id = v_trip.id
  returning * into v_trip;
  return v_trip;
end;
$$;

-- Offers a searching trip to the nearest free captain who has not seen it yet.
create or replace function public.offer_next_captain(p_trip uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips;
  v_captain uuid;
  v_km double precision;
  v_auto boolean;
  v_offer uuid;
  v_radius double precision := public.setting_num('match_radius_km', 6);
  v_ttl integer := public.setting_num('offer_ttl_seconds', 15)::int;
begin
  select * into v_trip from public.trips where id = p_trip for update;
  if not found or v_trip.status <> 'searching' then
    return null;
  end if;
  if exists (select 1 from public.trip_offers where trip_id = p_trip and status = 'offered' and expires_at > now()) then
    return null;
  end if;
  select p.captain_id, public.km_between(p.latitude, p.longitude, v_trip.pickup_lat, v_trip.pickup_lng), p.auto_accept
  into v_captain, v_km, v_auto
  from public.captain_presence p
  join public.captains c on c.user_id = p.captain_id and c.status = 'active'
  where p.online
    and p.vehicle = v_trip.vehicle
    and p.latitude is not null
    and p.updated_at > now() - interval '2 minutes'
    and p.captain_id <> v_trip.rider_id
    and public.km_between(p.latitude, p.longitude, v_trip.pickup_lat, v_trip.pickup_lng) <= v_radius
    and not exists (select 1 from public.trip_offers o where o.trip_id = p_trip and o.captain_id = p.captain_id)
    and not exists (select 1 from public.trip_offers o where o.captain_id = p.captain_id and o.status = 'offered' and o.expires_at > now())
    and not exists (select 1 from public.trips t where t.captain_id = p.captain_id and t.status in ('assigned', 'arrived', 'on_trip'))
  order by public.km_between(p.latitude, p.longitude, v_trip.pickup_lat, v_trip.pickup_lng)
  limit 1;
  if v_captain is null then
    if v_trip.requested_at < now() - interval '3 minutes' then
      update public.trips set status = 'expired', updated_at = now() where id = p_trip;
    end if;
    return null;
  end if;
  insert into public.trip_offers (trip_id, captain_id, pickup_km, expires_at)
  values (p_trip, v_captain, round((v_km * 1.3)::numeric, 2), now() + make_interval(secs => v_ttl))
  returning id into v_offer;
  if v_auto then
    perform public.accept_offer(v_offer, v_captain);
  end if;
  return v_offer;
end;
$$;

create or replace function public.sweep_offers()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count integer := 0;
begin
  update public.trip_offers set status = 'expired', decided_at = now()
  where status = 'offered' and expires_at <= now();
  for r in
    select t.id from public.trips t
    where t.status = 'searching'
      and not exists (select 1 from public.trip_offers o where o.trip_id = t.id and o.status = 'offered' and o.expires_at > now())
    order by t.requested_at
    limit 200
  loop
    perform public.offer_next_captain(r.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create trigger riders_touch before update on public.riders for each row execute function public.touch_updated_at();
create trigger captains_touch before update on public.captains for each row execute function public.touch_updated_at();
create trigger trips_touch before update on public.trips for each row execute function public.touch_updated_at();
create trigger payment_intents_touch before update on public.payment_intents for each row execute function public.touch_updated_at();
create trigger ad_campaigns_touch before update on public.ad_campaigns for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security. Apps read their own rows; every write goes through the API.
-- ---------------------------------------------------------------------------

alter table public.platform_settings enable row level security;
alter table public.app_otps enable row level security;
alter table public.riders enable row level security;
alter table public.captains enable row level security;
alter table public.captain_documents enable row level security;
alter table public.captain_presence enable row level security;
alter table public.trips enable row level security;
alter table public.trip_secrets enable row level security;
alter table public.trip_offers enable row level security;
alter table public.trip_ratings enable row level security;
alter table public.advertisers enable row level security;
alter table public.wallets enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.payment_intents enable row level security;
alter table public.payout_requests enable row level security;
alter table public.ad_campaigns enable row level security;
alter table public.ad_creatives enable row level security;
alter table public.ad_targeting enable row level security;
alter table public.ad_events enable row level security;
alter table public.events enable row level security;
alter table public.event_offsets enable row level security;
alter table public.analytics_daily enable row level security;

create policy riders_self on public.riders for select to authenticated using (user_id = auth.uid());
create policy captains_self on public.captains for select to authenticated using (user_id = auth.uid());
create policy captain_documents_self on public.captain_documents for select to authenticated using (captain_id = auth.uid());

create policy captain_presence_visible on public.captain_presence for select to authenticated using (
  captain_id = auth.uid()
  or exists (
    select 1 from public.trips t
    where t.captain_id = captain_presence.captain_id
      and t.rider_id = auth.uid()
      and t.status in ('assigned', 'arrived', 'on_trip')
  )
);

create policy trips_participants on public.trips for select to authenticated using (rider_id = auth.uid() or captain_id = auth.uid());
create policy trip_secrets_rider on public.trip_secrets for select to authenticated using (
  exists (select 1 from public.trips t where t.id = trip_secrets.trip_id and t.rider_id = auth.uid())
);
create policy trip_offers_captain on public.trip_offers for select to authenticated using (captain_id = auth.uid());
create policy trip_ratings_participants on public.trip_ratings for select to authenticated using (
  exists (select 1 from public.trips t where t.id = trip_ratings.trip_id and (t.rider_id = auth.uid() or t.captain_id = auth.uid()))
);

create policy wallets_owner on public.wallets for select to authenticated using (owner_id = auth.uid());
create policy ledger_owner on public.ledger_entries for select to authenticated using (owner_id = auth.uid());
create policy payment_intents_owner on public.payment_intents for select to authenticated using (owner_id = auth.uid());
create policy payout_requests_captain on public.payout_requests for select to authenticated using (captain_id = auth.uid());

create policy staff_read_riders on public.riders for select to authenticated using (public.is_staff());
create policy staff_read_captains on public.captains for select to authenticated using (public.is_staff());
create policy staff_read_trips on public.trips for select to authenticated using (public.is_staff());
create policy staff_read_payouts on public.payout_requests for select to authenticated using (public.is_staff());
create policy staff_read_analytics on public.analytics_daily for select to authenticated using (public.is_staff());
create policy staff_read_campaigns on public.ad_campaigns for select to authenticated using (public.is_staff());
create policy staff_read_advertisers on public.advertisers for select to authenticated using (public.is_staff());

-- Supabase Realtime streams these tables to the apps, filtered by the policies above.
do $$
begin
  alter publication supabase_realtime add table public.trips, public.trip_offers, public.captain_presence;
exception
  when undefined_object then null;
  when duplicate_object then null;
end;
$$;

-- Private bucket for captain documents; uploads use signed URLs from the API.
insert into storage.buckets (id, name, public) values ('captain-documents', 'captain-documents', false)
on conflict (id) do nothing;

-- RPCs are for the API's service role only.
revoke execute on function public.ledger_post(uuid, text, bigint, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.accept_offer(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.offer_next_captain(uuid) from public, anon, authenticated;
revoke execute on function public.sweep_offers() from public, anon, authenticated;
revoke execute on function public.settle_trip(uuid) from public, anon, authenticated;
revoke execute on function public.charge_ad_event(bigint, uuid, numeric, text, date) from public, anon, authenticated;
revoke execute on function public.consume_analytics(integer) from public, anon, authenticated;
revoke execute on function public.consume_billing(integer) from public, anon, authenticated;
revoke execute on function public.emit_event(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.analytics_bump(date, text, text, numeric) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- House ads so both apps have banners from day one.
-- ---------------------------------------------------------------------------

with house as (
  insert into public.advertisers (id, name, contact_email)
  values ('00000000-0000-0000-0000-0000000000a1', 'ROVEYA house ads', 'desk@roveya.com')
  on conflict (id) do update set name = excluded.name
  returning id
), campaign as (
  insert into public.ad_campaigns (id, advertiser_id, name, status, pricing, bid_paise, daily_budget_paise, total_budget_paise)
  select '00000000-0000-0000-0000-0000000000c1', id, 'Captain programme', 'active', 'cpm', 2500, 100000, 10000000 from house
  on conflict (id) do nothing
  returning id
)
insert into public.ad_targeting (campaign_id, apps)
select id, '{rider,captain}' from campaign
on conflict (campaign_id) do nothing;

insert into public.ad_creatives (campaign_id, slot, kicker, title, cta, image_url, link_url) values
  ('00000000-0000-0000-0000-0000000000c1', 'captain_tabs', 'RUSH HOUR', 'Morning and evening rides pay ₹10 more', 'See bonuses', '/ads/cap-banner-ride.jpg', 'roveya-captain://incentives'),
  ('00000000-0000-0000-0000-0000000000c1', 'captain_tabs', 'PAYOUTS', 'Redeem your earnings to the bank twice a week', 'Open wallet', '/ads/cap-banner-earn.jpg', 'roveya-captain://wallet'),
  ('00000000-0000-0000-0000-0000000000c1', 'captain_duty', 'FIVE-STAR SERVICE', 'Courtesy on every trip builds your rating', 'My ratings', '/ads/cap-banner-cab.jpg', 'roveya-captain://ratings'),
  ('00000000-0000-0000-0000-0000000000c1', 'rider_home', 'TAXIPOOL', 'A seat of your own, city to city', 'See routes', '/ads/hero-car.jpg', 'roveya://pool'),
  ('00000000-0000-0000-0000-0000000000c1', 'rider_home', 'AUTO', 'Doorstep pickups across the city', 'Book now', '/ads/hero-auto.jpg', 'roveya://ride');
