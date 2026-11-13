import "server-only";
import { randomInt } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import { sendDriverSms } from "@/lib/sms";
import { db, dbError, secret } from "@/lib/platform/gateway";
import { hashOtp, sameHash } from "@/lib/platform/tokens";

export type AppName = "rider" | "captain";
export type MobileUser = { userId: string; phone: string };

const OTP_TTL_MS = 5 * 60 * 1000;
const SEND_WINDOW_MS = 10 * 60 * 1000;
const MAX_SENDS = 3;
const MAX_ATTEMPTS = 5;

function demoMode() {
  return (process.env.MOBILE_OTP_MODE || "demo").trim() === "demo";
}

function anonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new AppError("ROVEYA is not connected to its database yet.", 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function sendOtp(phone: string, app: AppName) {
  const client = db();
  const { data: existing } = await client.from("app_otps").select("sent_count,window_started_at").eq("phone", phone).eq("app", app).maybeSingle();
  const now = Date.now();
  const windowOpen = existing && now - Date.parse(existing.window_started_at) < SEND_WINDOW_MS;
  if (windowOpen && existing.sent_count >= MAX_SENDS) throw new AppError("Too many codes. Try again in 10 minutes.", 429);

  const code = demoMode() ? "1234" : String(randomInt(1000, 10000));
  const row = {
    phone,
    app,
    code_hash: hashOtp(secret("otp"), app, phone, code),
    expires_at: new Date(now + OTP_TTL_MS).toISOString(),
    attempts: 0,
    sent_count: windowOpen ? existing.sent_count + 1 : 1,
    window_started_at: windowOpen ? existing.window_started_at : new Date(now).toISOString(),
  };
  const saved = await client.from("app_otps").upsert(row);
  const failure = dbError(saved.error);
  if (failure) throw failure;

  if (!demoMode()) {
    const sent = await sendDriverSms(phone, `Your ROVEYA ${app === "captain" ? "Captain " : ""}code is ${code}. It expires in 5 minutes. Do not share it.`);
    if (!sent) throw new AppError("We could not send the SMS. Try again shortly.", 503);
  }
  return { ok: true, expiresInSeconds: OTP_TTL_MS / 1000, demo: demoMode() };
}

async function checkOtp(phone: string, app: AppName, code: string) {
  const client = db();
  const { data: row } = await client.from("app_otps").select("*").eq("phone", phone).eq("app", app).maybeSingle();
  if (!row || Date.parse(row.expires_at) < Date.now()) throw new AppError("That code has expired. Request a new one.", 400);
  if (row.attempts >= MAX_ATTEMPTS) {
    await client.from("app_otps").delete().eq("phone", phone).eq("app", app);
    throw new AppError("Too many attempts. Request a new code.", 429);
  }
  if (!sameHash(row.code_hash, hashOtp(secret("otp"), app, phone, code))) {
    await client.from("app_otps").update({ attempts: row.attempts + 1 }).eq("phone", phone).eq("app", app);
    throw new AppError("That code does not match.", 400);
  }
  await client.from("app_otps").delete().eq("phone", phone).eq("app", app);
}

export async function verifyOtp(phone: string, app: AppName, code: string) {
  await checkOtp(phone, app, code);
  const admin = db();
  const email = `${phone}@phone.roveya.app`;
  const created = await admin.auth.admin.createUser({
    email,
    phone: `+91${phone}`,
    email_confirm: true,
    phone_confirm: true,
    user_metadata: { mobile: phone },
  });
  if (created.error && !/already|registered|exists/i.test(created.error.message)) throw new AppError("We could not open your account.", 500);

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) throw new AppError("We could not open your account.", 500);
  const verified = await anonClient().auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  const session = verified.data.session;
  if (verified.error || !session || !verified.data.user) throw new AppError("We could not sign you in.", 500);
  const userId = verified.data.user.id;

  let profile: unknown = null;
  if (app === "rider") {
    const upserted = await admin.from("riders").upsert({ user_id: userId, phone }, { onConflict: "user_id", ignoreDuplicates: true });
    const failure = dbError(upserted.error);
    if (failure) throw failure;
    profile = (await admin.from("riders").select("user_id,phone,name,email,created_at").eq("user_id", userId).maybeSingle()).data;
  } else {
    profile = (await admin.from("captains").select("*").eq("user_id", userId).maybeSingle()).data;
  }

  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in,
    userId,
    phone,
    profile,
    isNew: app === "captain" ? profile === null : false,
  };
}

export async function refreshSession(refreshToken: string) {
  const { data, error } = await anonClient().auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) throw new AppError("Your session has ended. Please sign in again.", 401);
  return { accessToken: data.session.access_token, refreshToken: data.session.refresh_token, expiresAt: data.session.expires_at };
}

export async function signOut(request: Request) {
  const token = bearer(request);
  if (token) await db().auth.admin.signOut(token).catch(() => undefined);
  return { ok: true };
}

export function bearer(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

export async function requireUser(request: Request): Promise<MobileUser> {
  const token = bearer(request);
  if (!token) throw new AppError("Sign in to continue.", 401);
  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user) throw new AppError("Your session has ended. Please sign in again.", 401);
  const phone = String(data.user.user_metadata?.mobile ?? data.user.email?.split("@")[0] ?? "");
  return { userId: data.user.id, phone };
}

export async function requireRider(request: Request) {
  const user = await requireUser(request);
  const { data } = await db().from("riders").select("user_id,phone,name,email,status").eq("user_id", user.userId).maybeSingle();
  if (!data) throw new AppError("Sign in to the ROVEYA app first.", 403);
  if (data.status === "blocked") throw new AppError("Your ROVEYA account is on hold. Call the desk for help.", 403);
  return data as { user_id: string; phone: string; name: string; email: string | null };
}

export type CaptainRow = {
  user_id: string;
  captain_code: string;
  phone: string;
  name: string;
  city: string;
  vehicle: "bike" | "auto" | "cab";
  vehicle_no: string;
  vehicle_model: string;
  vehicle_color: string;
  status: "review" | "active" | "suspended";
  rating: number;
  bank_last4: string;
};

export async function requireCaptain(request: Request, options: { active?: boolean } = {}) {
  const user = await requireUser(request);
  const { data } = await db().from("captains").select("*").eq("user_id", user.userId).maybeSingle();
  if (!data) throw new AppError("Register as a captain first.", 403);
  if (options.active && data.status !== "active") throw new AppError("Your captain account is still in review.", 403);
  return data as CaptainRow;
}
