import { z } from "zod";
import { ApiError, check, readBody, route, search, uuid } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { controls } from "@/lib/server/db";
import { cityNetwork, PLAN_STATUSES } from "@/lib/server/networks";
import { cityById } from "@/lib/rules";

const PERIODS = [7, 30, 90];
const mustCity = (city: string) => {
  if (!cityById(city)) throw new ApiError("City not found.", 404);
  return city;
};

export const GET = route<{ city: string }>(async (req, { city }) => {
  await requireAdmin("view.trips");
  const days = Number(search(req).get("days"));
  return cityNetwork(mustCity(city), PERIODS.includes(days) ? days : 30);
});

const plan = z.object({
  status: z.enum(PLAN_STATUSES),
  targetCaptains: z.number().int().min(0).max(10000).nullable().optional(),
  launchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the launch date.").nullable().optional(),
  ownerId: z.string().regex(uuid).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

// Saves the city's launch plan: status, captain target, launch date, owner and a note.
export const PATCH = route<{ city: string }>(async (req, { city }) => {
  const admin = await requireAdmin("trips.manage");
  mustCity(city);
  const input = await readBody(req, plan);
  const { data: before } = await controls().from("network_cities").select("*").eq("city_id", city).maybeSingle();
  const row = { city_id: city, status: input.status, target_captains: input.targetCaptains ?? null, launch_date: input.launchDate ?? null, owner_id: input.ownerId ?? null, note: input.note || null, updated_by: admin.id };
  check(await controls().from("network_cities").upsert(row).select("city_id").single());
  await audit(admin, "network.plan", "network_city", city, { before, after: row });
  return cityNetwork(city, 30);
});

// Removes the plan; the city goes back to showing what trips say.
export const DELETE = route<{ city: string }>(async (_req, { city }) => {
  const admin = await requireAdmin("trips.manage");
  mustCity(city);
  const { data: before } = await controls().from("network_cities").select("*").eq("city_id", city).maybeSingle();
  if (!before) throw new ApiError("This city has no plan to remove.", 404);
  check(await controls().from("network_cities").delete().eq("city_id", city).select("city_id").single());
  await audit(admin, "network.plan_clear", "network_city", city, { before });
  return cityNetwork(city, 30);
});
