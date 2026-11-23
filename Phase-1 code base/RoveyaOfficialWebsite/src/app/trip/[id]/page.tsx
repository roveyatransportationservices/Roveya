import type { Metadata } from "next";
import { Booker } from "@/components/Booker";

export const metadata: Metadata = { title: "Choose your seats" };

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Booker id={id} />;
}
