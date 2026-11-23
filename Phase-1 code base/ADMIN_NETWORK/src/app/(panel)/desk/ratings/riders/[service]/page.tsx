import { notFound } from "next/navigation";
import { RatingsPage } from "@/components/desk/Ratings";
import { isService } from "@/lib/services";

export default async function RiderRatingsPage({ params }: { params: Promise<{ service: string }> }) {
  const { service } = await params;
  if (!isService(service)) notFound();
  return <RatingsPage key={service} side="riders" keyName={service} />;
}
