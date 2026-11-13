import { z } from "zod";
import { handler, readBody } from "@/lib/platform/gateway";
import { cancelByRider } from "@/lib/platform/rides";
import { requireRider } from "@/lib/platform/session";

const schema = z.object({ reason: z.string().trim().min(2).max(120) });

export const POST = handler<{ id: string }>(async (request, { id }) => {
  const rider = await requireRider(request);
  const input = await readBody(request, schema);
  return cancelByRider(rider.user_id, id, input.reason);
});
