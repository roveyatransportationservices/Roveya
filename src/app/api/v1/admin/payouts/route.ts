import { handler } from "@/lib/platform/gateway";
import { listPayouts } from "@/lib/platform/money";
import { requireDesk } from "@/lib/platform/staff";

export const GET = handler(async (request) => {
  await requireDesk(request);
  const status = new URL(request.url).searchParams.get("status") ?? "requested";
  return listPayouts(["requested", "paid", "rejected"].includes(status) ? status : "requested");
});
