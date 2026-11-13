import "server-only";
import { ZodError, type output, type ZodTypeAny } from "zod";
import { AppError, toErrorResponse } from "@/lib/errors";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/service";
import { deriveSecret } from "@/lib/platform/tokens";

type Context<P> = { params: Promise<P> };

export function handler<P = Record<string, never>>(fn: (request: Request, params: P) => Promise<unknown>) {
  return async (request: Request, context: Context<P>) => {
    try {
      const data = await fn(request, await context.params);
      return Response.json(data ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      if (error instanceof ZodError) return Response.json({ error: error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
      return toErrorResponse(error);
    }
  };
}

export async function readBody<S extends ZodTypeAny>(request: Request, schema: S): Promise<output<S>> {
  const raw = await request.json().catch(() => {
    throw new AppError("Send a JSON body.", 400);
  });
  return schema.parse(raw);
}

export function limit(request: Request, scope: string, count: number, windowMs: number, key?: string) {
  const result = rateLimit(key ? `${scope}:${key}` : clientKey(request, scope), count, windowMs);
  if (!result.ok) throw new AppError("Too many requests. Please wait a moment.", 429);
}

export function db() {
  return createServiceClient();
}

const known: Record<string, [string, number]> = {
  insufficient_balance: ["Your wallet balance is too low for this.", 402],
  offer_not_found: ["This ride request is no longer yours.", 404],
  offer_closed: ["This ride request has expired.", 409],
  trip_taken: ["Another captain took this ride.", 409],
  wallet_missing: ["Your wallet is not ready yet.", 409],
  coupon_unavailable: ["That code is no longer available.", 409],
  coupon_used: ["You have already used this code.", 409],
};

export function dbError(error: { message?: string; code?: string } | null, fallback = "Something went wrong. Please try again.") {
  if (!error) return null;
  const message = error.message ?? "";
  const match = Object.keys(known).find((key) => message.includes(key));
  if (match) return new AppError(known[match][0], known[match][1]);
  if (error.code === "23505") return new AppError("That already exists.", 409);
  return new AppError(fallback, 500);
}

export function must<T>(result: { data: T | null; error: { message?: string; code?: string } | null }, fallback?: string): NonNullable<T> {
  const failure = dbError(result.error, fallback);
  if (failure) throw failure;
  if (result.data === null || result.data === undefined) throw new AppError("Not found.", 404);
  return result.data as NonNullable<T>;
}

export function secret(label: string) {
  const base = process.env.PLATFORM_SECRET?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();
  if (!base) throw new AppError("The ROVEYA platform is not configured yet.", 503);
  return deriveSecret(base, label);
}

export function siteUrl(path = "") {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}

// Moves the event consumers along right after an important write; pg_cron is the safety net.
export async function kickConsumers() {
  const client = db();
  await Promise.allSettled([client.rpc("consume_billing", { p_limit: 500 }), client.rpc("consume_analytics", { p_limit: 500 })]);
}

export const paise = (rupees: number) => Math.round(rupees * 100);
export const rupees = (amountPaise: number) => Math.round(Number(amountPaise)) / 100;
