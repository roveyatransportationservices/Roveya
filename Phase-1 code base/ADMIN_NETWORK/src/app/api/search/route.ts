import { route, search, term } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { can } from "@/lib/roles";

// The sidebar search: PNR, trip code, phone number, captain code or name.
export const GET = route(async (req) => {
  const admin = await requireAdmin();
  const needle = term(search(req).get("q"));
  if (needle.length < 2) return { results: [] };
  const upper = needle.toUpperCase();
  const none = Promise.resolve({ data: [] as never[] });
  const has = (key: Parameters<typeof can>[1]) => can(admin.permissions, key);
  const [bookings, trips, captains, riders, tickets] = await Promise.all([
    has("view.bookings") ? db().from("seat_bookings").select("id,pnr,status").or(`pnr.ilike.%${upper}%,phone.ilike.%${needle}%`).limit(5) : none,
    has("view.trips") ? db().from("seat_trips").select("id,code,from_city,to_city,status").ilike("code", `%${upper}%`).limit(5) : none,
    has("view.captains") ? db().from("captains").select("user_id,name,captain_code,phone").or(`name.ilike.%${needle}%,captain_code.ilike.%${upper}%,phone.ilike.%${needle}%`).limit(5) : none,
    has("view.travellers") ? db().from("riders").select("user_id,name,phone").or(`name.ilike.%${needle}%,phone.ilike.%${needle}%`).limit(5) : none,
    has("view.support") ? db().from("support_tickets").select("id,code,topic").ilike("code", `%${upper}%`).limit(3) : none,
  ]);
  return {
    results: [
      ...(bookings.data ?? []).map((row) => ({ kind: "Booking", label: row.pnr, sub: row.status, href: `/bookings/carpool/${row.id}` })),
      ...(trips.data ?? []).map((row) => ({ kind: "Trip", label: row.code, sub: `${row.from_city.toUpperCase()} → ${row.to_city.toUpperCase()} · ${row.status}`, href: `/trips/${row.id}` })),
      ...(captains.data ?? []).map((row) => ({ kind: "Captain", label: row.name, sub: `${row.captain_code} · ${row.phone}`, href: `/captains/${row.user_id}` })),
      ...(riders.data ?? []).map((row) => ({ kind: "Traveller", label: row.name, sub: row.phone, href: `/travellers/${row.user_id}` })),
      ...(tickets.data ?? []).map((row) => ({ kind: "Ticket", label: row.code, sub: row.topic, href: `/support?ticket=${row.id}` })),
    ],
  };
});
