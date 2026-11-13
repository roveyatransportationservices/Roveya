import type { Metadata } from "next";
import { Ticket } from "@/components/Ticket";

export const metadata: Metadata = { title: "Your ticket" };

export default async function BookingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <Ticket id={id} fresh={query.new === "1"} />;
}
