import { z } from "zod";
import { db, handler, must, readBody } from "@/lib/platform/gateway";
import { requireRider } from "@/lib/platform/session";

const schema = z.object({
  name: z.string().trim().min(2, "Enter at least 2 letters.").max(80).optional(),
  email: z.string().trim().email("Check the email format.").optional().or(z.literal("")),
});

export const GET = handler(async (request) => ({ rider: await requireRider(request) }));

export const PATCH = handler(async (request) => {
  const rider = await requireRider(request);
  const input = await readBody(request, schema);
  const patch: Record<string, unknown> = {};
  if (input.name) patch.name = input.name;
  if (input.email !== undefined) patch.email = input.email || null;
  return { rider: must(await db().from("riders").update(patch).eq("user_id", rider.user_id).select("user_id,phone,name,email").single()) };
});
