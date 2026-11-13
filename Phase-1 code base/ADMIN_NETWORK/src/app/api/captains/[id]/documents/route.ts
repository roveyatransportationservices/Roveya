import { z } from "zod";
import { ApiError, check, mustId, readBody, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

const schema = z.object({
  kind: z.string().regex(/^[a-zA-Z]{2,20}$/),
  status: z.enum(["verified", "rejected"]),
  note: z.string().trim().max(200).optional(),
});

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const admin = await requireAdmin("captains.review");
  mustId(id, "Captain");
  const input = await readBody(req, schema);
  if (input.status === "rejected" && !input.note) throw new ApiError("Tell the captain what to fix on this document.", 400);
  const saved = check(
    await db()
      .from("captain_documents")
      .update({ status: input.status, review_note: input.note ?? null, reviewed_at: new Date().toISOString() })
      .eq("captain_id", id)
      .eq("kind", input.kind)
      .select("kind,status,review_note")
      .maybeSingle(),
    "Document not found.",
  );
  await audit(admin, `document.${input.status}`, "captain_document", `${id}:${input.kind}`, { note: input.note ?? null });
  return { document: saved };
});
