import { ApiError, route, search } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { priceRide, type CityVehicle } from "@/lib/server/bookings";
import { db } from "@/lib/server/db";
import { OPEN, SERVICE_NAME } from "@/lib/server/rides";

const point = (value: string | undefined) => {
  const match = (value ?? "").match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  return match ? { name: "", latitude: Number(match[1]), longitude: Number(match[2]) } : null;
};

// Helpers for desk bookings: ?phone= finds the passenger, ?vehicle=&from=lat,lng&to=lat,lng quotes a city ride.
export const GET = route(async (req) => {
  await requireAdmin(["rides.manage", "bookings.manage"]);
  const get = search(req).get;
  const phone = get("phone");
  if (phone !== undefined) {
    if (!/^[6-9]\d{9}$/.test(phone)) return { passenger: null };
    const { data: rider } = await db().from("riders").select("user_id,name,phone,email,status").eq("phone", phone).maybeSingle();
    if (!rider) return { passenger: null };
    const [{ data: wallet }, { data: open }] = await Promise.all([
      db().from("wallets").select("balance_paise").eq("owner_id", rider.user_id).maybeSingle(),
      db().from("trips").select("id,code,vehicle,status").eq("rider_id", rider.user_id).in("status", OPEN).maybeSingle(),
    ]);
    return { passenger: { ...rider, walletPaise: Number(wallet?.balance_paise ?? 0), openRide: open ? { ...open, service: SERVICE_NAME[open.vehicle as CityVehicle] } : null } };
  }
  const vehicle = get("vehicle");
  const from = point(get("from"));
  const to = point(get("to"));
  if (!vehicle || !["bike", "auto", "cab"].includes(vehicle) || !from || !to) throw new ApiError("Pick the vehicle, pickup and drop.", 400);
  return { quote: await priceRide(vehicle as CityVehicle, from, to) };
});
