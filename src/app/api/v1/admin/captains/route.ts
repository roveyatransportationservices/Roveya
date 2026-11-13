import { listCaptains } from "@/lib/platform/admin";
import { handler } from "@/lib/platform/gateway";
import { requireDesk } from "@/lib/platform/staff";

export const GET = handler(async (request) => {
  await requireDesk(request);
  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  return listCaptains(status && ["review", "active", "suspended"].includes(status) ? status : null, params.get("q") ?? "");
});
