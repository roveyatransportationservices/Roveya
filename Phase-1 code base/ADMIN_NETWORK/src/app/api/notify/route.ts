import { z } from "zod";
import { ApiError, readBody, route } from "@/lib/server/api";
import { can } from "@/lib/roles";
import { audit, requireAdmin } from "@/lib/server/auth";
import { controls, db } from "@/lib/server/db";

const schema = z.object({
  audience: z.enum(["person", "trip", "captains_all", "travellers_all"]),
  app: z.enum(["rider", "captain"]).optional(),
  userId: z.string().uuid().optional(),
  phone: z.string().trim().regex(/^\d{10}$/, "Enter the 10-digit mobile number.").optional(),
  tripId: z.string().uuid().optional(),
  tripCode: z.string().trim().toUpperCase().regex(/^RVT-\d{4,8}$/, "Trip codes look like RVT-50002.").optional(),
  title: z.string().trim().min(3, "Add a short title.").max(60),
  body: z.string().trim().min(3, "Write the message.").max(180),
});

export const GET = route(async () => {
  await requireAdmin("notify.send");
  const { data } = await controls().from("audit_log").select("id,admin_email,detail,at").eq("action", "push.send").order("at", { ascending: false }).limit(30);
  return { history: data ?? [] };
});

// Sends a push notification through the same Expo push pipeline the apps already use.
export const POST = route(async (req) => {
  const admin = await requireAdmin("notify.send");
  const input = await readBody(req, schema);
  const everyone = input.audience === "captains_all" || input.audience === "travellers_all";
  if (everyone && !can(admin.permissions, "notify.broadcast")) throw new ApiError("Sending to everyone needs the “Send to everyone” permission. Ask the CEO.", 403);
  let targets: { userId: string; app: "rider" | "captain" }[] = [];
  if (input.audience === "person") {
    if (!input.app || (!input.userId && !input.phone)) throw new ApiError("Pick the person to notify.", 400);
    let userId = input.userId;
    if (!userId) {
      const { data: person } = await db().from(input.app === "rider" ? "riders" : "captains").select("user_id").eq("phone", input.phone!).maybeSingle();
      if (!person) throw new ApiError(input.app === "rider" ? "No rider with that mobile number." : "No Vado with that mobile number.", 404);
      userId = person.user_id as string;
    }
    targets = [{ userId, app: input.app }];
  } else if (input.audience === "trip") {
    if (!input.tripId && !input.tripCode) throw new ApiError("Pick the trip.", 400);
    const { data: trip } = await (input.tripId ? db().from("seat_trips").select("id,captain_id").eq("id", input.tripId) : db().from("seat_trips").select("id,captain_id").eq("code", input.tripCode!)).maybeSingle();
    if (!trip) throw new ApiError("No trip with that code.", 404);
    const { data: bookings } = await db().from("seat_bookings").select("rider_id").eq("trip_id", trip.id).eq("status", "confirmed");
    targets = [{ userId: trip.captain_id, app: "captain" as const }, ...[...new Set((bookings ?? []).map((row) => row.rider_id))].map((userId) => ({ userId, app: "rider" as const }))];
  } else {
    const app = input.audience === "captains_all" ? "captain" : "rider";
    const { data } = await db().from("push_tokens").select("user_id").eq("app", app).limit(20000);
    targets = [...new Set((data ?? []).map((row) => row.user_id))].map((userId) => ({ userId, app }));
  }
  let devices = 0;
  for (let index = 0; index < targets.length; index += 10) {
    const batch = await Promise.all(
      targets.slice(index, index + 10).map((target) => db().rpc("push_send", { p_user: target.userId, p_app: target.app, p_kind: "desk", p_title: input.title, p_body: input.body })),
    );
    devices += batch.reduce((sum, result) => sum + Number(result.data ?? 0), 0);
  }
  await audit(admin, "push.send", "push", input.audience, { title: input.title, body: input.body, audience: input.audience, people: targets.length, devices });
  return { people: targets.length, devices };
});
