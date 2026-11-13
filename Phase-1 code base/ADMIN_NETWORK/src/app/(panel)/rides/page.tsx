import { redirect } from "next/navigation";
import { serviceOfVehicle } from "@/lib/services";

// City rides now live under Bookings, one list per service.
export default async function RidesPage({ searchParams }: { searchParams: Promise<{ vehicle?: string; status?: string }> }) {
  const { vehicle, status } = await searchParams;
  redirect(`/bookings/${serviceOfVehicle(vehicle)}${status ? `?status=${encodeURIComponent(status)}` : ""}`);
}
