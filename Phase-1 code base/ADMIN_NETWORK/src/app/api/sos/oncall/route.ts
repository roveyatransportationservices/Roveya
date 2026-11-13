import { z } from "zod";
import { ApiError, check, readBody, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

// The people ROVEYA calls when an SOS is not acknowledged on the Support Desk in time.
export const GET = route(async () => {
  await requireAdmin(["settings.manage", "view.safety"]);
  const { data } = await db().from("sos_oncall").select("id,name,phone,priority,active,created_at").order("priority").order("id");
  return { oncall: data ?? [], exotelReady: Boolean(process.env.EXOTEL_SID && process.env.EXOTEL_API_KEY && process.env.EXOTEL_API_TOKEN && process.env.EXOTEL_CALLER_ID) };
});

const schema = z.object({
  name: z.string().trim().min(2, "Add their name.").max(60),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number."),
  priority: z.number().int().min(1).max(9).default(1),
});

export const POST = route(async (req) => {
  const admin = await requireAdmin("settings.manage");
  const input = await readBody(req, schema);
  const saved = await db().from("sos_oncall").insert({ name: input.name, phone: input.phone, priority: input.priority }).select("id").single();
  if (saved.error?.code === "23505") throw new ApiError("This number is already on the list.", 409);
  const row = check(saved) as { id: number };
  await audit(admin, "sos.oncall.add", "sos_oncall", String(row.id), { name: input.name, phone: input.phone });
  return { ok: true };
});
