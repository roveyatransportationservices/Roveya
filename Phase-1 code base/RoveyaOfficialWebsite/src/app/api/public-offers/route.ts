import { loadOffers } from "@/lib/offers";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await loadOffers();
  return Response.json(result, {
    headers: result.ok
      ? { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=60" }
      : { "Cache-Control": "no-store" },
  });
}
