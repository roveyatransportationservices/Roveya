-- Reconstructed from the development catalog (Phase 2.1.4) and the redacted function export (Phase 2.1.6 Stage B).
-- Local file only. Do not apply this file to development, staging, or production without a separate approval.
-- push_send and touch_updated_at are not repeated here. They already exist in earlier migrations.
-- The web address inside push_send was redacted and must not be installed from this file.
-- Table privileges match the catalog, including TRUNCATE. ADMIN CONTROLS/020_revoke_seat_truncate.sql removes that privilege afterwards.

create sequence public.seat_pnr_seq as bigint increment 1 minvalue 1 maxvalue 9223372036854775807 start 482100 cache 1 no cycle;
create sequence public.seat_trip_seq as bigint increment 1 minvalue 1 maxvalue 9223372036854775807 start 50001 cache 1 no cycle;
create sequence public.seat_searches_id_seq as bigint increment 1 minvalue 1 maxvalue 9223372036854775807 start 1 cache 1 no cycle;
create sequence public.seat_trip_track_id_seq as bigint increment 1 minvalue 1 maxvalue 9223372036854775807 start 1 cache 1 no cycle;

create table public.seat_cars (
  id uuid not null default gen_random_uuid(),
  captain_id uuid not null,
  make_model text not null,
  car_class text not null,
  plate text not null,
  color text not null,
  year integer not null,
  ac boolean not null default true,
  amenities text[] not null default '{}'::text[],
  layout_kind text not null,
  seats jsonb not null,
  status text not null default 'review'::text,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.seat_trips (
  id uuid not null default gen_random_uuid(),
  code text not null default ('RVT-'::text || nextval('seat_trip_seq'::regclass)),
  captain_id uuid not null,
  car_id uuid not null,
  from_city text not null,
  to_city text not null,
  depart_at timestamptz not null,
  arrive_at timestamptz not null,
  base_fare_paise integer not null,
  boarding jsonb not null,
  drops jsonb not null,
  women_friendly boolean not null default false,
  status text not null default 'scheduled'::text,
  cancel_reason text,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.seat_trip_seats (
  trip_id uuid not null,
  seat_id text not null,
  label text not null,
  seat_row smallint not null,
  seat_col smallint not null,
  is_window boolean not null default false,
  price_paise integer not null,
  state text not null default 'available'::text,
  gender text,
  booking_id uuid,
  held_until timestamptz,
  blocked_at timestamptz
);

create table public.seat_trip_positions (
  trip_id uuid not null,
  latitude double precision not null,
  longitude double precision not null,
  heading real not null default 0,
  speed_kmh real not null default 0,
  moved_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.seat_trip_track (
  id bigint not null default nextval('seat_trip_track_id_seq'::regclass),
  trip_id uuid not null,
  latitude double precision not null,
  longitude double precision not null,
  speed_kmh real not null default 0,
  at timestamptz not null default now()
);

create table public.seat_offline_passengers (
  trip_id uuid not null,
  seat_id text not null,
  gender text,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.seat_searches (
  id bigint not null default nextval('seat_searches_id_seq'::regclass),
  from_city text not null,
  to_city text not null,
  travel_date date not null,
  results integer not null default 0,
  rider_id uuid,
  searcher text,
  source text not null default 'app'::text,
  created_at timestamptz not null default now()
);

create table public.seat_bookings (
  id uuid not null default gen_random_uuid(),
  pnr text not null default ('RVY'::text || nextval('seat_pnr_seq'::regclass)),
  trip_id uuid not null,
  rider_id uuid not null,
  phone text not null,
  email text,
  seat_ids text[] not null,
  travellers jsonb not null,
  boarding jsonb not null,
  drop_point jsonb not null,
  fare_paise integer not null,
  gst_paise integer not null default 0,
  secure_paise integer not null default 0,
  discount_paise integer not null default 0,
  cash_paise integer not null default 0,
  total_paise integer not null,
  secured boolean not null default false,
  coupon_id uuid,
  status text not null default 'pending'::text,
  paid_with text,
  refund_paise integer,
  hold_until timestamptz not null,
  boarded_at timestamptz,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.seat_booking_ratings (
  booking_id uuid not null,
  trip_id uuid not null,
  captain_id uuid not null,
  rider_id uuid,
  stars integer not null,
  tags text[] not null default '{}'::text[],
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.seat_settlements (
  booking_id uuid not null,
  payment_id text,
  collected_paise integer not null,
  captain_paise integer not null,
  fee_paise integer not null,
  gst_paise integer not null,
  status text not null default 'pending_route'::text,
  created_at timestamptz not null default now()
);

alter table public.seat_cars add constraint seat_cars_captain_id_fkey FOREIGN KEY (captain_id) REFERENCES captains(user_id) ON DELETE CASCADE;
alter table public.seat_cars add constraint seat_cars_captain_id_key UNIQUE (captain_id);
alter table public.seat_cars add constraint seat_cars_car_class_check CHECK ((car_class = ANY (ARRAY['Hatchback'::text, 'Sedan'::text, 'SUV'::text, 'Premium SUV'::text, 'Traveller'::text])));
alter table public.seat_cars add constraint seat_cars_color_check CHECK (((char_length(btrim(color)) >= 3) AND (char_length(btrim(color)) <= 20)));
alter table public.seat_cars add constraint seat_cars_layout_kind_check CHECK ((layout_kind = ANY (ARRAY['seat4'::text, 'seat5c'::text, 'seat6'::text, 'seat6c'::text, 'seat7'::text])));
alter table public.seat_cars add constraint seat_cars_make_model_check CHECK (((char_length(btrim(make_model)) >= 2) AND (char_length(btrim(make_model)) <= 60)));
alter table public.seat_cars add constraint seat_cars_pkey PRIMARY KEY (id);
alter table public.seat_cars add constraint seat_cars_plate_check CHECK ((plate ~ '^[A-Z]{2} ?[0-9]{1,2} ?[A-Z]{0,3} ?[0-9]{3,4}$'::text));
alter table public.seat_cars add constraint seat_cars_plate_key UNIQUE (plate);
alter table public.seat_cars add constraint seat_cars_seats_check CHECK (((jsonb_typeof(seats) = 'array'::text) AND ((jsonb_array_length(seats) >= 2) AND (jsonb_array_length(seats) <= 7))));
alter table public.seat_cars add constraint seat_cars_status_check CHECK ((status = ANY (ARRAY['review'::text, 'active'::text, 'rejected'::text])));
alter table public.seat_cars add constraint seat_cars_year_check CHECK (((year >= 2005) AND (year <= 2100)));

alter table public.seat_trips add constraint seat_trips_base_fare_paise_check CHECK (((base_fare_paise >= 5000) AND (base_fare_paise <= 1000000)));
alter table public.seat_trips add constraint seat_trips_boarding_check CHECK (((jsonb_typeof(boarding) = 'array'::text) AND ((jsonb_array_length(boarding) >= 1) AND (jsonb_array_length(boarding) <= 6))));
alter table public.seat_trips add constraint seat_trips_cancel_reason_check CHECK (((cancel_reason IS NULL) OR (char_length(cancel_reason) <= 160)));
alter table public.seat_trips add constraint seat_trips_captain_id_fkey FOREIGN KEY (captain_id) REFERENCES captains(user_id);
alter table public.seat_trips add constraint seat_trips_car_id_fkey FOREIGN KEY (car_id) REFERENCES seat_cars(id);
alter table public.seat_trips add constraint seat_trips_check CHECK ((from_city <> to_city));
alter table public.seat_trips add constraint seat_trips_check1 CHECK ((arrive_at > depart_at));
alter table public.seat_trips add constraint seat_trips_code_key UNIQUE (code);
alter table public.seat_trips add constraint seat_trips_drops_check CHECK (((jsonb_typeof(drops) = 'array'::text) AND ((jsonb_array_length(drops) >= 1) AND (jsonb_array_length(drops) <= 6))));
alter table public.seat_trips add constraint seat_trips_from_city_check CHECK ((from_city ~ '^[a-z]{3}$'::text));
alter table public.seat_trips add constraint seat_trips_pkey PRIMARY KEY (id);
alter table public.seat_trips add constraint seat_trips_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'on_trip'::text, 'completed'::text, 'cancelled'::text])));
alter table public.seat_trips add constraint seat_trips_to_city_check CHECK ((to_city ~ '^[a-z]{3}$'::text));

alter table public.seat_trip_seats add constraint seat_trip_seats_gender_check CHECK ((gender = ANY (ARRAY['Male'::text, 'Female'::text])));
alter table public.seat_trip_seats add constraint seat_trip_seats_label_check CHECK (((char_length(btrim(label)) >= 1) AND (char_length(btrim(label)) <= 12)));
alter table public.seat_trip_seats add constraint seat_trip_seats_pkey PRIMARY KEY (trip_id, seat_id);
alter table public.seat_trip_seats add constraint seat_trip_seats_price_paise_check CHECK ((price_paise > 0));
alter table public.seat_trip_seats add constraint seat_trip_seats_seat_col_check CHECK (((seat_col >= 0) AND (seat_col <= 2)));
alter table public.seat_trip_seats add constraint seat_trip_seats_seat_id_check CHECK ((seat_id ~ '^[A-Z0-9]{1,4}$'::text));
alter table public.seat_trip_seats add constraint seat_trip_seats_seat_row_check CHECK (((seat_row >= 0) AND (seat_row <= 3)));
alter table public.seat_trip_seats add constraint seat_trip_seats_state_check CHECK ((state = ANY (ARRAY['available'::text, 'held'::text, 'booked'::text, 'blocked'::text])));
alter table public.seat_trip_seats add constraint seat_trip_seats_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES seat_trips(id) ON DELETE CASCADE;

alter table public.seat_trip_positions add constraint seat_trip_positions_latitude_check CHECK (((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision)));
alter table public.seat_trip_positions add constraint seat_trip_positions_longitude_check CHECK (((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision)));
alter table public.seat_trip_positions add constraint seat_trip_positions_pkey PRIMARY KEY (trip_id);
alter table public.seat_trip_positions add constraint seat_trip_positions_speed_kmh_check CHECK (((speed_kmh >= (0)::double precision) AND (speed_kmh < (400)::double precision)));
alter table public.seat_trip_positions add constraint seat_trip_positions_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES seat_trips(id) ON DELETE CASCADE;

alter table public.seat_trip_track add constraint seat_trip_track_pkey PRIMARY KEY (id);
alter table public.seat_trip_track add constraint seat_trip_track_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES seat_trips(id) ON DELETE CASCADE;

alter table public.seat_offline_passengers add constraint seat_offline_passengers_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.seat_offline_passengers add constraint seat_offline_passengers_gender_check CHECK (((gender IS NULL) OR (gender = ANY (ARRAY['Male'::text, 'Female'::text]))));
alter table public.seat_offline_passengers add constraint seat_offline_passengers_note_check CHECK (((note IS NULL) OR (char_length(note) <= 160)));
alter table public.seat_offline_passengers add constraint seat_offline_passengers_pkey PRIMARY KEY (trip_id, seat_id);
alter table public.seat_offline_passengers add constraint seat_offline_passengers_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES seat_trips(id) ON DELETE CASCADE;

alter table public.seat_searches add constraint seat_searches_from_city_check CHECK ((from_city ~ '^[a-z]{3}$'::text));
alter table public.seat_searches add constraint seat_searches_pkey PRIMARY KEY (id);
alter table public.seat_searches add constraint seat_searches_results_check CHECK ((results >= 0));
alter table public.seat_searches add constraint seat_searches_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES riders(user_id) ON DELETE SET NULL;
alter table public.seat_searches add constraint seat_searches_searcher_check CHECK (((searcher IS NULL) OR (char_length(searcher) <= 64)));
alter table public.seat_searches add constraint seat_searches_source_check CHECK ((source = ANY (ARRAY['app'::text, 'website'::text])));
alter table public.seat_searches add constraint seat_searches_to_city_check CHECK ((to_city ~ '^[a-z]{3}$'::text));

alter table public.seat_bookings add constraint seat_bookings_cancelled_by_check CHECK (((cancelled_by IS NULL) OR (cancelled_by = ANY (ARRAY['rider'::text, 'captain'::text, 'system'::text]))));
alter table public.seat_bookings add constraint seat_bookings_cash_paise_check CHECK ((cash_paise >= 0));
alter table public.seat_bookings add constraint seat_bookings_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES coupons(id);
alter table public.seat_bookings add constraint seat_bookings_discount_paise_check CHECK ((discount_paise >= 0));
alter table public.seat_bookings add constraint seat_bookings_email_check CHECK (((email IS NULL) OR (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'::text)));
alter table public.seat_bookings add constraint seat_bookings_fare_paise_check CHECK ((fare_paise > 0));
alter table public.seat_bookings add constraint seat_bookings_gst_paise_check CHECK ((gst_paise >= 0));
alter table public.seat_bookings add constraint seat_bookings_phone_check CHECK ((phone ~ '^[6-9][0-9]{9}$'::text));
alter table public.seat_bookings add constraint seat_bookings_pkey PRIMARY KEY (id);
alter table public.seat_bookings add constraint seat_bookings_pnr_key UNIQUE (pnr);
alter table public.seat_bookings add constraint seat_bookings_refund_paise_check CHECK (((refund_paise IS NULL) OR (refund_paise >= 0)));
alter table public.seat_bookings add constraint seat_bookings_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES riders(user_id);
alter table public.seat_bookings add constraint seat_bookings_seat_ids_check CHECK (((cardinality(seat_ids) >= 1) AND (cardinality(seat_ids) <= 4)));
alter table public.seat_bookings add constraint seat_bookings_secure_paise_check CHECK ((secure_paise >= 0));
alter table public.seat_bookings add constraint seat_bookings_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'cancelled'::text, 'completed'::text, 'expired'::text])));
alter table public.seat_bookings add constraint seat_bookings_total_paise_check CHECK ((total_paise >= 0));
alter table public.seat_bookings add constraint seat_bookings_travellers_check CHECK ((jsonb_typeof(travellers) = 'array'::text));
alter table public.seat_bookings add constraint seat_bookings_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES seat_trips(id);

alter table public.seat_booking_ratings add constraint seat_booking_ratings_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES seat_bookings(id) ON DELETE CASCADE;
alter table public.seat_booking_ratings add constraint seat_booking_ratings_captain_id_fkey FOREIGN KEY (captain_id) REFERENCES captains(user_id) ON DELETE CASCADE;
alter table public.seat_booking_ratings add constraint seat_booking_ratings_note_check CHECK (((note IS NULL) OR (char_length(note) <= 400)));
alter table public.seat_booking_ratings add constraint seat_booking_ratings_pkey PRIMARY KEY (booking_id);
alter table public.seat_booking_ratings add constraint seat_booking_ratings_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES riders(user_id) ON DELETE SET NULL;
alter table public.seat_booking_ratings add constraint seat_booking_ratings_stars_check CHECK (((stars >= 1) AND (stars <= 5)));
alter table public.seat_booking_ratings add constraint seat_booking_ratings_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES seat_trips(id) ON DELETE CASCADE;

alter table public.seat_settlements add constraint seat_settlements_pkey PRIMARY KEY (booking_id);

CREATE INDEX seat_booking_ratings_recent ON public.seat_booking_ratings USING btree (created_at DESC);
CREATE INDEX seat_booking_ratings_rider ON public.seat_booking_ratings USING btree (rider_id);
CREATE INDEX seat_bookings_holds ON public.seat_bookings USING btree (hold_until) WHERE (status = 'pending'::text);
CREATE INDEX seat_bookings_rider ON public.seat_bookings USING btree (rider_id, created_at DESC);
CREATE INDEX seat_bookings_trip ON public.seat_bookings USING btree (trip_id) WHERE (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'completed'::text]));
CREATE INDEX seat_searches_recent ON public.seat_searches USING btree (created_at DESC);
CREATE INDEX seat_searches_route ON public.seat_searches USING btree (from_city, to_city, travel_date);
CREATE INDEX seat_trip_track_trip ON public.seat_trip_track USING btree (trip_id, at DESC);
CREATE INDEX seat_trips_captain ON public.seat_trips USING btree (captain_id, depart_at DESC);
CREATE INDEX seat_trips_search ON public.seat_trips USING btree (from_city, to_city, depart_at) WHERE (status = 'scheduled'::text);

