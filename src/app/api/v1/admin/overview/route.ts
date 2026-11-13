import { overview } from "@/lib/platform/desk";
import { handler } from "@/lib/platform/gateway";
import { requireDesk } from "@/lib/platform/staff";

export const GET = handler(async (request) => {
  await requireDesk(request);
  const days = Math.min(90, Math.max(1, Number(new URL(request.url).searchParams.get("days") ?? 7) || 7));
  return overview(days);
});
