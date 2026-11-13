import { z } from "zod";
import { AppError } from "@/lib/errors";
import { handler, readBody } from "@/lib/platform/gateway";
import { advanceTrip, cancelByCaptain, collectCash, rateTrip, ratingSchema } from "@/lib/platform/rides";
import { requireCaptain } from "@/lib/platform/session";

const startSchema = z.object({ otp: z.string().regex(/^\d{4}$/, "Enter the 4-digit OTP.") });
const cancelSchema = z.object({ reason: z.string().trim().min(2).max(120) });

export const POST = handler<{ id: string; action: string }>(async (request, { id, action }) => {
  const captain = await requireCaptain(request, { active: true });
  switch (action) {
    case "arrived":
      return advanceTrip(captain.user_id, id, "arrived");
    case "start":
      return advanceTrip(captain.user_id, id, "start", (await readBody(request, startSchema)).otp);
    case "complete":
      return advanceTrip(captain.user_id, id, "complete");
    case "collect":
      return collectCash(captain.user_id, id);
    case "cancel":
      return cancelByCaptain(captain.user_id, id, (await readBody(request, cancelSchema)).reason);
    case "rate":
      return rateTrip("captain", captain.user_id, id, await readBody(request, ratingSchema));
    default:
      throw new AppError("Unknown action.", 404);
  }
});
