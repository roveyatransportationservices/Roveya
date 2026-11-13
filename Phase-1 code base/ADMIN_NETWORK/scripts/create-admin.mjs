// Creates or resets an ADMIN_NETWORK login.
//   npm run create-admin -- --email you@roveya.com --name "Your Name" --role super_admin [--phone 9876543210]
// Prints a one-time password; the admin is asked to change it after the first login.
import { randomBytes, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]),
);

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, all) => (value.startsWith("--") ? [...pairs, [value.slice(2), all[index + 1]]] : pairs), []),
);
const email = String(args.email ?? "").trim().toLowerCase();
const name = String(args.name ?? "").trim();
const role = String(args.role ?? "super_admin");
if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email) || name.length < 2) {
  console.error('Usage: npm run create-admin -- --email you@roveya.com --name "Your Name" [--role super_admin|finance|operations|support|viewer]');
  process.exit(1);
}
const phone = args.phone ? String(args.phone).replace(/\D/g, "").slice(-10) : null;
const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const { data: roles, error: rolesError } = await client.schema("admin_controls").from("roles").select("key");
const known = rolesError ? ["super_admin"] : (roles ?? []).map((row) => row.key);
if (!known.includes(role)) {
  console.error(`Role must be one of: ${known.join(", ")}.`);
  process.exit(1);
}

const password = `${randomBytes(9).toString("base64url")}${Math.floor(10 + Math.random() * 89)}`;
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
const passwordHash = `scrypt$16384$${salt.toString("base64")}$${hash.toString("base64")}`;
const { error } = await client
  .schema("admin_controls")
  .from("admins")
  .upsert({ email, name, role, password_hash: passwordHash, active: true, must_change_password: true, failed_logins: 0, locked_until: null, ...(phone && !rolesError ? { phone } : null) }, { onConflict: "email" });
if (error) {
  console.error(error.message.includes("schema") ? "Add admin_controls to Supabase > Project Settings > Data API > Exposed schemas, then run this again." : error.message);
  process.exit(1);
}
console.log(`Admin ready: ${email} (${role})`);
console.log(`One-time password: ${password}`);
console.log("Log in at http://localhost:3006 and set your own password.");
