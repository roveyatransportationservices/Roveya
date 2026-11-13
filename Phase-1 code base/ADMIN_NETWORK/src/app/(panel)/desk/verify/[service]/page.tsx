import { notFound } from "next/navigation";
import { DeskQueue } from "@/components/desk/DeskQueue";
import { isService } from "@/lib/services";

export default async function DeskQueuePage({ params }: { params: Promise<{ service: string }> }) {
  const { service } = await params;
  if (!isService(service)) notFound();
  return <DeskQueue key={service} service={service} />;
}
