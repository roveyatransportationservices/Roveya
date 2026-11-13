import { AppError } from "@/lib/errors";
import { documentReviewSchema, reviewDocument } from "@/lib/platform/admin";
import { DOCUMENT_KINDS } from "@/lib/platform/captains";
import { handler, readBody } from "@/lib/platform/gateway";
import { requireDesk } from "@/lib/platform/staff";

export const POST = handler<{ id: string; kind: string }>(async (request, { id, kind }) => {
  const staff = await requireDesk(request);
  if (!(DOCUMENT_KINDS as readonly string[]).includes(kind)) throw new AppError("Unknown document.", 404);
  return reviewDocument(staff, id, kind, await readBody(request, documentReviewSchema));
});
