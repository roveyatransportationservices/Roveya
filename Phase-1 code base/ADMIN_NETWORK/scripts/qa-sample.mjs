// Lists sample captains, riders, and trips, then marks review captains approved.
// Never prints connection secrets. Usage: node scripts/qa-sample.mjs [approve]
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const approve = process.argv.includes("approve");

const { data: captains, error: captainError } = await db.from("captains").select("user_id,captain_code,name,vehicle,service,status,city").order("captain_code");
if (captainError) {
  console.error("captains", captainError.message);
  process.exit(1);
}
console.log("CAPTAINS");
for (const row of captains ?? []) console.log([row.captain_code, row.name, row.service, row.vehicle, row.status, row.city].join("\t"));

const { data: riders, error: riderError } = await db.from("riders").select("name,status,city").order("name");
if (riderError) console.error("riders", riderError.message);
else {
  console.log("RIDERS");
  for (const row of riders ?? []) console.log([row.name, row.status, row.city].join("\t"));
}

const { count: trips } = await db.from("trips").select("id", { count: "exact", head: true });
const { count: seatTrips } = await db.from("seat_trips").select("id", { count: "exact", head: true });
console.log(`TRIPS ${trips ?? 0}  SEAT_TRIPS ${seatTrips ?? 0}`);

if (!approve) {
  const review = (captains ?? []).filter((row) => row.status === "review").length;
  console.log(`REVIEW ${review}. Pass approve to mark them active.`);
  process.exit(0);
}

const now = new Date().toISOString();
const pending = (captains ?? []).filter((row) => row.status === "review" || row.status === "suspended");
for (const row of pending) {
  const docs = await db.from("captain_documents").update({ status: "verified", review_note: null, reviewed_at: now, expires_on: "2030-12-31" }).eq("captain_id", row.user_id).in("status", ["uploaded", "rejected"]);
  if (docs.error) console.error("docs", row.captain_code, docs.error.message);
  const car = await db.from("seat_cars").update({ status: "active", review_note: null }).eq("captain_id", row.user_id).eq("status", "review");
  if (car.error && !/relation|schema cache/i.test(car.error.message)) console.error("car", row.captain_code, car.error.message);
  const saved = await db.from("captains").update({ status: "active", status_note: null, approved_at: now }).eq("user_id", row.user_id).in("status", ["review", "suspended"]);
  console.log(saved.error ? `FAIL ${row.captain_code} ${saved.error.message}` : `APPROVED ${row.captain_code} ${row.name}`);
}
