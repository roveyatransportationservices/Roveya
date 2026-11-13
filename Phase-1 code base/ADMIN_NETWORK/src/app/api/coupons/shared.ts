import { z } from "zod";
import { paise } from "@/lib/server/api";

// The form speaks rupees; the coupons table keeps flat values and limits in paise.
export const couponSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/, "Use 3 to 20 letters or numbers, like WEEKEND75."),
    title: z.string().trim().min(3, "Add a short title travellers will see.").max(80),
    description: z.string().trim().max(240).optional().or(z.literal("")),
    kind: z.enum(["flat", "percent"]),
    value: z.number().positive("The discount must be more than zero."),
    maxDiscount: z.number().positive().nullable().optional(),
    minFare: z.number().min(0).default(0),
    services: z.array(z.enum(["seat", "bike", "auto", "cab"])).default(["seat"]),
    newRidersOnly: z.boolean().default(false),
    perRiderLimit: z.number().int().min(1).max(100).default(1),
    maxRedemptions: z.number().int().positive().nullable().optional(),
    startsAt: z.string().datetime({ offset: true }).optional(),
    endsAt: z.string().datetime({ offset: true }).nullable().optional(),
    active: z.boolean().default(true),
    listed: z.boolean().default(true),
  })
  .refine((input) => input.kind === "flat" || input.value <= 100, { message: "A percent discount can be at most 100.", path: ["value"] })
  .refine((input) => !input.endsAt || !input.startsAt || Date.parse(input.endsAt) > Date.parse(input.startsAt), { message: "The end date must be after the start.", path: ["endsAt"] });

export type CouponInput = z.infer<typeof couponSchema>;

export function toRow(input: CouponInput) {
  return {
    code: input.code,
    title: input.title,
    description: input.description || null,
    kind: input.kind,
    value: input.kind === "flat" ? paise(input.value) : Math.round(input.value),
    max_discount_paise: input.maxDiscount ? paise(input.maxDiscount) : null,
    min_fare_paise: paise(input.minFare),
    vehicles: input.services,
    new_riders_only: input.newRidersOnly,
    per_rider_limit: input.perRiderLimit,
    max_redemptions: input.maxRedemptions ?? null,
    ...(input.startsAt ? { starts_at: input.startsAt } : null),
    ends_at: input.endsAt ?? null,
    active: input.active,
    listed: input.listed,
  };
}
