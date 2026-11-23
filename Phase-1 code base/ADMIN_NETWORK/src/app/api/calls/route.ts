import { z } from "zod";
import { ApiError, check, readBody, route, search } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { bridge, bridgeReady } from "@/lib/server/calls";
import { controls } from "@/lib/server/db";

export const GET = route(async (req) => {
  const admin = await requireAdmin(["calls.make", "view.safety", "view.support"]);
  const { get, from, to, page, size } = search(req);
  let query = controls().from("call_log").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(from, to);
  const phone = get("phone");
  if (phone && /^\d{10}$/.test(phone)) query = query.eq("to_phone", phone);
  if (get("mine") === "1") query = query.eq("admin_id", admin.id);
  const result = await query;
  return { calls: check(result), total: result.count ?? 0, page, size, bridgeReady: bridgeReady(), myPhone: admin.phone };
});

const schema = z.object({
  action: z.enum(["bridge", "log"]),
  phone: z.string().regex(/^[6-9]\d{9}$/, "That is not a 10-digit Indian mobile number."),
  name: z.string().trim().max(80).optional(),
  kind: z.enum(["Captain", "Traveller", "Contact", "Other"]).optional(),
  entity: z.string().max(30).optional(),
  entityId: z.string().max(80).optional(),
  outcome: z.enum(["reached", "no_answer", "busy", "wrong_number", "callback"]).optional(),
  note: z.string().trim().max(1000).optional(),
});

// bridge: ROVEYA rings your phone, then the captain or traveller. log: you called from your own phone.
export const POST = route(async (req) => {
  const admin = await requireAdmin("calls.make");
  const input = await readBody(req, schema);
  let mode: "bridged" | "direct" = "direct";
  let sid: string | null = null;
  if (input.action === "bridge") {
    if (!admin.phone) throw new ApiError("Add your mobile number in Admin team first, so ROVEYA knows which phone to ring.", 400);
    const result = await bridge(admin.phone, input.phone);
    if (!result) throw new ApiError("Private call connecting is off until launch. Call from your phone.", 409);
  }
  const saved = check(
    await controls()
      .from("call_log")
      .insert({ admin_id: admin.id, admin_name: admin.name, to_phone: input.phone, to_name: input.name ?? null, to_kind: input.kind ?? null, entity: input.entity ?? null, entity_id: input.entityId ?? null, mode, provider_sid: sid, outcome: input.outcome ?? null, note: input.note || null })
      .select("*")
      .single(),
  );
  await audit(admin, `call.${input.action}`, input.entity ?? "call", input.entityId ?? String(saved.id), { phone: input.phone, outcome: input.outcome ?? null });
  return { call: saved, message: "Call saved." };
});
