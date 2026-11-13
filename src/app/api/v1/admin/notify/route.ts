import { notify, notifySchema, pushLog } from "@/lib/platform/admin";
import { handler, readBody } from "@/lib/platform/gateway";
import { requireDesk } from "@/lib/platform/staff";

export const GET = handler(async (request) => {
  await requireDesk(request);
  return pushLog();
});

export const POST = handler(async (request) => {
  const input = await readBody(request, notifySchema);
  const staff = await requireDesk(request, { ceo: input.audience !== "person" });
  return notify(staff, input);
});
