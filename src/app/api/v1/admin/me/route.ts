import { handler } from "@/lib/platform/gateway";
import { requireDesk } from "@/lib/platform/staff";

export const GET = handler(async (request) => {
  const staff = await requireDesk(request);
  return { staff: { name: staff.name, email: staff.email, role: staff.role } };
});
