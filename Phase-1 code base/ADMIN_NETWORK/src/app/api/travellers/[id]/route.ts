import { z } from "zod";
import { check, mustId, readBody, route } from "@/lib/server/api";
import { can } from "@/lib/roles";
import { audit, requireAdmin, type Admin } from "@/lib/server/auth";
import { balances, type Row } from "@/lib/server/data";
import { controls, db } from "@/lib/server/db";
import { rideLine } from "@/lib/server/rides";
import { SERVICE_KEYS, serviceOfVehicle } from "@/lib/services";

async function detail(id: string) {
  const rider = check(await db().from("riders").select("*").eq("user_id", id).maybeSingle(), "Traveller not found.");
  const [bookings, rides, ledger, contacts, tickets, payments] = await Promise.all([
    controls().from("seat_booking_facts").select("id,pnr,status,trip_code,from_city,to_city,depart_at,seats,paid_paise,refund_paise,created_at").eq("rider_id", id).order("created_at", { ascending: false }).limit(50),
    db().from("trips").select("*").eq("rider_id", id).order("requested_at", { ascending: false }).limit(50),
    db().from("ledger_entries").select("id,kind,amount_paise,ref_type,ref_id,note,created_at").eq("owner_id", id).order("created_at", { ascending: false }).limit(50),
    db().from("emergency_contacts").select("id,name,phone,relation").eq("owner_id", id),
    db().from("support_tickets").select("id,code,topic,status,created_at").eq("user_id", id).eq("app", "rider").order("created_at", { ascending: false }).limit(20),
    db().from("payment_intents").select("id,purpose,amount_paise,status,created_at").eq("owner_id", id).order("created_at", { ascending: false }).limit(30),
  ]);
  const wallet = await balances([id]);
  const rows = bookings.data ?? [];
  const rideRows = ((rides.data ?? []) as Row[]).map(rideLine);
  // Bookings, completed and spend for each service this passenger has used.
  const services = SERVICE_KEYS.map((key) => {
    if (key === "carpool") {
      const live = rows.filter((row) => row.status !== "pending" && row.status !== "expired");
      const paid = rows.filter((row) => row.status === "confirmed" || row.status === "completed");
      return { key, orders: live.length, completed: rows.filter((row) => row.status === "completed").length, spentPaise: paid.reduce((sum, row) => sum + Number(row.paid_paise), 0) };
    }
    const mine = rideRows.filter((ride) => serviceOfVehicle(ride.vehicle) === key);
    const done = mine.filter((ride) => ride.status === "completed");
    return { key, orders: mine.length, completed: done.length, spentPaise: done.reduce((sum, ride) => sum + ride.owedPaise, 0) };
  });
  return {
    traveller: rider,
    walletPaise: wallet.get(id) ?? 0,
    services,
    rides: rideRows,
    bookings: rows,
    ledger: ledger.data ?? [],
    contacts: contacts.data ?? [],
    tickets: tickets.data ?? [],
    payments: payments.data ?? [],
    stats: {
      bookings: rows.filter((row) => row.status !== "pending" && row.status !== "expired").length,
      spentPaise: rows.filter((row) => row.status === "confirmed" || row.status === "completed").reduce((sum, row) => sum + Number(row.paid_paise), 0),
      refundsPaise: rows.reduce((sum, row) => sum + Number(row.refund_paise ?? 0), 0),
    },
  };
}

async function forAdmin(id: string, admin: Admin) {
  const data = await detail(id);
  if (can(admin.permissions, "view.finance")) return data;
  return { ...data, walletPaise: null, ledger: [], payments: [] };
}

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const admin = await requireAdmin("view.travellers");
  return forAdmin(mustId(id, "Traveller"), admin);
});

const patch = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().email("Check the email format.").or(z.literal("")).optional(),
});

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const admin = await requireAdmin("travellers.edit");
  mustId(id, "Traveller");
  const input = await readBody(req, patch);
  const fields: Record<string, unknown> = {};
  if (input.name) fields.name = input.name;
  if (input.email !== undefined) fields.email = input.email || null;
  if (Object.keys(fields).length) check(await db().from("riders").update(fields).eq("user_id", id).select("user_id").single());
  await audit(admin, "traveller.update", "rider", id, input);
  return forAdmin(id, admin);
});
