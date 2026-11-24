// Local outbox checks. It runs only against a disposable database named roveya_notice_test on 127.0.0.1.
// It does not read staging credentials and it does not call a push provider.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const url = process.env.ROVEYA_NOTICE_TEST_URL ?? "";
const databaseName = (() => {
  try { return new URL(url).pathname.replace(/^\//, ""); } catch { return ""; }
})();
const host = (() => {
  try { return new URL(url).hostname; } catch { return ""; }
})();
const allowed = Boolean(url) && databaseName === "roveya_notice_test" && host === "127.0.0.1";

if (!allowed) {
  test("notice outbox database", { skip: "Set ROVEYA_NOTICE_TEST_URL to postgres://127.0.0.1/<port>/roveya_notice_test." }, () => {});
} else {
  const { default: pg } = await import("pg");
  const patch = readFileSync(new URL("../../../../../ROVEYA_PHASE3_STAGING/unified_notice_outbox.sql", import.meta.url), "utf8");
  const pool = new pg.Pool({ connectionString: url, max: 8 });
  const rider = "11111111-1111-4111-8111-111111111111";
  const captain = "22222222-2222-4222-8222-222222222222";
  const other = "33333333-3333-4333-8333-333333333333";

  test.before(async () => {
    await pool.query(`
      drop schema if exists public cascade;
      create schema public;
      create table public.trips (
        id uuid primary key default gen_random_uuid(),
        rider_id uuid not null,
        captain_id uuid,
        code text not null default 'RV1',
        status text not null,
        fare_paise bigint not null default 2500,
        discount_paise bigint not null default 0,
        pickup_name text not null default 'Pickup',
        drop_name text not null default 'Drop',
        cancelled_by text,
        cancel_reason text
      );
      create table public.trip_offers (
        id uuid primary key default gen_random_uuid(),
        trip_id uuid not null references public.trips (id),
        captain_id uuid not null,
        status text not null default 'offered',
        pickup_km numeric not null default 1,
        expires_at timestamptz not null default now() + interval '15 seconds'
      );
      create table public.communication_events (
        id bigint generated always as identity primary key,
        event_key text not null unique,
        kind text not null,
        channel text not null,
        audience text not null,
        ref_type text,
        ref_id text,
        status text not null,
        attempts integer not null default 1,
        last_error text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        offer_id uuid
      );
    `);
    await pool.query(`
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
        if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
        if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
      end $$;
    `);
    await pool.query(patch);
    await pool.query(`
      create trigger trip_offers_push after insert on public.trip_offers for each row execute function public.offers_push();
    `);
  });

  test.after(async () => {
    await pool.end();
  });

  const trip = async (status, captainId = null) => {
    const row = await pool.query(
      `insert into public.trips (rider_id, captain_id, status) values ($1, $2, $3) returning id`,
      [rider, captainId, status],
    );
    return row.rows[0].id;
  };

  const keys = async (tripId) => {
    const row = await pool.query(`select event_key, kind, audience, status, attempts from public.communication_events where ref_id = $1 order by event_key`, [tripId]);
    return row.rows;
  };

  test("an offered insert stores one captain event and a rejected insert stores none", async () => {
    const id = await trip("searching");
    const offer = await pool.query(
      `insert into public.trip_offers (trip_id, captain_id, status) values ($1, $2, 'offered') returning id`,
      [id, captain],
    );
    const created = await keys(id);
    assert.equal(created.length, 1);
    assert.equal(created[0].event_key, `captain:offer:${offer.rows[0].id}:created`);
    assert.equal(created[0].kind, "offer_created");
    assert.equal(created[0].audience, "captain");
    assert.equal(created[0].status, "queued");
    assert.equal(created[0].attempts, 0);
    await pool.query(`insert into public.trip_offers (trip_id, captain_id, status) values ($1, $2, 'rejected')`, [id, other]);
    assert.equal((await keys(id)).length, 1);
  });

  test("the same offer key from the trigger and a second writer stays one row", async () => {
    const id = await trip("searching");
    const offer = await pool.query(`insert into public.trip_offers (trip_id, captain_id) values ($1, $2) returning id`, [id, captain]);
    await pool.query(
      `select public.enqueue_notice($1, 'offer_created', 'offers', 'captain', $2, 'New ride request', 'waiting', 'trip', $3, $4)`,
      [`captain:offer:${offer.rows[0].id}:created`, captain, id, offer.rows[0].id],
    );
    const count = await pool.query(`select count(*)::int as n from public.communication_events where event_key = $1`, [`captain:offer:${offer.rows[0].id}:created`]);
    assert.equal(count.rows[0].n, 1);
  });

  test("two claims of one fresh event produce one winner", async () => {
    const id = await trip("searching");
    const offer = await pool.query(`insert into public.trip_offers (trip_id, captain_id) values ($1, $2) returning id`, [id, captain]);
    const key = `captain:offer:${offer.rows[0].id}:created`;
    const claim = (client) => client.query(
      `update public.communication_events set last_error = 'claimed', attempts = attempts + 1, updated_at = now()
       where event_key = $1 and status = 'queued' and last_error is null and attempts = 0 returning event_key`,
      [key],
    );
    const [a, b] = await Promise.all([pool.connect(), pool.connect()]);
    try {
      const [first, second] = await Promise.all([claim(a), claim(b)]);
      assert.equal(first.rowCount + second.rowCount, 1);
    } finally {
      a.release();
      b.release();
    }
  });

  test("passenger cancel, desk cancel, desk assignment, and search expiry store the shared keys", async () => {
    const passenger = await trip("assigned", captain);
    await pool.query(`update public.trips set status = 'cancelled', cancelled_by = 'rider', cancel_reason = 'changed plans' where id = $1`, [passenger]);
    assert.deepEqual((await keys(passenger)).map((row) => row.event_key), [`city:${passenger}:rider-cancelled:${captain}`]);

    const desk = await trip("assigned", captain);
    await pool.query(`update public.trips set status = 'cancelled', cancelled_by = 'system', cancel_reason = 'Desk closed it' where id = $1`, [desk]);
    assert.deepEqual((await keys(desk)).map((row) => row.event_key), [`city:${desk}:desk-cancelled`, `city:${desk}:desk-cancelled:${captain}`]);

    const assigned = await trip("searching");
    await pool.query(`update public.trips set status = 'assigned', captain_id = $2 where id = $1`, [assigned, captain]);
    assert.deepEqual((await keys(assigned)).map((row) => row.event_key), [`city:${assigned}:assigned:${captain}:v1`]);

    const expired = await trip("searching");
    await pool.query(`update public.trips set status = 'expired' where id = $1`, [expired]);
    assert.deepEqual((await keys(expired)).map((row) => row.event_key), [`city:${expired}:no-captain`]);
  });

  test("a rolled-back ride leaves no notice, and an unknown row cannot be claimed again", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const id = (await client.query(`insert into public.trips (rider_id, status) values ($1, 'searching') returning id`, [rider])).rows[0].id;
      await client.query(`insert into public.trip_offers (trip_id, captain_id) values ($1, $2)`, [id, captain]);
      const during = await client.query(`select count(*)::int as n from public.communication_events where ref_id = $1`, [id]);
      assert.equal(during.rows[0].n, 1);
      await client.query("rollback");
      const after = await pool.query(`select count(*)::int as n from public.communication_events where ref_id = $1`, [id]);
      assert.equal(after.rows[0].n, 0);
    } finally {
      client.release();
    }
    const id = await trip("searching");
    const offer = await pool.query(`insert into public.trip_offers (trip_id, captain_id) values ($1, $2) returning id`, [id, captain]);
    const key = `captain:offer:${offer.rows[0].id}:created`;
    await pool.query(`update public.communication_events set status = 'unknown', last_error = 'timeout' where event_key = $1`, [key]);
    const again = await pool.query(
      `update public.communication_events set last_error = 'claimed' where event_key = $1 and status = 'queued' and last_error is null returning event_key`,
      [key],
    );
    assert.equal(again.rowCount, 0);
  });

  test("repeated assignments keep a new version and the same captain can return", async () => {
    const id = await trip("searching");
    const version = async () => (await pool.query(`select assignment_version from public.trips where id = $1`, [id])).rows[0].assignment_version;
    await pool.query(`update public.trips set status = 'assigned', captain_id = $2 where id = $1`, [id, captain]);
    assert.equal(await version(), 1);
    await pool.query(`update public.trips set status = 'assigned', captain_id = $2 where id = $1`, [id, captain]);
    assert.equal(await version(), 1);
    await pool.query(`update public.trips set fare_paise = fare_paise where id = $1`, [id]);
    assert.equal(await version(), 1);
    await pool.query(`update public.trips set status = 'searching', captain_id = null where id = $1`, [id]);
    assert.equal(await version(), 1);
    assert.equal((await keys(id)).some((row) => row.event_key === `city:${id}:captain-released:${captain}:v1`), true);
    await pool.query(`update public.trips set status = 'assigned', captain_id = $2 where id = $1`, [id, captain]);
    assert.equal(await version(), 2);
    assert.equal((await keys(id)).some((row) => row.event_key === `city:${id}:assigned:${captain}:v2`), true);
    await pool.query(`update public.trips set captain_id = $2 where id = $1 and status = 'assigned'`, [id, other]);
    assert.equal(await version(), 3);
    const swapped = (await keys(id)).map((row) => row.event_key);
    assert.equal(swapped.includes(`city:${id}:captain-changed:${other}:v3`), true);
    assert.equal(swapped.includes(`city:${id}:desk-assign:${other}:v3`), true);
    assert.equal(swapped.includes(`city:${id}:desk-released:${captain}:v2`), true);
    await pool.query(`update public.trips set captain_id = $2 where id = $1 and status = 'assigned'`, [id, captain]);
    assert.equal(await version(), 4);
    assert.equal((await keys(id)).some((row) => row.event_key === `city:${id}:captain-changed:${captain}:v4`), true);
    assert.equal((await keys(id)).filter((row) => row.event_key === `city:${id}:assigned:${captain}:v1`).length, 1);
    assert.equal((await keys(id)).filter((row) => row.event_key === `city:${id}:assigned:${captain}:v2`).length, 1);
  });

  test("two assignment updates and two claims each leave one winner", async () => {
    const id = await trip("searching");
    const claimUpdate = (client, who) => client.query(
      `update public.trips set status = 'assigned', captain_id = $2 where id = $1 and status = 'searching' and captain_id is null returning assignment_version`,
      [id, who],
    );
    const [a, b] = await Promise.all([pool.connect(), pool.connect()]);
    try {
      const [first, second] = await Promise.all([claimUpdate(a, captain), claimUpdate(b, other)]);
      assert.equal(first.rowCount + second.rowCount, 1);
    } finally {
      a.release();
      b.release();
    }
    const stored = await pool.query(`select assignment_version, captain_id from public.trips where id = $1`, [id]);
    assert.equal(stored.rows[0].assignment_version, 1);
    const notice = await pool.query(`select count(*)::int as n from public.communication_events where ref_id = $1 and event_key like '%:assigned:%:v1'`, [id]);
    assert.equal(notice.rows[0].n, 1);
  });

  test("a rolled-back assignment does not keep its version, and an old row starts at zero", async () => {
    const client = await pool.connect();
    const id = await trip("searching");
    try {
      await client.query("begin");
      await client.query(`update public.trips set status = 'assigned', captain_id = $2 where id = $1`, [id, captain]);
      const during = await client.query(`select assignment_version from public.trips where id = $1`, [id]);
      assert.equal(during.rows[0].assignment_version, 1);
      await client.query("rollback");
    } finally {
      client.release();
    }
    const after = await pool.query(`select assignment_version, status from public.trips where id = $1`, [id]);
    assert.equal(after.rows[0].assignment_version, 0);
    assert.equal(after.rows[0].status, "searching");
    const legacy = await pool.query(`insert into public.trips (rider_id, captain_id, status, assignment_version) values ($1, $2, 'assigned', 0) returning id, assignment_version`, [rider, captain]);
    assert.equal(legacy.rows[0].assignment_version, 0);
    await pool.query(`update public.trips set pickup_name = 'Gate' where id = $1`, [legacy.rows[0].id]);
    const stayed = await pool.query(`select assignment_version from public.trips where id = $1`, [legacy.rows[0].id]);
    assert.equal(stayed.rows[0].assignment_version, 0);
  });

  test("the installed functions do not send, and both triggers remain", async () => {
    const source = await pool.query(`select proname, position('push_send' in prosrc) as sends from pg_proc where proname in ('offers_push', 'trips_push', 'enqueue_notice')`);
    assert.equal(source.rows.length, 3);
    assert.equal(source.rows.every((row) => row.sends === 0), true);
    const triggers = await pool.query(`select tgname, tgenabled from pg_trigger where not tgisinternal and tgname in ('trip_offers_push', 'trips_push') order by tgname`);
    assert.deepEqual(triggers.rows.map((row) => row.tgname), ["trip_offers_push", "trips_push"]);
    assert.equal(triggers.rows.every((row) => row.tgenabled === "O"), true);
  });
}