create trigger seat_bookings_touch BEFORE UPDATE on public.seat_bookings for each row EXECUTE FUNCTION touch_updated_at();
create trigger seat_cars_touch BEFORE UPDATE on public.seat_cars for each row EXECUTE FUNCTION touch_updated_at();
create trigger seat_trips_touch BEFORE UPDATE on public.seat_trips for each row EXECUTE FUNCTION touch_updated_at();

alter table public.seat_searches enable row level security;
alter table public.seat_booking_ratings enable row level security;
alter table public.seat_settlements enable row level security;
alter table public.seat_cars enable row level security;
alter table public.seat_trips enable row level security;
alter table public.seat_bookings enable row level security;
alter table public.seat_trip_seats enable row level security;
alter table public.seat_trip_positions enable row level security;
alter table public.seat_trip_track enable row level security;
alter table public.seat_offline_passengers enable row level security;

create policy seat_bookings_participants on public.seat_bookings for SELECT to authenticated using (((rider_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM seat_trips t
  WHERE ((t.id = seat_bookings.trip_id) AND (t.captain_id = auth.uid())))) OR is_staff()));
create policy seat_cars_visible on public.seat_cars for SELECT to authenticated using (((captain_id = auth.uid()) OR (status = 'active'::text) OR is_staff()));
create policy seat_offline_passengers_captain on public.seat_offline_passengers for SELECT to authenticated using (((EXISTS ( SELECT 1
   FROM seat_trips t
  WHERE ((t.id = seat_offline_passengers.trip_id) AND (t.captain_id = auth.uid())))) OR is_staff()));
