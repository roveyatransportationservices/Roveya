import { z } from "zod";
import { check, paise, readBody, route, uuid } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { controls } from "@/lib/server/db";

const schema = z.object({
  ownerId: z.string().regex(uuid),
  role: z.enum(["captain", "rider"]),
  service: z.enum(["bike", "auto", "taxi", "carpool"]),
  kind: z.enum(["fraud", "support"]),
  title: z.string().trim().min(3, "Give the case a short title.").max(120),
  note: z.string().trim().min(3, "Write what happened.").max(1000),
  amount: z.number().min(0).max(1000000).optional(),
  reference: z.string().trim().max(80).optional(),
});

// Opens a fraud or support case on a captain or passenger.
export const POST = route(async (req) => {
  const admin = await requireAdmin(["money.wallets", "support.reply"]);
  const input = await readBody(req, schema);
  const row = check(
    await controls()
      .from("money_cases")
      .insert({ owner_id: input.ownerId, role: input.role, service: input.service, kind: input.kind, title: input.title, amount_paise: input.amount ? paise(input.amount) : null, reference: input.reference || null, notes: [{ at: new Date().toISOString(), by: admin.name, text: input.note, status: "open" }], created_by: admin.id })
      .select("*")
      .single(),
  );
  await audit(admin, "money_case.open", "money_case", String(row.id), { code: row.code, owner: input.ownerId, kind: input.kind, title: input.title });
  return { case: row };
});
