import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { can, PERMISSION_KEYS, type Permission } from "@/lib/roles";
import { ApiError, check } from "./api";
import { controls } from "./db";

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number }) => Promise<Buffer>;

// The admin panel and the Support Desk keep separate sessions, so both can be signed in side by side in one browser.
// Each window says which one it belongs to with the x-rv-lane header; the session itself decides who you are.
export const COOKIE = "rv_admin";
export const DESK_COOKIE = "rv_desk";
export type Lane = "admin" | "desk";
const cookieFor = (lane: Lane) => (lane === "desk" ? DESK_COOKIE : COOKIE);
async function laneOf(): Promise<Lane | null> {
  const value = (await headers()).get("x-rv-lane");
  return value === "desk" || value === "admin" ? value : null;
}
const SESSION_HOURS = 12;
const COST = { N: 16384, r: 8, p: 1 };
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

export const THEMES = ["dark", "light", "system"] as const;
export type Theme = (typeof THEMES)[number];

// workspace: "admin" opens the full panel; "support_desk" opens only the Support Desk dashboard.
export type Workspace = "admin" | "support_desk";
export type Admin = { id: string; email: string; name: string; phone: string | null; role: string; roleName: string; permissions: Permission[]; mustChangePassword: boolean; lastLoginAt: string | null; theme: Theme; workspace: Workspace };

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, COST);
  return `scrypt$${COST.N}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

async function verifyPassword(password: string, stored: string) {
  const [scheme, n, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length, { ...COST, N: Number(n) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const digest = (token: string) => createHash("sha256").update(token).digest("hex");

export const passwordRule = (password: string) => {
  if (password.length < 10) return "Use at least 10 characters.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use letters and numbers together.";
  return null;
};

type Row = { id: string; email: string; name: string; phone?: string | null; role: string; password_hash: string; active: boolean; must_change_password: boolean; failed_logins: number; locked_until: string | null; last_login_at: string | null; theme?: string | null };
type RoleRow = { name: string; permissions: string[]; workspace?: string | null } | null;

// The founder's role always carries every permission, so a new permission never locks them out.
async function roleOf(key: string): Promise<RoleRow> {
  let found = await controls().from("roles").select("name,permissions,workspace").eq("key", key).maybeSingle();
  // Before ADMIN CONTROLS/007 is run there is no workspace column yet.
  if (found.error && /workspace/.test(found.error.message)) found = await controls().from("roles").select("name,permissions").eq("key", key).maybeSingle();
  if (found.error) {
    if (/roles/.test(found.error.message)) return key === "super_admin" ? { name: "Founder · Super admin", permissions: PERMISSION_KEYS } : null;
    check(found);
  }
  return found.data as RoleRow;
}

function shape(row: Row, role: RoleRow): Admin {
  const permissions = row.role === "super_admin" ? PERMISSION_KEYS : ((role?.permissions ?? []).filter((key) => (PERMISSION_KEYS as string[]).includes(key)) as Permission[]);
  return { id: row.id, email: row.email, name: row.name, phone: row.phone ?? null, role: row.role, roleName: role?.name ?? row.role, permissions, mustChangePassword: row.must_change_password, lastLoginAt: row.last_login_at, theme: (THEMES as readonly string[]).includes(row.theme ?? "") ? (row.theme as Theme) : "dark", workspace: row.role !== "super_admin" && role?.workspace === "support_desk" ? "support_desk" : "admin" };
}

export async function login(email: string, password: string) {
  const table = controls().from("admins");
  const found = await table.select("*").eq("email", email.trim().toLowerCase()).maybeSingle();
  if (found.error) check(found);
  const row = found.data as Row | null;
  const wrong = new ApiError("That email and password do not match.", 401);
  if (!row || !row.active) {
    await verifyPassword(password, "scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==");
    throw wrong;
  }
  if (row.locked_until && Date.parse(row.locked_until) > Date.now()) {
    throw new ApiError(`Too many wrong attempts. Try again after ${new Date(row.locked_until).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}.`, 429);
  }
  if (!(await verifyPassword(password, row.password_hash))) {
    const fails = row.failed_logins + 1;
    await table.update({ failed_logins: fails, locked_until: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null }).eq("id", row.id);
    throw wrong;
  }

  const token = randomBytes(32).toString("base64url");
  const head = await headers();
  const expires = new Date(Date.now() + SESSION_HOURS * 3600000);
  check(
    await controls()
      .from("sessions")
      .insert({ token_hash: digest(token), admin_id: row.id, expires_at: expires.toISOString(), user_agent: head.get("user-agent")?.slice(0, 200) ?? null, ip: head.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null })
      .select("token_hash")
      .single(),
  );
  await table.update({ failed_logins: 0, locked_until: null, last_login_at: new Date().toISOString() }).eq("id", row.id);
  const admin = shape(row, await roleOf(row.role));
  const jar = await cookies();
  const name = cookieFor(admin.workspace === "support_desk" ? "desk" : "admin");
  const before = jar.get(name)?.value;
  if (before) await controls().from("sessions").delete().eq("token_hash", digest(before));
  jar.set(name, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", expires });
  return admin;
}

export async function logout() {
  const jar = await cookies();
  const lane = await laneOf();
  for (const name of lane ? [cookieFor(lane)] : [COOKIE, DESK_COOKIE]) {
    const token = jar.get(name)?.value;
    if (token) await controls().from("sessions").delete().eq("token_hash", digest(token));
    jar.delete(name);
  }
}

export async function currentAdmin(): Promise<Admin | null> {
  const jar = await cookies();
  const lane = await laneOf();
  const token = lane ? jar.get(cookieFor(lane))?.value : (jar.get(COOKIE)?.value ?? jar.get(DESK_COOKIE)?.value);
  if (!token || token.length < 30) return null;
  const found = await controls().from("sessions").select("expires_at, admins(*)").eq("token_hash", digest(token)).maybeSingle();
  if (found.error) check(found);
  const session = found.data as { expires_at: string; admins: Row | null } | null;
  if (!session?.admins || !session.admins.active || Date.parse(session.expires_at) < Date.now()) return null;
  return shape(session.admins, await roleOf(session.admins.role));
}

// Every API call goes through here. Pass the permission the call needs; any of a list will do.
export async function requireAdmin(permission?: Permission | Permission[]) {
  const admin = await currentAdmin();
  if (!admin) throw new ApiError("Your session has ended. Log in again.", 401);
  const needed = permission ? (Array.isArray(permission) ? permission : [permission]) : [];
  if (needed.length && !needed.some((key) => can(admin.permissions, key))) throw new ApiError("Your role does not allow this. Ask the founder for access.", 403);
  return admin;
}

export async function changePassword(admin: Admin, current: string, next: string) {
  const rule = passwordRule(next);
  if (rule) throw new ApiError(rule, 400);
  const row = check(await controls().from("admins").select("password_hash").eq("id", admin.id).single()) as { password_hash: string };
  if (!(await verifyPassword(current, row.password_hash))) throw new ApiError("Your current password is not right.", 400);
  check(await controls().from("admins").update({ password_hash: await hashPassword(next), must_change_password: false }).eq("id", admin.id).select("id").single());
}

export async function saveTheme(admin: Admin, theme: Theme) {
  const saved = await controls().from("admins").update({ theme }).eq("id", admin.id).select("id").single();
  if (saved.error && /theme/.test(saved.error.message)) throw new ApiError("Run ADMIN CONTROLS/004_admin_theme.sql in Supabase to save themes. It is kept on this device for now.", 409);
  check(saved);
}

export async function audit(admin: Admin, action: string, entity: string, entityId: string | null, detail: Record<string, unknown> = {}) {
  await controls().from("audit_log").insert({ admin_id: admin.id, admin_email: admin.email, action, entity, entity_id: entityId, detail });
}
