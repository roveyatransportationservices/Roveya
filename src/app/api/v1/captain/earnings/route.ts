import { earnings } from "@/lib/platform/captains";
import { handler } from "@/lib/platform/gateway";
import { requireCaptain } from "@/lib/platform/session";

export const GET = handler(async (request) => {
  const captain = await requireCaptain(request);
  const range = new URL(request.url).searchParams.get("range") === "week" ? "week" : "today";
  return earnings(captain.user_id, range);
});
