import { z } from "zod";
import { ApiError, check, mustId, readBody, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { people } from "@/lib/server/data";
import { db } from "@/lib/server/db";

async function detail(id: string) {
  const ticket = check(await db().from("support_tickets").select("*").eq("id", id).maybeSingle(), "Ticket not found.");
  const [messages, booking] = await Promise.all([
    db().from("support_messages").select("id,author,body,channel,created_at").eq("ticket_id", id).order("id"),
    ticket.seat_booking_id ? db().from("seat_bookings").select("id,pnr,status,seat_ids,total_paise,cash_paise").eq("id", ticket.seat_booking_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const who = await people([ticket.user_id]);
  return { ticket: { ...ticket, person: who.get(ticket.user_id) ?? null }, messages: messages.data ?? [], booking: booking.data };
}

export const GET = route<{ id: string }>(async (_req, { id }) => {
  await requireAdmin("view.support");
  return detail(mustId(id, "Ticket"));
});

const schema = z.object({
  message: z.string().trim().min(1).max(2000).optional(),
  note: z.boolean().optional(),
  status: z.enum(["open", "pending", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
});

// Replies appear in the traveller's or captain's app chat; notes stay inside the team.
export const POST = route<{ id: string }>(async (req, { id }) => {
  const admin = await requireAdmin("support.reply");
  mustId(id, "Ticket");
  const input = await readBody(req, schema);
  const before = check(await db().from("support_tickets").select("status,priority,channel").eq("id", id).maybeSingle(), "Ticket not found.");
  const patch: Record<string, unknown> = {};
  if (input.message) {
    const channel = input.note ? "note" : before.channel === "email" ? "email" : "chat";
    check(await db().from("support_messages").insert({ ticket_id: id, author: "staff", body: input.message, channel }).select("id").single());
    if (!input.note) {
      patch.last_message_at = new Date().toISOString();
      patch.status = input.status ?? "pending";
    }
  }
  if (input.status) patch.status = input.status;
  if (input.priority) patch.priority = input.priority;
  if (!input.message && !Object.keys(patch).length) throw new ApiError("Write a reply or change the status.", 400);
  if (Object.keys(patch).length) check(await db().from("support_tickets").update(patch).eq("id", id).select("id").single());
  await audit(admin, input.note ? "ticket.note" : input.message ? "ticket.reply" : "ticket.update", "support_ticket", id, { before, patch });
  return detail(id);
});
