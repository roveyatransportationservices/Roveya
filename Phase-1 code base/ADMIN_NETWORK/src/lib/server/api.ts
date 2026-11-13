import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type z, type ZodTypeAny } from "zod";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type Ctx<P> = { params: Promise<P> };

// Wraps a route so every failure comes back as { error } with the right status.
export function route<P = Record<string, string>>(fn: (req: NextRequest, params: P) => Promise<unknown>) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      const result = await fn(req, await ctx.params);
      return result instanceof NextResponse ? result : NextResponse.json(result ?? { ok: true });
    } catch (error) {
      if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status });
      if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Check the details and try again." }, { status: 400 });
      console.error(error);
      return NextResponse.json({ error: "Something went wrong on the server. Please try again." }, { status: 500 });
    }
  };
}

export async function readBody<S extends ZodTypeAny>(req: NextRequest, schema: S): Promise<z.output<S>> {
  const raw = await req.json().catch(() => {
    throw new ApiError("Send the details as JSON.", 400);
  });
  return schema.parse(raw);
}

// Database errors become messages an admin can act on.
const KNOWN: Record<string, string> = {
  booking_closed: "This booking is already closed.",
  booking_missing: "Booking not found.",
  trip_closed: "This trip is already closed.",
  trip_started: "The trip has started.",
  trip_not_ready: "The trip can start only within 2 hours of departure.",
  insufficient_balance: "The wallet does not have enough balance for that.",
  wallet_missing: "This person has no wallet yet.",
  plan_invalid: "Pick daily, weekly or monthly.",
  trip_departed: "This trip leaves in less than 10 minutes, so it cannot take new bookings.",
  seat_taken: "One of those seats was just taken. Pick another seat.",
  seat_missing: "That seat is not on this car.",
  seat_women_only: "That seat is next to a woman traveller, so only a woman can book it.",
  seat_count: "Book between 1 and 4 seats at a time.",
  seat_duplicate: "Each seat can be picked only once.",
};

export function check<T>(result: { data: T; error: { message: string; code?: string; details?: string } | null }, notFound?: string): NonNullable<T> {
  if (result.error) {
    const key = Object.keys(KNOWN).find((name) => result.error!.message.includes(name));
    if (key) throw new ApiError(KNOWN[key], 409);
    if (result.error.code === "23505") throw new ApiError("That value is already in use.", 409);
    if (result.error.code === "23514") throw new ApiError("One of the values is not allowed. Check the form.", 400);
    if (result.error.code === "PGRST106" || /schema must be one of/i.test(result.error.message)) {
      throw new ApiError("Add admin_controls to Supabase > Project Settings > Data API > Exposed schemas, then reload.", 503);
    }
    if (/admin_controls\.|relation .* does not exist/i.test(result.error.message)) {
      throw new ApiError("Run the ADMIN CONTROLS SQL files (001, then 002) in the Supabase SQL editor first.", 503);
    }
    throw new Error(result.error.message);
  }
  if (result.data === null || result.data === undefined) {
    if (notFound) throw new ApiError(notFound, 404);
    throw new Error("Empty result");
  }
  return result.data as NonNullable<T>;
}

export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function mustId(id: string, what = "Record") {
  if (!uuid.test(id)) throw new ApiError(`${what} not found.`, 404);
  return id;
}

export function search(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const get = (key: string) => params.get(key)?.trim() || undefined;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const size = Math.min(100, Math.max(5, Number(params.get("size")) || 25));
  return { get, page, size, from: (page - 1) * size, to: page * size - 1 };
}

// Keeps user text safe inside PostgREST or() filters.
export const term = (value?: string) => (value ? value.replace(/[%,()*\\]/g, " ").trim().slice(0, 60) : "");

export const paise = (rupees: number) => Math.round(rupees * 100);
