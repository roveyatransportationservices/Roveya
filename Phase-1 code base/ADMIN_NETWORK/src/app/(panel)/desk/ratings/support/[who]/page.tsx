import { notFound } from "next/navigation";
import { RatingsPage } from "@/components/desk/Ratings";

export default async function SupportFeedbackPage({ params }: { params: Promise<{ who: string }> }) {
  const { who } = await params;
  if (who !== "riders" && who !== "vado") notFound();
  return <RatingsPage key={who} side="support" keyName={who} />;
}
