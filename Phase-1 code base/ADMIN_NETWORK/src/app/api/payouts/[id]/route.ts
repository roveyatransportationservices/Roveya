import { z } from "zod";
import { ApiError, check, mustId, readBody, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

const schema = z.object({
  action: z.enum(["paid", "reject"]),
  reference: z.string().trim().max(80).optional(),
});

// Paid needs the bank UTR. Rejecting puts the amount back in the captain's wallet.
export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const admin = await requireAdmin("money.payouts");
  mustId(id, "Payout");
  const input = await readBody(req, schema);
  if (input.action === "paid" && !input.reference) throw new ApiError("Add the bank transfer reference (UTR).", 400);
  const payout = await db()
    .from("payout_requests")
    .update({ status: input.action === "paid" ? "paid" : "rejected", reference: input.reference ?? null, decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "requested")
    .select("*")
    .maybeSingle();
  if (payout.error) check(payout);
  if (!payout.data) throw new ApiError("This payout was already decided.", 409);
  if (input.action === "reject") {
    check(await db().rpc("ledger_post", { p_owner: payout.data.captain_id, p_kind: "payout_reversal", p_amount: payout.data.amount_paise, p_ref_type: "payout", p_ref_id: payout.data.id, p_note: "Payout returned to wallet" }));
  }
  await audit(admin, `payout.${input.action}`, "payout", id, { amountPaise: payout.data.amount_paise, reference: input.reference ?? null });
  return { payout: payout.data };
});
