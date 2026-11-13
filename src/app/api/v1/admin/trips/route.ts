import { listTrips } from "@/lib/platform/admin";
import { handler } from "@/lib/platform/gateway";
import { requireDesk } from "@/lib/platform/staff";

const statuses = ["open", "searching", "assigned", "arrived", "on_trip", "completed", "cancelled", "expired"];

export const GET = handler(async (request) => {
  await requireDesk(request);
  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  const vehicle = params.get("vehicle");
  return listTrips({
    status: status && statuses.includes(status) ? status : null,
    vehicle: vehicle && ["bike", "auto", "cab"].includes(vehicle) ? vehicle : null,
    q: params.get("q") ?? "",
    range: params.get("range") ?? "7d",
  });
});
