/**
 * Staging-only probe. Reads env from the Admin service. Prints no secrets.
 * Confirms project host and whether a direct Postgres URL env key exists.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
let host = "none";
try {
  host = new URL(url).host;
} catch {
  host = "invalid";
}
const expected = "pqnfipleuztivnrsyvkd.supabase.co";
const dbKeys = ["DATABASE_URL", "SUPABASE_DB_URL", "POSTGRES_URL", "DIRECT_URL", "SUPABASE_DB_PASSWORD"].filter(
  (key) => Boolean(process.env[key] && String(process.env[key]).trim()),
);
console.log(
  JSON.stringify({
    host,
    stagingProject: host === expected,
    hasServiceRole: Boolean(process.env.SUPABASE_SECRET_KEY),
    directDbEnvKeysPresent: dbKeys,
  }),
);
if (host !== expected) process.exit(2);
