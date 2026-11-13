import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError, check, mustId, paise, readBody, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { balances } from "@/lib/server/data";
import { db } from "@/lib/server/db";

const schema = z.object({
  amount: z.number().refine((value) => value !== 0, "Enter an amount other than zero.").refine((value) => Math.abs(value) <= 50000, "Adjust up to ₹50,000 at a time."),
  note: z.string().trim().min(4, "Write why the balance is changing.").max(160),
});

// Credits (positive) or debits (negative) a traveller's or captain's ROVEYA wallet.
// Every adjustment is its own ledger line, so the balance always matches the history.
export const POST = route<{ id: string }>(async (req, { id }) => {
  const admin = await requireAdmin("money.wallets");
  mustId(id, "Wallet");
  const input = await readBody(req, schema);
  const owner = check(await db().from("wallets").select("owner_id,owner_kind").eq("owner_id", id).maybeSingle(), "Wallet not found.");
  if (owner.owner_kind === "platform") throw new ApiError("The ROVEYA platform wallet moves only with bookings and payouts.", 400);
  const ref = randomUUID();
  const balance = check(
    await db().rpc("ledger_post", { p_owner: id, p_kind: "adjustment", p_amount: paise(input.amount), p_ref_type: "admin_adjustment", p_ref_id: ref, p_note: `${input.note} (by ${admin.name})`, p_allow_negative: false }),
  );
  await db().rpc("ledger_post", { p_owner: "00000000-0000-0000-0000-000000000001", p_kind: "adjustment", p_amount: -paise(input.amount), p_ref_type: "admin_adjustment", p_ref_id: ref, p_note: input.note, p_allow_negative: true });
  await audit(admin, input.amount > 0 ? "wallet.credit" : "wallet.debit", "wallet", id, { amountPaise: paise(input.amount), note: input.note, ref });
  const now = await balances([id]);
  return { balancePaise: now.get(id) ?? Number(balance) };
});
