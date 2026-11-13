import { z } from "zod";
import { mustId, readBody, route } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { deskAction, deskVado } from "@/lib/server/desk";

export const GET = route<{ id: string }>(async (_req, { id }) => {
  await requireAdmin(["captains.review", "view.captains"]);
  return deskVado(mustId(id, "Vado"));
});

const schema = z.object({
  action: z.enum(["claim", "release", "doc", "car", "approve", "decline"]),
  kind: z.string().regex(/^[a-zA-Z]{2,20}$/).optional(),
  status: z.enum(["verified", "rejected"]).optional(),
  note: z.string().trim().max(200).optional(),
  force: z.boolean().optional(),
  expiresOn: z.string().trim().max(10).optional(),
});

// Claim, check documents and the car, then approve (the Vado can start at once) or decline.
export const POST = route<{ id: string }>(async (req, { id }) => {
  const admin = await requireAdmin("captains.review");
  const input = await readBody(req, schema);
  return deskAction(admin, mustId(id, "Vado"), input);
});
