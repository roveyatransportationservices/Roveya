import { auditLog } from "@/lib/platform/admin";
import { handler } from "@/lib/platform/gateway";
import { requireDesk } from "@/lib/platform/staff";

export const GET = handler(async (request) => {
  await requireDesk(request, { ceo: true });
  return auditLog();
});
