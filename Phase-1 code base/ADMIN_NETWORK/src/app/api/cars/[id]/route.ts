import { z } from "zod";
import { ApiError, check, mustId, readBody, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { LAYOUT_KINDS, SEAT_TEMPLATES, type LayoutKind } from "@/lib/rules";

const schema = z.object({
  action: z.enum(["approve", "reject"]).optional(),
  note: z.string().trim().max(240).optional(),
  makeModel: z.string().trim().min(2).max(60).optional(),
  carClass: z.enum(["Hatchback", "Sedan", "SUV", "Premium SUV", "Traveller"]).optional(),
  plate: z.string().trim().toUpperCase().regex(/^[A-Z]{2} ?[0-9]{1,2} ?[A-Z]{0,3} ?[0-9]{3,4}$/, "Use the number plate format TS09 AB 2146.").optional(),
  color: z.string().trim().min(3).max(20).optional(),
  year: z.number().int().min(2005).max(2100).optional(),
  ac: z.boolean().optional(),
  amenities: z.array(z.string().trim().min(2).max(30)).max(12).optional(),
  // A corrected layout replaces the seat map with the standard one; published trips keep theirs.
  layout: z.enum(LAYOUT_KINDS as [LayoutKind, ...LayoutKind[]]).optional(),
});

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  mustId(id, "Car");
  const input = await readBody(req, schema);
  const editing = Object.keys(input).some((key) => key !== "action" && key !== "note");
  const admin = await requireAdmin(editing ? "captains.edit" : "captains.review");
  const fields: Record<string, unknown> = {};
  if (input.action) {
    if (input.action === "reject" && !input.note) throw new ApiError("Tell the captain what to fix.", 400);
    fields.status = input.action === "approve" ? "active" : "rejected";
    fields.review_note = input.note ?? null;
  }
  if (input.makeModel) fields.make_model = input.makeModel;
  if (input.carClass) fields.car_class = input.carClass;
  if (input.plate) fields.plate = input.plate;
  if (input.color) fields.color = input.color;
  if (input.year) fields.year = input.year;
  if (input.ac !== undefined) fields.ac = input.ac;
  if (input.amenities) fields.amenities = input.amenities;
  if (input.layout) {
    const { data: current } = await db().from("seat_cars").select("layout_kind").eq("id", id).maybeSingle();
    if (current && current.layout_kind !== input.layout) {
      fields.layout_kind = input.layout;
      fields.seats = SEAT_TEMPLATES[input.layout].map((seat) => ({ ...seat }));
    }
  }
  if (!Object.keys(fields).length) throw new ApiError("Nothing to change.", 400);
  const car = check(await db().from("seat_cars").update(fields).eq("id", id).select("*").maybeSingle(), "Car not found.");
  if (input.action === "approve") {
    await db().from("captains").update({ status: "active", approved_at: new Date().toISOString() }).eq("user_id", car.captain_id).eq("status", "review");
  }
  await audit(admin, input.action ? `car.${input.action}` : "car.update", "seat_car", id, input);
  return { car };
});
