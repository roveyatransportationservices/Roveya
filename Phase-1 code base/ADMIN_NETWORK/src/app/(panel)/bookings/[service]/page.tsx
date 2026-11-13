import { notFound, redirect } from "next/navigation";
import { CarpoolList } from "@/components/bookings/CarpoolList";
import { RideList } from "@/components/bookings/RideList";
import { isService } from "@/lib/services";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ServiceBookingsPage({ params, searchParams }: { params: Promise<{ service: string }>; searchParams: Promise<{ status?: string }> }) {
  const { service } = await params;
  const { status = "" } = await searchParams;
  // Old carpool links were /bookings/<id>.
  if (UUID.test(service)) redirect(`/bookings/carpool/${service}`);
  if (!isService(service)) notFound();
  return service === "carpool" ? <CarpoolList key="carpool" initialStatus={status} /> : <RideList key={service} service={service} initialStatus={status} />;
}
