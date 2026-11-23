import { notFound } from "next/navigation";
import { PeopleList } from "@/components/payments/PeopleList";
import { isService } from "@/lib/services";

export default async function PaymentPeoplePage({ params }: { params: Promise<{ role: string; service: string }> }) {
  const { role, service } = await params;
  if ((role !== "riders" && role !== "vado") || !isService(service)) notFound();
  return <PeopleList key={`${role}-${service}`} role={role} service={service} />;
}
