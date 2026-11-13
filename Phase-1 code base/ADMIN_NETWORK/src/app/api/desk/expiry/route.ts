import { z } from "zod";
import { ApiError, readBody, route, search } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { EXPIRING } from "@/lib/server/desk";
import { expiringDocuments, setExpiry } from "@/lib/server/expiry";

const PERIODS = [7, 30, 60, 90];

export const GET = route(async (req) => {
  await requireAdmin(["captains.review", "view.captains"]);
  const days = Number(search(req).get("days"));
  return expiringDocuments(PERIODS.includes(days) ? days : 30);
});

const schema = z.object({ captainId: z.string().uuid(), kind: z.string(), expiresOn: z.string().trim().max(10) });

export const PATCH = route(async (req) => {
  const admin = await requireAdmin("captains.review");
  const input = await readBody(req, schema);
  if (!EXPIRING.includes(input.kind)) throw new ApiError("This document has no expiry date.", 400);
  return setExpiry(admin, input.captainId, input.kind, input.expiresOn);
});
