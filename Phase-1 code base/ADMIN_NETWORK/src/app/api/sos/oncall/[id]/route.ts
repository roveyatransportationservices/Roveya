import { z } from "zod";
import { ApiError, check, readBody, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

const idOf = (id: string) => {
  if (!/^\d{1,12}$/.test(id)) throw new ApiError("Not found.", 404);
  return Number(id);
};

const schema = z.object({ active: z.boolean() });

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const admin = await requireAdmin("settings.manage");
  const input = await readBody(req, schema);
  const row = check(await db().from("sos_oncall").update({ active: input.active }).eq("id", idOf(id)).select("name").maybeSingle(), "Not found.") as { name: string };
  await audit(admin, input.active ? "sos.oncall.on" : "sos.oncall.off", "sos_oncall", id, { name: row.name });
  return { ok: true };
});

export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  const admin = await requireAdmin("settings.manage");
  const row = check(await db().from("sos_oncall").delete().eq("id", idOf(id)).select("name,phone").maybeSingle(), "Not found.") as { name: string; phone: string };
  await audit(admin, "sos.oncall.remove", "sos_oncall", id, row);
  return { ok: true };
});
