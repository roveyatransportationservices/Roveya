import { notFound, redirect } from "next/navigation";
import { currentAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { serviceOfVehicle } from "@/lib/services";

// Old ride links: send them to the ride under its service in Bookings.
export default async function RideRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  if (!(await currentAdmin())) redirect(`/login?next=${encodeURIComponent(`/rides/${id}`)}`);
  const { data } = await db().from("trips").select("vehicle").eq("id", id).maybeSingle();
  if (!data) notFound();
  redirect(`/bookings/${serviceOfVehicle(data.vehicle)}/${id}`);
}
