import { notFound } from "next/navigation";
import { CarpoolDetail } from "@/components/bookings/CarpoolDetail";
import { RideDetail } from "@/components/bookings/RideDetail";
import { isService } from "@/lib/services";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BookingDetailPage({ params }: { params: Promise<{ service: string; id: string }> }) {
  const { service, id } = await params;
  if (!isService(service) || !UUID.test(id)) notFound();
  return service === "carpool" ? <CarpoolDetail key={id} id={id} /> : <RideDetail key={id} id={id} />;
}
