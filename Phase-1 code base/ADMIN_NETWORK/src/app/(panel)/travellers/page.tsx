import { redirect } from "next/navigation";
import { isService } from "@/lib/services";

// Passengers are listed per service under Riders and Vado → ROVEYA Riders. Old links land on the right one.
export default async function TravellersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  redirect(`/riders/${isService(params.kind) ? params.kind : "bike"}`);
}
