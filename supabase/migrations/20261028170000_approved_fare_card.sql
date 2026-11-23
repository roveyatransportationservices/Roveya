-- Forward-only fare correction. operations.sql is left unchanged.
-- The locked card used when settings cannot be read is bike 12/6/25, auto 5/10/30,
-- cab 60/16/90 (ADMIN_NETWORK src/lib/server/bookings.ts and src/app/api/ride-fares/route.ts).
-- operations.sql seeds bike 25/7/35 and auto 40/13/60. Cab already matches.
-- Each update applies only while the key still holds that seed, so a later desk edit is kept.
-- Do not apply this file to development or production until a separate approval.

update public.platform_settings set value = '12', updated_at = now()
where key = 'fare_bike_base' and value = '25';

update public.platform_settings set value = '6', updated_at = now()
where key = 'fare_bike_per_km' and value = '7';

update public.platform_settings set value = '25', updated_at = now()
where key = 'fare_bike_min' and value = '35';

update public.platform_settings set value = '5', updated_at = now()
where key = 'fare_auto_base' and value = '40';

update public.platform_settings set value = '10', updated_at = now()
where key = 'fare_auto_per_km' and value = '13';

update public.platform_settings set value = '30', updated_at = now()
where key = 'fare_auto_min' and value = '60';