create policy seat_trip_positions_participants on public.seat_trip_positions for SELECT to authenticated using (((EXISTS ( SELECT 1
   FROM seat_trips t
  WHERE ((t.id = seat_trip_positions.trip_id) AND (t.captain_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM seat_bookings b
  WHERE ((b.trip_id = seat_trip_positions.trip_id) AND (b.rider_id = auth.uid()) AND (b.status = ANY (ARRAY['confirmed'::text, 'completed'::text]))))) OR is_staff()));
create policy seat_trip_seats_visible on public.seat_trip_seats for SELECT to anon,authenticated using (true);
create policy seat_trip_track_staff on public.seat_trip_track for SELECT to authenticated using (is_staff());
create policy seat_trips_visible on public.seat_trips for SELECT to anon,authenticated using (((status = ANY (ARRAY['scheduled'::text, 'on_trip'::text])) OR (captain_id = auth.uid()) OR is_staff()));

grant select, insert, update, delete, truncate, references, trigger on table public.seat_cars to anon, authenticated, service_role;
grant select, insert, update, delete, truncate, references, trigger on table public.seat_trips to anon, authenticated, service_role;
grant select, insert, update, delete, truncate, references, trigger on table public.seat_trip_seats to anon, authenticated, service_role;
grant select, insert, update, delete, truncate, references, trigger on table public.seat_trip_positions to anon, authenticated, service_role;
grant select, insert, update, delete, truncate, references, trigger on table public.seat_trip_track to anon, authenticated, service_role;
grant select, insert, update, delete, truncate, references, trigger on table public.seat_offline_passengers to anon, authenticated, service_role;
grant select, insert, update, delete, truncate, references, trigger on table public.seat_bookings to anon, authenticated, service_role;
grant select, insert, update, delete, truncate, references, trigger on table public.seat_booking_ratings to anon, authenticated, service_role;
grant select, insert, update, delete, truncate, references, trigger on table public.seat_searches to service_role;
grant select, insert, update, delete, truncate, references, trigger on table public.seat_settlements to service_role;

alter sequence public.seat_searches_id_seq owned by public.seat_searches.id;
alter sequence public.seat_trip_track_id_seq owned by public.seat_trip_track.id;

grant usage, select, update on sequence public.seat_pnr_seq to anon;
grant usage, select, update on sequence public.seat_pnr_seq to authenticated;
grant usage, select, update on sequence public.seat_pnr_seq to service_role;
grant usage, select, update on sequence public.seat_searches_id_seq to anon;
grant usage, select, update on sequence public.seat_searches_id_seq to authenticated;
grant usage, select, update on sequence public.seat_searches_id_seq to service_role;
grant usage, select, update on sequence public.seat_trip_seq to anon;
grant usage, select, update on sequence public.seat_trip_seq to authenticated;
grant usage, select, update on sequence public.seat_trip_seq to service_role;
grant usage, select, update on sequence public.seat_trip_track_id_seq to anon;
grant usage, select, update on sequence public.seat_trip_track_id_seq to authenticated;
grant usage, select, update on sequence public.seat_trip_track_id_seq to service_role;

CREATE OR REPLACE FUNCTION public.seat_block(p_trip uuid, p_captain uuid, p_seats text[], p_gender text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_trip public.seat_trips;
  v_seat public.seat_trip_seats;
  v_id text;
  v_count integer := 0;
begin
  select * into v_trip from public.seat_trips where id = p_trip for update;
  if not found or v_trip.captain_id <> p_captain then
    raise exception 'trip_missing';
  end if;
  if v_trip.status not in ('scheduled', 'on_trip') then
    raise exception 'trip_closed';
  end if;
  if coalesce(cardinality(p_seats), 0) = 0 or cardinality(p_seats) > 7 then
    raise exception 'seat_count';
  end if;
  if p_gender is not null and p_gender not in ('Male', 'Female') then
    raise exception 'gender_invalid';
  end if;

  perform public.seat_release_expired(p_trip);

  foreach v_id in array p_seats loop
    select * into v_seat from public.seat_trip_seats where trip_id = p_trip and seat_id = v_id for update;
    if not found then
      raise exception 'seat_missing';
    end if;
    if v_seat.state <> 'available' then
      raise exception 'seat_not_free';
    end if;
    if coalesce(p_gender, '') <> 'Female' and public.seat_women_only(p_trip, v_id) then
      raise exception 'seat_women_block';
    end if;
    update public.seat_trip_seats
    set state = 'blocked', gender = p_gender, booking_id = null, held_until = null, blocked_at = now()
    where trip_id = p_trip and seat_id = v_id;
    insert into public.seat_offline_passengers (trip_id, seat_id, gender, note, created_by)
    values (p_trip, v_id, p_gender, nullif(btrim(coalesce(p_note, '')), ''), p_captain)
    on conflict (trip_id, seat_id) do update set gender = excluded.gender, note = excluded.note, created_by = excluded.created_by, created_at = now();
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

revoke execute on function public.seat_block(p_trip uuid, p_captain uuid, p_seats text[], p_gender text, p_note text) from public, anon, authenticated;
grant execute on function public.seat_block(p_trip uuid, p_captain uuid, p_seats text[], p_gender text, p_note text) to service_role;

CREATE OR REPLACE FUNCTION public.seat_book(p_rider uuid, p_trip uuid, p_travellers jsonb, p_boarding jsonb, p_drop jsonb, p_phone text, p_email text, p_secured boolean, p_coupon uuid, p_discount integer, p_use_cash boolean)
 RETURNS seat_bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_trip public.seat_trips;
  v_booking public.seat_bookings;
  v_item jsonb;
  v_seat public.seat_trip_seats;
  v_ids text[] := '{}';
  v_fare bigint := 0;
  v_count integer;
  v_gst bigint;
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

  v_gst := round(v_fare * 0.05 / 100.0) * 100;
  v_secure := case when p_secured then 1900 * v_count else 0 end;
  v_discount := least(greatest(coalesce(p_discount, 0), 0), v_fare);
  v_before := greatest(0, v_fare + v_gst + v_secure - v_discount);
  if p_use_cash then
    select balance_paise into v_balance from public.wallets where owner_id = p_rider;
    v_cash := floor(least(greatest(coalesce(v_balance, 0), 0), round(v_before * 0.2)) / 100.0) * 100;
  end if;

  insert into public.seat_bookings (
    trip_id, rider_id, phone, email, seat_ids, travellers, boarding, drop_point,
    fare_paise, gst_paise, secure_paise, discount_paise, cash_paise, total_paise,
    secured, coupon_id, hold_until
  ) values (
    p_trip, p_rider, p_phone, nullif(btrim(coalesce(p_email, '')), ''), v_ids, p_travellers, p_boarding, p_drop,
    v_fare, v_gst, v_secure, v_discount, v_cash, v_before - v_cash,
    p_secured, p_coupon, now() + make_interval(mins => public.setting_num('seat_hold_minutes', 10)::int)
  )
  returning * into v_booking;

  update public.seat_trip_seats s
  set state = 'held', gender = t.value ->> 'gender', booking_id = v_booking.id, held_until = v_booking.hold_until
  from jsonb_array_elements(p_travellers) t
  where s.trip_id = p_trip and s.seat_id = t.value ->> 'seatId';

  return v_booking;
end;
$function$;

revoke execute on function public.seat_book(p_rider uuid, p_trip uuid, p_travellers jsonb, p_boarding jsonb, p_drop jsonb, p_phone text, p_email text, p_secured boolean, p_coupon uuid, p_discount integer, p_use_cash boolean) from public, anon, authenticated;
grant execute on function public.seat_book(p_rider uuid, p_trip uuid, p_travellers jsonb, p_boarding jsonb, p_drop jsonb, p_phone text, p_email text, p_secured boolean, p_coupon uuid, p_discount integer, p_use_cash boolean) to service_role;

CREATE OR REPLACE FUNCTION public.seat_cancel(p_booking uuid, p_by text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v public.seat_bookings;
  v_trip public.seat_trips;
  v_hours numeric;
  v_pct integer;
  v_paid bigint;
  v_refund bigint := 0;
begin
  select * into v from public.seat_bookings where id = p_booking for update;
  if not found then
    raise exception 'booking_missing';
  end if;
  if v.status = 'pending' then
    update public.seat_bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = p_by, refund_paise = 0 where id = v.id;
    update public.seat_trip_seats set state = 'available', gender = null, booking_id = null, held_until = null where trip_id = v.trip_id and booking_id = v.id;
    return 0;
  end if;
  if v.status <> 'confirmed' then
    raise exception 'booking_closed';
  end if;

  select * into v_trip from public.seat_trips where id = v.trip_id for update;
  v_paid := v.total_paise + v.cash_paise;
  if p_by = 'rider' then
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
    v_refund := round((v_paid - v.secure_paise) * v_pct / 100.0 / 100.0) * 100;
  else
    v_refund := v_paid;
  end if;

  if v_refund > 0 then
    perform public.ledger_post(v.rider_id, 'seat_refund', v_refund, 'seat_booking', v.id::text, 'Refund for ' || v.pnr);
    perform public.ledger_post(public.platform_wallet(), 'seat_refund', -v_refund, 'seat_booking', v.id::text, null, true);
  end if;

  update public.seat_trip_seats set state = 'available', gender = null, booking_id = null, held_until = null
  where trip_id = v.trip_id and booking_id = v.id;
  update public.seat_bookings
  set status = 'cancelled', cancelled_at = now(), cancelled_by = p_by, refund_paise = v_refund
  where id = v.id;

  if p_by = 'rider' then
    perform public.seat_push(v_trip.captain_id, 'captain', 'Booking cancelled · ' || array_to_string(v.seat_ids, ', '),
      v.pnr || ' on ' || v_trip.code || '. The seats are open for booking again.', jsonb_build_object('tripId', v_trip.id));
  else
    perform public.seat_push(v.rider_id, 'rider', 'Your trip was cancelled',
      v.pnr || ': ' || public.rupee_text(v_refund) || ' is back in your ROVEYA Cash.', jsonb_build_object('pnr', v.pnr));
  end if;
  return v_refund;
end;
$function$;

revoke execute on function public.seat_cancel(p_booking uuid, p_by text) from public, anon, authenticated;
grant execute on function public.seat_cancel(p_booking uuid, p_by text) to service_role;

CREATE OR REPLACE FUNCTION public.seat_confirm(p_booking uuid, p_paid_with text, p_from_wallet boolean DEFAULT false)
 RETURNS seat_bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v public.seat_bookings;
  v_trip public.seat_trips;
  v_taken integer;
  v_ref text;
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
  if p_from_wallet and v.total_paise > 0 then
    perform public.ledger_post(v.rider_id, 'seat_payment', -v.total_paise, 'seat_booking', v_ref, 'Seats on ' || v.pnr);
    perform public.ledger_post(public.platform_wallet(), 'seat_payment', v.total_paise, 'seat_booking', v_ref);
  end if;
  if v.cash_paise > 0 then
    perform public.ledger_post(v.rider_id, 'seat_payment', -v.cash_paise, 'seat_cash', v_ref, 'ROVEYA Cash on ' || v.pnr);
    perform public.ledger_post(public.platform_wallet(), 'seat_payment', v.cash_paise, 'seat_cash', v_ref);
  end if;

  update public.seat_trip_seats s
  set state = 'booked', booking_id = v.id, held_until = null,
      gender = (select t.value ->> 'gender' from jsonb_array_elements(v.travellers) t where t.value ->> 'seatId' = s.seat_id limit 1)
  where s.trip_id = v.trip_id and s.seat_id = any (v.seat_ids);

  update public.seat_bookings
  set status = 'confirmed', paid_with = p_paid_with, confirmed_at = now(), hold_until = greatest(hold_until, now())
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
$function$;

revoke execute on function public.seat_confirm(p_booking uuid, p_paid_with text, p_from_wallet boolean) from public, anon, authenticated;
grant execute on function public.seat_confirm(p_booking uuid, p_paid_with text, p_from_wallet boolean) to service_role;

CREATE OR REPLACE FUNCTION public.seat_push(p_user uuid, p_app text, p_title text, p_body text, p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.push_send(p_user, p_app, 'seats', p_title, p_body, p_data, 'rides');
exception when others then
  null;
end;
$function$;

revoke execute on function public.seat_push(p_user uuid, p_app text, p_title text, p_body text, p_data jsonb) from public, anon, authenticated;
grant execute on function public.seat_push(p_user uuid, p_app text, p_title text, p_body text, p_data jsonb) to service_role;

CREATE OR REPLACE FUNCTION public.seat_release_expired(p_trip uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count integer;
begin
  update public.seat_bookings set status = 'expired'
  where status = 'pending' and hold_until < now() and (p_trip is null or trip_id = p_trip);
  get diagnostics v_count = row_count;
  update public.seat_trip_seats set state = 'available', gender = null, booking_id = null, held_until = null
  where state = 'held' and held_until < now() and (p_trip is null or trip_id = p_trip);
  return v_count;
end;
$function$;

revoke execute on function public.seat_release_expired(p_trip uuid) from public, anon, authenticated;
grant execute on function public.seat_release_expired(p_trip uuid) to service_role;

CREATE OR REPLACE FUNCTION public.seat_sweep()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  perform public.seat_release_expired(null);
  for v_id in select id from public.seat_trips where status = 'on_trip' and arrive_at < now() - interval '6 hours' loop
    perform public.seat_trip_complete(v_id);
  end loop;
  for v_id in select id from public.seat_trips where status = 'scheduled' and depart_at < now() - interval '3 hours' loop
    perform public.seat_trip_cancel(v_id, 'system', 'The trip did not start');
  end loop;
end;
$function$;

revoke execute on function public.seat_sweep() from public, anon, authenticated;
grant execute on function public.seat_sweep() to service_role;

CREATE OR REPLACE FUNCTION public.seat_trip_cancel(p_trip uuid, p_by text, p_reason text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_count integer := 0;
begin
  perform 1 from public.seat_trips where id = p_trip and status = 'scheduled' for update;
  if not found then
    raise exception 'trip_closed';
  end if;
  for v_id in select id from public.seat_bookings where trip_id = p_trip and status in ('pending', 'confirmed') loop
    perform public.seat_cancel(v_id, p_by);
    v_count := v_count + 1;
  end loop;
  update public.seat_trips set status = 'cancelled', cancel_reason = p_reason, cancelled_at = now() where id = p_trip;
  return v_count;
end;
$function$;

revoke execute on function public.seat_trip_cancel(p_trip uuid, p_by text, p_reason text) from public, anon, authenticated;
grant execute on function public.seat_trip_cancel(p_trip uuid, p_by text, p_reason text) to service_role;

CREATE OR REPLACE FUNCTION public.seat_trip_complete(p_trip uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v public.seat_trips;
  v_fare bigint;
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
  select coalesce(sum(fare_paise), 0) into v_fare from public.seat_bookings where trip_id = p_trip and status = 'completed';
  v_net := v_fare - round(v_fare * public.setting_num('seat_commission_pct', 10) / 100.0);
  if v_net > 0 then
    perform public.ledger_post(v.captain_id, 'seat_earning', v_net, 'seat_trip', p_trip::text, 'Seats on ' || v.code);
    perform public.ledger_post(public.platform_wallet(), 'seat_earning', -v_net, 'seat_trip', p_trip::text, null, true);
  end if;
  return v_net;
end;
$function$;

revoke execute on function public.seat_trip_complete(p_trip uuid) from public, anon, authenticated;
grant execute on function public.seat_trip_complete(p_trip uuid) to service_role;

CREATE OR REPLACE FUNCTION public.seat_trip_start(p_trip uuid)
 RETURNS seat_trips
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v public.seat_trips;
  v_booking public.seat_bookings;
begin
  update public.seat_trips set status = 'on_trip', started_at = now()
  where id = p_trip and status = 'scheduled' and depart_at < now() + interval '2 hours'
  returning * into v;
  if not found then
    raise exception 'trip_not_ready';
  end if;
  update public.seat_bookings set status = 'expired' where trip_id = p_trip and status = 'pending';
  update public.seat_trip_seats set state = 'available', gender = null, booking_id = null, held_until = null where trip_id = p_trip and state = 'held';
  for v_booking in select * from public.seat_bookings where trip_id = p_trip and status = 'confirmed' loop
    perform public.seat_push(v_booking.rider_id, 'rider', 'Your car has left · ' || v.code,
      'Track it live from your ticket ' || v_booking.pnr || '.', jsonb_build_object('pnr', v_booking.pnr));
  end loop;
  return v;
end;
$function$;

revoke execute on function public.seat_trip_start(p_trip uuid) from public, anon, authenticated;
grant execute on function public.seat_trip_start(p_trip uuid) to service_role;

CREATE OR REPLACE FUNCTION public.seat_unblock(p_trip uuid, p_captain uuid, p_seats text[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_trip public.seat_trips;
  v_count integer;
begin
  select * into v_trip from public.seat_trips where id = p_trip for update;
  if not found or (p_captain is not null and v_trip.captain_id <> p_captain) then
    raise exception 'trip_missing';
  end if;
  if v_trip.status not in ('scheduled', 'on_trip') then
    raise exception 'trip_closed';
  end if;
  update public.seat_trip_seats
  set state = 'available', gender = null, blocked_at = null
  where trip_id = p_trip and seat_id = any (p_seats) and state = 'blocked';
  get diagnostics v_count = row_count;
  delete from public.seat_offline_passengers where trip_id = p_trip and seat_id = any (p_seats);
  return v_count;
end;
$function$;

revoke execute on function public.seat_unblock(p_trip uuid, p_captain uuid, p_seats text[]) from public, anon, authenticated;
grant execute on function public.seat_unblock(p_trip uuid, p_captain uuid, p_seats text[]) to service_role;

CREATE OR REPLACE FUNCTION public.seat_women_only(p_trip uuid, p_seat text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.seat_trip_seats me
    join public.seat_trip_seats other on other.trip_id = me.trip_id and other.seat_row = me.seat_row and abs(other.seat_col - me.seat_col) = 1
    where me.trip_id = p_trip and me.seat_id = p_seat and other.state in ('booked', 'held', 'blocked') and other.gender = 'Female'
  );
$function$;

grant execute on function public.seat_women_only(p_trip uuid, p_seat text) to anon, authenticated, service_role;

-- set_payout_plan is recovered but not created here.
-- It returns payout_plans and calls plan_period_end. Those two objects were not in the approved export and are not in git.
-- Creating the function without inventing that table would fail. It stays blocked.

