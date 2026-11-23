-- Forward-only schema for databases that already applied an earlier copy of
-- 20261028140000_seat_booking_fee.sql before that file created admin_controls.
-- create schema if not exists is safe when the schema is already present.
-- This file does not replace the seat view and does not change fees or refunds.
-- Do not edit 20261028140000 on a database whose schema_migrations checksum
-- already records that version. Compare checksums before any staging apply.

create schema if not exists admin_controls;
