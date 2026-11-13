import { payoutSchema, requestPayout } from "@/lib/platform/captains";
import { db, handler, limit, readBody, rupees } from "@/lib/platform/gateway";
import { requireCaptain } from "@/lib/platform/session";

export const GET = handler(async (request) => {
  const captain = await requireCaptain(request);
  const { data } = await db().from("payout_requests").select("id,amount_paise,status,reference,created_at,decided_at").eq("captain_id", captain.user_id).order("created_at", { ascending: false }).limit(30);
  return { payouts: (data ?? []).map((row) => ({ ...row, amount: rupees(row.amount_paise) })) };
});

export const POST = handler(async (request) => {
  const captain = await requireCaptain(request, { active: true });
  limit(request, "captain-payout", 5, 60 * 60 * 1000, captain.user_id);
  const input = await readBody(request, payoutSchema);
  return requestPayout(captain, input.amount);
});
