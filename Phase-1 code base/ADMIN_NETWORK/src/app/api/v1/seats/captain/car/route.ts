import { z } from "zod";
import { ApiError, readBody, route } from "@/lib/server/api";
import { saveCabin } from "@/lib/server/cabin";
import { openSession } from "@/lib/server/cityRides";

const seat = z.object({
  id: z.string().trim().regex(/^[A-Za-z0-9]{1,4}$/),
  label: z.string().trim().min(1).max(12),
  row: z.number().int().min(0).max(8),
  col: z.number().int().min(0).max(2),
  window: z.boolean(),
});

const body = z.object({
  seatCount: z.number().int().min(1).max(12).optional(),
  seats: z.array(seat).min(1).max(12).optional(),
  layout: z.string().trim().optional(),
});

// PATCH /api/v1/seats/captain/car
// The captain app sends the new seats, or a seat count, with the same login used everywhere else.
export const PATCH = route(async (req) => {
  const session = await openSession(req.headers.get("authorization"), "captain");
  const input = await readBody(req, body);
  if (!input.seatCount && !input.seats?.length) throw new ApiError("Say how many seats the car has.", 400);
  return saveCabin(session.sub, input);
});
