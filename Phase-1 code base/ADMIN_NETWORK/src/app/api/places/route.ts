import { route, search } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { loadtestBlocks } from "@/lib/loadtestGuard";

type Hit = { name: string; address: string; latitude: number; longitude: number };

// Pickup and drop search for desk bookings. Typing "17.4375, 78.4483" uses that exact point.
export const GET = route(async (req) => {
  await requireAdmin(["rides.manage", "bookings.manage"]);
  const q = (search(req).get("q") ?? "").slice(0, 80);
  const point = q.match(/^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/);
  if (point) {
    const latitude = Number(point[1]);
    const longitude = Number(point[2]);
    return { places: [{ name: `Pinned point ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, address: "Exact location", latitude, longitude }] };
  }
  if (q.length < 3) return { places: [] };
  const url = new URL(process.env.NOMINATIM_URL?.trim() ? `${process.env.NOMINATIM_URL.trim().replace(/\/$/, "")}/search` : "https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("countrycodes", "in");
  url.searchParams.set("limit", "6");
  // Prefer Hyderabad, but still find places elsewhere in India.
  url.searchParams.set("viewbox", "78.20,17.65,78.70,17.20");
  url.searchParams.set("bounded", "0");
  if (loadtestBlocks(url.toString())) return { places: [], note: "Place search is not answering. Paste the location as latitude, longitude." };
  const response = await fetch(url, { headers: { "User-Agent": "ROVEYA Admin Network (roveyatransportationservices@gmail.com)", "Accept-Language": "en" }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!response?.ok) return { places: [], note: "Place search is not answering. Paste the location as latitude, longitude." };
  const rows = (await response.json()) as { name?: string; display_name: string; lat: string; lon: string }[];
  const places: Hit[] = rows.map((row) => ({ name: row.name || row.display_name.split(",")[0]!, address: row.display_name, latitude: Number(row.lat), longitude: Number(row.lon) }));
  return { places };
});
