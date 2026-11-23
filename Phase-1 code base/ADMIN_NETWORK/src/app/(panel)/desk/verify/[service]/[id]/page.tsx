import { notFound } from "next/navigation";
import { DeskReview } from "@/components/desk/DeskReview";
import { isService } from "@/lib/services";

export default async function DeskReviewPage({ params }: { params: Promise<{ service: string; id: string }> }) {
  const { service, id } = await params;
  if (!isService(service) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return <DeskReview key={id} service={service} id={id} />;
}
