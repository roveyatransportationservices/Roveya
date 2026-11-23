import { notFound } from "next/navigation";
import { CaptainLive } from "@/components/live/CaptainLive";

const SERVICES = ["bike", "auto", "car"] as const;

export default async function ServiceLivePage({ params }: { params: Promise<{ service: string }> }) {
  const { service } = await params;
  if (!(SERVICES as readonly string[]).includes(service)) notFound();
  return <CaptainLive key={service} service={service as (typeof SERVICES)[number]} soon={service === "car"} />;
}
