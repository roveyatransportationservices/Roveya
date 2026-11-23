import { check, route, search, term } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { type Row } from "@/lib/server/data";
import { db } from "@/lib/server/db";

// Reviews from the in-car QR scanner and from rated seat bookings.
// Only published ones appear in "Journeys worth sharing" on the website.
export const GET = route(async (req) => {
  await requireAdmin("view.support");
  const { get } = search(req);
  let query = db().from("testimonials").select("*").order("created_at", { ascending: false }).limit(300);
  const state = get("state");
  if (state === "pending") query = query.eq("published", false);
  if (state === "published") query = query.eq("published", true);
  const source = get("source");
  if (source) query = query.eq("source", source);
  const q = term(get("q"));
  if (q) query = query.or(`name.ilike.%${q}%,quote.ilike.%${q}%,route.ilike.%${q}%,car_plate.ilike.%${q}%,mobile.ilike.%${q}%`);
  const reviews = check(await query) as Row[];
  const { count: waiting } = await db().from("testimonials").select("id", { count: "exact", head: true }).eq("published", false);
  return { reviews, waiting: waiting ?? 0 };
});
