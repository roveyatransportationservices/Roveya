import { listRiders } from "@/lib/platform/admin";
import { handler } from "@/lib/platform/gateway";
import { requireDesk } from "@/lib/platform/staff";

export const GET = handler(async (request) => {
  await requireDesk(request);
  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  return listRiders(status === "active" || status === "blocked" ? status : null, params.get("q") ?? "");
});
