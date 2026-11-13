import { z } from "zod";
import { check, readBody, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { controls, db } from "@/lib/server/db";

const schema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter the caller's 10-digit mobile number."),
  topic: z.string().trim().min(2, "Add the topic.").max(60),
  note: z.string().trim().min(4, "Write what the caller needed.").max(2000),
  status: z.enum(["open", "pending", "resolved"]).default("resolved"),
  pnr: z.string().trim().toUpperCase().regex(/^RVY\d{4,10}$/).optional().or(z.literal("")),
});

// A phone call to the desk becomes a ticket, so chats, emails and calls share one history.
export const POST = route(async (req) => {
  const admin = await requireAdmin("support.reply");
  const input = await readBody(req, schema);
  const [{ data: rider }, { data: captain }, booking] = await Promise.all([
    db().from("riders").select("user_id,email").eq("phone", input.phone).maybeSingle(),
    db().from("captains").select("user_id,email").eq("phone", input.phone).maybeSingle(),
    input.pnr ? db().from("seat_bookings").select("id,trip_id").eq("pnr", input.pnr).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const owner = captain ? { app: "captain", ...captain } : rider ? { app: "rider", ...rider } : null;
  const ticket = check(
    await db()
      .from("support_tickets")
      .insert({
        app: owner?.app ?? "rider",
        user_id: owner?.user_id ?? null,
        topic: input.topic,
        channel: "call",
        contact_phone: input.phone,
        contact_email: owner?.email ?? null,
        status: input.status,
        trip_code: input.pnr || null,
        seat_booking_id: booking.data?.id ?? null,
        seat_trip_id: booking.data?.trip_id ?? null,
        priority: /safety|accident|sos|harass|unsafe/i.test(`${input.topic} ${input.note}`) ? "urgent" : "normal",
      })
      .select("id,code")
      .single(),
  );
  await db().from("support_messages").insert({ ticket_id: ticket.id, author: "staff", body: `Call notes (${admin.name}): ${input.note}`, channel: "note" });
  await controls().from("call_log").insert({ admin_id: admin.id, admin_name: admin.name, to_phone: input.phone, to_kind: owner ? (owner.app === "captain" ? "Captain" : "Traveller") : "Other", entity: "ticket", entity_id: ticket.id, mode: "direct", outcome: "reached", note: input.note.slice(0, 1000) });
  await audit(admin, "ticket.call", "support_ticket", ticket.id, { phone: input.phone, topic: input.topic });
  return { ticket };
});
