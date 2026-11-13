import { z } from "zod";
import { check, mustId, readBody, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

const text = (max: number) => z.string().trim().max(max);
const edit = z
  .object({
    published: z.boolean().optional(),
    name: text(60).min(2, "Name needs at least 2 letters.").optional(),
    role: text(60).optional(),
    route: text(80).optional(),
    seat: text(40).optional(),
    quote: text(600).min(10, "Keep at least a line of the review.").optional(),
    image_url: z.union([z.literal(""), z.string().trim().url("Use a full image link starting with https://").max(400)]).optional(),
  })
  .strict();

// Publishing makes the review appear in "Journeys worth sharing" on the website.
export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const admin = await requireAdmin("support.reply");
  mustId(id, "Review");
  const input = await readBody(req, edit);
  const fields = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, value === "" ? null : value]));
  if (!Object.keys(fields).length) return { ok: true };
  const review = check(await db().from("testimonials").update(fields).eq("id", id).select("*").maybeSingle(), "Review not found.");
  await audit(admin, input.published === undefined ? "review.edit" : input.published ? "review.publish" : "review.hide", "testimonial", id, { name: review.name, fields: Object.keys(fields) });
  return { review };
});

export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  const admin = await requireAdmin("support.reply");
  mustId(id, "Review");
  const removed = check(await db().from("testimonials").delete().eq("id", id).select("name,rating").maybeSingle(), "Review not found.");
  await audit(admin, "review.delete", "testimonial", id, { name: removed.name, rating: removed.rating });
  return { deleted: true };
});
