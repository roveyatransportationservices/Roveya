import { ApiError, route, search } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { deskLookup, riderProfile, vadoProfile } from "@/lib/server/lookup";

const UUID = /^[0-9a-f-]{36}$/i;

// Read-only: the desk sees a person's recent activity, never edits it. Every lookup is in the audit log.
export const GET = route(async (req) => {
  const admin = await requireAdmin(["view.support", "safety.respond", "view.captains"]);
  const { get } = search(req);
  const rider = get("rider");
  const vado = get("vado");
  if (rider || vado) {
    const id = (rider ?? vado)!;
    if (!UUID.test(id)) throw new ApiError("Not found.", 404);
    const profile = rider ? await riderProfile(id) : await vadoProfile(id);
    if (!profile) throw new ApiError(rider ? "Rider not found." : "Vado not found.", 404);
    await audit(admin, "desk.lookup", rider ? "rider" : "captain", id, { by: "link" });
    return { query: profile.name, kind: profile.role, profiles: [profile], focus: null };
  }
  const q = (get("q") ?? "").slice(0, 40);
  if (q.trim().length < 4) throw new ApiError("Type a mobile number, ride code, trip code, PNR, Vado code or ticket number.", 400);
  const result = await deskLookup(q);
  await audit(admin, "desk.lookup", "search", null, { q: q.trim(), kind: result.kind, found: result.profiles.length });
  return result;
});
