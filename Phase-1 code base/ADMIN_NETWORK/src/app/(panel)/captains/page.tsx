import { redirect } from "next/navigation";
import { isService } from "@/lib/services";

// Captains are listed per service under Riders and Vado → ROVEYA Vado. Old links land on the right one.
export default async function CaptainsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const kind = isService(params.kind) ? params.kind : params.service === "taxi" ? "bike" : "carpool";
  const view = params.docs === "pending" ? "docs" : (params.status ?? "");
  redirect(`/vado/${kind}${view ? `?view=${view}` : ""}`);
}
