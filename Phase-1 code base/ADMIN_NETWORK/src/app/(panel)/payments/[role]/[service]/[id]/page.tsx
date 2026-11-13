import { notFound } from "next/navigation";
import { PersonPayments } from "@/components/payments/PersonPayments";
import { isService } from "@/lib/services";

export default async function PersonPaymentsPage({ params }: { params: Promise<{ role: string; service: string; id: string }> }) {
  const { role, service, id } = await params;
  if ((role !== "riders" && role !== "vado") || !isService(service) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return <PersonPayments key={id} role={role} service={service} id={id} />;
}
