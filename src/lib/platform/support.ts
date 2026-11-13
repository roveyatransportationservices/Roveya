import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { db, dbError, must } from "@/lib/platform/gateway";
import type { AppName } from "@/lib/platform/session";

export const pushTokenSchema = z.object({
  app: z.enum(["rider", "captain"]),
  token: z.string().trim().regex(/^(ExponentPushToken|ExpoPushToken)\[[\w-]+\]$/, "Send an Expo push token."),
  platform: z.enum(["android", "ios", "web"]),
});

async function hasProfile(userId: string, app: AppName) {
  const { data } = await db().from(app === "rider" ? "riders" : "captains").select("user_id").eq("user_id", userId).maybeSingle();
  return Boolean(data);
}

export async function registerPushToken(userId: string, input: z.infer<typeof pushTokenSchema>) {
  if (!(await hasProfile(userId, input.app))) throw new AppError("Finish signing up first.", 403);
  const saved = await db().from("push_tokens").upsert({ token: input.token, user_id: userId, app: input.app, platform: input.platform, updated_at: new Date().toISOString() });
  const failure = dbError(saved.error);
  if (failure) throw failure;
  return { ok: true };
}

export async function removePushToken(userId: string, token: string) {
  await db().from("push_tokens").delete().eq("token", token).eq("user_id", userId);
  return { ok: true };
}

export const ticketSchema = z.object({
  app: z.enum(["rider", "captain"]),
  topic: z.string().trim().min(2).max(60),
  message: z.string().trim().min(8, "Tell us a little more.").max(2000),
  tripCode: z.string().trim().toUpperCase().regex(/^RV-\d{4,8}$/).optional(),
});

export const replySchema = z.object({ message: z.string().trim().min(1).max(2000) });

function shapeTicket(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    code: row.code as string,
    topic: row.topic as string,
    status: row.status as string,
    tripCode: (row.trip_code as string | null) ?? null,
    createdAt: row.created_at as string,
    lastMessageAt: row.last_message_at as string,
  };
}

export async function openTicket(userId: string, input: z.infer<typeof ticketSchema>) {
  if (!(await hasProfile(userId, input.app))) throw new AppError("Finish signing up first.", 403);
  const client = db();
  const { count } = await client.from("support_tickets").select("id", { count: "exact", head: true }).eq("user_id", userId).in("status", ["open", "pending"]);
  if ((count ?? 0) >= 5) throw new AppError("You have five open requests. The desk replies to those first.", 429);
  let tripId: string | null = null;
  if (input.tripCode) {
    const column = input.app === "rider" ? "rider_id" : "captain_id";
    const { data: trip } = await client.from("trips").select("id").eq("code", input.tripCode).eq(column, userId).maybeSingle();
    tripId = trip?.id ?? null;
  }
  const ticket = must(
    await client
      .from("support_tickets")
      .insert({ app: input.app, user_id: userId, topic: input.topic, trip_code: input.tripCode ?? null, trip_id: tripId, priority: /safety|accident|sos/i.test(input.topic) ? "urgent" : "normal" })
      .select("*")
      .single(),
  ) as Record<string, unknown>;
  const message = await client.from("support_messages").insert({ ticket_id: ticket.id, author: "user", body: input.message });
  const failure = dbError(message.error);
  if (failure) throw failure;
  return { ticket: shapeTicket(ticket) };
}

export async function myTickets(userId: string, app: AppName) {
  const { data } = await db().from("support_tickets").select("*").eq("user_id", userId).eq("app", app).order("created_at", { ascending: false }).limit(30);
  return { tickets: (data ?? []).map(shapeTicket) };
}

export async function myTicket(userId: string, id: string) {
  const client = db();
  const { data: ticket } = await client.from("support_tickets").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!ticket) throw new AppError("Request not found.", 404);
  const { data: messages } = await client.from("support_messages").select("id,author,body,created_at").eq("ticket_id", id).order("id");
  return { ticket: shapeTicket(ticket), messages: (messages ?? []).map((row) => ({ id: row.id, from: row.author === "staff" ? "desk" : "you", body: row.body, at: row.created_at })) };
}

export async function replyToTicket(userId: string, id: string, body: string) {
  const client = db();
  const { data: ticket } = await client.from("support_tickets").select("id,status").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!ticket) throw new AppError("Request not found.", 404);
  if (ticket.status === "closed") throw new AppError("This request is closed. Open a new one.", 409);
  const saved = await client.from("support_messages").insert({ ticket_id: id, author: "user", body });
  const failure = dbError(saved.error);
  if (failure) throw failure;
  await client.from("support_tickets").update({ status: "open", last_message_at: new Date().toISOString() }).eq("id", id);
  return myTicket(userId, id);
}
