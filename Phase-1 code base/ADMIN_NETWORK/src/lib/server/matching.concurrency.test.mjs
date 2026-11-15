// Database concurrency harness for Phase 1 matching.
// Not an in-memory simulation. It talks to PostgreSQL.
//
// It runs only when ALL of these are true:
//   ROVEYA_TEST_DATABASE_URL is set
//   the database name is exactly roveya_match_test
//   the host is localhost or 127.0.0.1
//
// It does not read .env.local. It will not connect to Supabase.
// It creates its own tables inside that local database and applies 015, then 016.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import test from "node:test";

const url = process.env.ROVEYA_TEST_DATABASE_URL ?? "";
const databaseName = (() => {
  try {
    return new URL(url).pathname.replace(/^\//, "");
  } catch {
    return "";
  }
})();
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
})();
const allowed = Boolean(url) && databaseName === "roveya_match_test" && (host === "localhost" || host === "127.0.0.1");

if (!allowed) {
  test("database concurrency harness", { skip: "Set ROVEYA_TEST_DATABASE_URL to postgres://127.0.0.1:5432/roveya_match_test. This harness does not run against Supabase." }, () => {});
} else {
  const { default: pg } = await import("pg");
  const sql015 = readFileSync(new URL("../../../ADMIN CONTROLS/015_one_live_offer.sql", import.meta.url), "utf8");
  const sql016 = readFileSync(new URL("../../../ADMIN CONTROLS/016_accept_safety.sql", import.meta.url), "utf8");
  const schema = `
    drop schema if exists public cascade;
    create schema public;
    create table public.trips (
      id uuid primary key default gen_random_uuid(),
      rider_id uuid not null,
      captain_id uuid,
      vehicle text not null,
      status text not null,
      code text not null default 'T',
      payment text not null default 'cash',
      payment_status text not null default 'due',
      fare_paise integer not null default 2500,
      requested_at timestamptz not null default now(),
      assigned_at timestamptz,
      cancelled_at timestamptz,
      cancelled_by text,
      cancel_reason text
    );
    create table public.captains (
      user_id uuid primary key,
      status text not null
    );
    create unique index trips_one_open_per_rider on public.trips (rider_id)
      where status in ('searching', 'assigned', 'arrived', 'on_trip');
    create unique index trips_one_active_captain on public.trips (captain_id)
      where status in ('assigned', 'arrived', 'on_trip') and captain_id is not null;
    create table public.trip_offers (
      id uuid primary key default gen_random_uuid(),
      trip_id uuid not null references public.trips (id),
      captain_id uuid not null,
      status text not null,
      pickup_km numeric not null default 0,
      expires_at timestamptz not null,
      decided_at timestamptz,
      created_at timestamptz not null default now()
    );
    create unique index trip_offers_one_live_captain on public.trip_offers (captain_id) where status = 'offered';
    create table public.captain_presence (
      captain_id uuid primary key,
      online boolean not null,
      updated_at timestamptz not null,
      latitude double precision,
      longitude double precision,
      vehicle text not null default 'bike'
    );
  `;

  const pool = new pg.Pool({ connectionString: url, max: 20 });
  const started = performance.now();

  test.before(async () => {
    await pool.query(schema);
    await pool.query(sql015);
    await pool.query(sql016);
  });

  test.after(async () => {
    await pool.end();
  });

  const fresh = async (captainId, status = "active") => {
    await pool.query(
      `insert into public.captains (user_id, status) values ($1, $2)
       on conflict (user_id) do update set status = excluded.status`,
      [captainId, status],
    );
    await pool.query(
      `insert into public.captain_presence (captain_id, online, updated_at, latitude, longitude)
       values ($1, true, now(), 17.4, 78.4)
       on conflict (captain_id) do update set online = true, updated_at = now(), latitude = 17.4, longitude = 78.4`,
      [captainId],
    );
  };

  const ride = async (riderId) => {
    const row = await pool.query(
      `insert into public.trips (rider_id, vehicle, status) values ($1, 'bike', 'searching') returning id`,
      [riderId],
    );
    return row.rows[0].id;
  };

  const offer = async (tripId, captainId, seconds = 60) => {
    const row = await pool.query(
      `insert into public.trip_offers (trip_id, captain_id, status, expires_at)
       values ($1, $2, 'offered', now() + ($3 || ' seconds')::interval) returning id`,
      [tripId, captainId, String(seconds)],
    );
    return row.rows[0].id;
  };

  test("1. one hundred customers can each create one searching ride", async () => {
    const jobs = Array.from({ length: 100 }, (_, index) => ride(`00000000-0000-4000-8000-${String(index).padStart(12, "0")}`));
    const ids = await Promise.all(jobs);
    assert.equal(new Set(ids).size, 100);
    const count = await pool.query(`select count(*)::int as n from public.trips where rider_id::text like '00000000-0000-4000-8000-%'`);
    assert.equal(count.rows[0].n, 100);
  });

  test("2. two captains cannot both accept one ride", async () => {
    const tripId = await ride("10000000-0000-4000-8000-000000000002");
    const a = "20000000-0000-4000-8000-00000000000a";
    const b = "20000000-0000-4000-8000-00000000000b";
    await fresh(a);
    await fresh(b);
    const offerA = await offer(tripId, a);
    await pool.query(`update public.trip_offers set status = 'withdrawn' where id = $1`, [offerA]);
    const first = await offer(tripId, a);
    const second = await offer(tripId, b).catch((error) => error);
    assert.equal(second.code, "23505");
    const clients = [await pool.connect(), await pool.connect()];
    const results = await Promise.all(clients.map((client, index) => client.query(`select public.accept_city_offer($1, $2) as ok`, [first, index === 0 ? a : b]).finally(() => client.release())));
    const wins = results.filter((result) => result.rows[0].ok === true);
    assert.equal(wins.length, 1);
    const trip = await pool.query(`select captain_id, status from public.trips where id = $1`, [tripId]);
    assert.equal(trip.rows[0].status, "assigned");
    assert.equal(trip.rows[0].captain_id, a);
  });

  test("3. one captain cannot hold two live offers", async () => {
    const captainId = "20000000-0000-4000-8000-000000000003";
    await fresh(captainId);
    const firstTrip = await ride("10000000-0000-4000-8000-000000000031");
    const secondTrip = await ride("10000000-0000-4000-8000-000000000032");
    await offer(firstTrip, captainId);
    const second = await offer(secondTrip, captainId).catch((error) => error);
    assert.equal(second.code, "23505");
  });

  test("4. two workers accepting one offer leave one assignment", async () => {
    const tripId = await ride("10000000-0000-4000-8000-000000000004");
    const captainId = "20000000-0000-4000-8000-000000000004";
    await fresh(captainId);
    const offerId = await offer(tripId, captainId);
    const clients = [await pool.connect(), await pool.connect()];
    const results = await Promise.all(clients.map((client) => client.query(`select public.accept_city_offer($1, $2) as ok`, [offerId, captainId]).finally(() => client.release())));
    assert.equal(results.filter((result) => result.rows[0].ok === true).length, 1);
    assert.equal(results.filter((result) => result.rows[0].ok === false).length, 1);
  });

  test("5. a repeated booking for one passenger is rejected", async () => {
    const riderId = "10000000-0000-4000-8000-000000000005";
    await ride(riderId);
    const again = await ride(riderId).catch((error) => error);
    assert.equal(again.code, "23505");
  });

  test("6. an expired offer cannot be accepted", async () => {
    const tripId = await ride("10000000-0000-4000-8000-000000000006");
    const captainId = "20000000-0000-4000-8000-000000000006";
    await fresh(captainId);
    const offerId = await offer(tripId, captainId, -5);
    const result = await pool.query(`select public.accept_city_offer($1, $2) as ok`, [offerId, captainId]);
    assert.equal(result.rows[0].ok, false);
    const trip = await pool.query(`select status, captain_id from public.trips where id = $1`, [tripId]);
    assert.equal(trip.rows[0].status, "searching");
    assert.equal(trip.rows[0].captain_id, null);
  });

  test("7. a late accept does not replace the assigned captain", async () => {
    const tripId = await ride("10000000-0000-4000-8000-000000000007");
    const first = "20000000-0000-4000-8000-000000000071";
    const late = "20000000-0000-4000-8000-000000000072";
    await fresh(first);
    await fresh(late);
    const offerId = await offer(tripId, first);
    const won = await pool.query(`select public.accept_city_offer($1, $2) as ok`, [offerId, first]);
    assert.equal(won.rows[0].ok, true);
    await pool.query(`update public.trip_offers set status = 'offered', expires_at = now() + interval '30 seconds' where id = $1`, [offerId]);
    await pool.query(`update public.trip_offers set captain_id = $2 where id = $1`, [late, offerId]);
    const lateResult = await pool.query(`select public.accept_city_offer($1, $2) as ok`, [offerId, late]);
    assert.equal(lateResult.rows[0].ok, false);
    const trip = await pool.query(`select captain_id from public.trips where id = $1`, [tripId]);
    assert.equal(trip.rows[0].captain_id, first);
  });

  test("8. an offline captain cannot accept", async () => {
    const tripId = await ride("10000000-0000-4000-8000-000000000008");
    const captainId = "20000000-0000-4000-8000-000000000008";
    await fresh(captainId);
    const offerId = await offer(tripId, captainId);
    await pool.query(`update public.captain_presence set online = false where captain_id = $1`, [captainId]);
    const result = await pool.query(`select public.accept_city_offer($1, $2) as ok`, [offerId, captainId]);
    assert.equal(result.rows[0].ok, false);
    const trip = await pool.query(`select status from public.trips where id = $1`, [tripId]);
    assert.equal(trip.rows[0].status, "searching");
  });

  test("9. a new connection after a restart can still accept a stored offer", async () => {
    const tripId = await ride("10000000-0000-4000-8000-000000000009");
    const captainId = "20000000-0000-4000-8000-000000000009";
    await fresh(captainId);
    const offerId = await offer(tripId, captainId);
    const restarted = await pool.connect();
    const result = await restarted.query(`select public.accept_city_offer($1, $2) as ok`, [offerId, captainId]);
    restarted.release();
    assert.equal(result.rows[0].ok, true);
  });

  test("10. a failed transaction does not assign the ride", async () => {
    const tripId = await ride("10000000-0000-4000-8000-000000000010");
    const captainId = "20000000-0000-4000-8000-000000000010";
    await fresh(captainId);
    const offerId = await offer(tripId, captainId);
    const client = await pool.connect();
    await client.query("begin");
    await client.query(`select public.accept_city_offer($1, $2)`, [offerId, captainId]);
    client.release(new Error("connection dropped"));
    const trip = await pool.query(`select status, captain_id from public.trips where id = $1`, [tripId]);
    assert.equal(trip.rows[0].status, "searching");
    assert.equal(trip.rows[0].captain_id, null);
  });

  test("11. two workers cannot both expire one offer into two outcomes", async () => {
    const tripId = await ride("10000000-0000-4000-8000-000000000011");
    const captainId = "20000000-0000-4000-8000-000000000011";
    const offerId = await offer(tripId, captainId, -5);
    const clients = [await pool.connect(), await pool.connect()];
    const results = await Promise.all(clients.map((client) => client.query(
      `update public.trip_offers set status = 'rejected', decided_at = now() where id = $1 and status = 'offered' returning id`,
      [offerId],
    ).finally(() => client.release())));
    const changed = results.reduce((sum, result) => sum + result.rowCount, 0);
    assert.equal(changed, 1);
    const accept = await pool.query(`select public.accept_city_offer($1, $2) as ok`, [offerId, captainId]);
    assert.equal(accept.rows[0].ok, false);
  });

  test("12. a cancel during accept leaves one final status", async () => {
    const riderId = "10000000-0000-4000-8000-000000000012";
    const captainId = "20000000-0000-4000-8000-000000000012";
    await fresh(captainId);
    for (let attempt = 0; attempt < 25; attempt += 1) {
      await pool.query(`update public.trips set status = 'cancelled', captain_id = null where rider_id = $1 and status in ('searching', 'assigned', 'arrived')`, [riderId]);
      const tripId = await ride(riderId);
      const offerId = await offer(tripId, captainId);
      const clients = [await pool.connect(), await pool.connect()];
      const [accepted, cancelled] = await Promise.all([
        clients[0].query(`select public.accept_city_offer($1, $2) as ok`, [offerId, captainId]).finally(() => clients[0].release()),
        clients[1].query(`select public.cancel_city_ride($1, $2, $3) as ok`, [tripId, riderId, "changed plans"]).finally(() => clients[1].release()),
      ]);
      const trip = await pool.query(`select status, captain_id, cancelled_at, rider_id from public.trips where id = $1`, [tripId]);
      const offers = await pool.query(`select count(*)::int as n from public.trip_offers where trip_id = $1 and status = 'offered'`, [tripId]);
      const status = trip.rows[0].status;
      assert.ok(status === "assigned" || status === "cancelled", `attempt ${attempt} status ${status}`);
      assert.equal(offers.rows[0].n, 0);
      if (status === "assigned") {
        assert.equal(accepted.rows[0].ok, true);
        assert.equal(trip.rows[0].captain_id, captainId);
        assert.equal(trip.rows[0].cancelled_at, null);
        assert.equal(cancelled.rows[0].ok, false);
      }
      if (status === "cancelled") {
        assert.equal(cancelled.rows[0].ok, true);
        if (accepted.rows[0].ok === true) assert.equal(trip.rows[0].captain_id, captainId);
        if (accepted.rows[0].ok === false) assert.equal(trip.rows[0].captain_id, null);
      }
      await pool.query(`update public.trips set status = 'cancelled', captain_id = null where id = $1`, [tripId]);
    }
    console.log("elapsed_ms", Math.round(performance.now() - started));
  });

  test("13. a suspended captain cannot accept", async () => {
    const tripId = await ride("10000000-0000-4000-8000-000000000013");
    const captainId = "20000000-0000-4000-8000-000000000013";
    await fresh(captainId, "suspended");
    const offerId = await offer(tripId, captainId);
    const result = await pool.query(`select public.accept_city_offer($1, $2) as ok`, [offerId, captainId]);
    assert.equal(result.rows[0].ok, false);
    const trip = await pool.query(`select status, captain_id from public.trips where id = $1`, [tripId]);
    assert.equal(trip.rows[0].status, "searching");
    assert.equal(trip.rows[0].captain_id, null);
  });

  test("14. a stale GPS fix cannot accept", async () => {
    const tripId = await ride("10000000-0000-4000-8000-000000000014");
    const captainId = "20000000-0000-4000-8000-000000000014";
    await fresh(captainId);
    const offerId = await offer(tripId, captainId);
    await pool.query(`update public.captain_presence set updated_at = now() - interval '10 minutes' where captain_id = $1`, [captainId]);
    const result = await pool.query(`select public.accept_city_offer($1, $2) as ok`, [offerId, captainId]);
    assert.equal(result.rows[0].ok, false);
    const trip = await pool.query(`select status from public.trips where id = $1`, [tripId]);
    assert.equal(trip.rows[0].status, "searching");
  });
}
