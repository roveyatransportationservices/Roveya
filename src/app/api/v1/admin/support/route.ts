import { listTickets } from "@/lib/platform/admin";
import { handler } from "@/lib/platform/gateway";
import { requireDesk } from "@/lib/platform/staff";

export const GET = handler(async (request) => {
  await requireDesk(request);
  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  const app = params.get("app");
  return listTickets({
    status: status && ["active", "open", "pending", "resolved", "closed"].includes(status) ? status : null,
    app: app === "rider" || app === "captain" ? app : null,
    q: params.get("q") ?? "",
  });
});
