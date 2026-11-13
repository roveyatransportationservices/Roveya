import "server-only";
import { logServerError } from "@/lib/errors";
import { decodePolyline, thin } from "@/lib/platform/polyline";
import { roadKm, type Point } from "@/lib/platform/pricing";

export type RoadRoute = { km: number; minutes: number; coords: [number, number][]; source: "google" | "osrm" | "estimate" };
export type PlaceHit = { id: string; name: string; subtitle: string; latitude: number | null; longitude: number | null };

const googleKey = () => process.env.GOOGLE_MAPS_API_KEY?.trim() ?? "";
const osrmUrl = () => (process.env.OSRM_URL ?? "").trim().replace(/\/$/, "");
const nominatimUrl = () => (process.env.NOMINATIM_URL ?? "").trim().replace(/\/$/, "");

const routes = new Map<string, { at: number; route: RoadRoute }>();
const ROUTE_TTL = 10 * 60 * 1000;

function routeKey(from: Point, to: Point) {
  const r = (value: number) => value.toFixed(4);
  return `${r(from.latitude)},${r(from.longitude)};${r(to.latitude)},${r(to.longitude)}`;
}

async function googleRoute(from: Point, to: Point): Promise<RoadRoute | null> {
  const key = googleKey();
  if (!key) return null;
  const traffic = process.env.GOOGLE_ROUTES_TRAFFIC === "1";
  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: from.latitude, longitude: from.longitude } } },
      destination: { location: { latLng: { latitude: to.latitude, longitude: to.longitude } } },
      travelMode: "DRIVE",
      routingPreference: traffic ? "TRAFFIC_AWARE" : "TRAFFIC_UNAWARE",
      regionCode: "IN",
      units: "METRIC",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) {
    logServerError("google-routes", new Error(`HTTP ${response.status}`));
    return null;
  }
  const body = (await response.json()) as { routes?: { distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } }[] };
  const best = body.routes?.[0];
  if (!best?.distanceMeters) return null;
  const seconds = Number(String(best.duration ?? "0").replace("s", "")) || 0;
  return {
    km: Math.max(0.5, Math.round(best.distanceMeters / 10) / 100),
    minutes: Math.max(1, Math.round(seconds / 60)),
    coords: thin(decodePolyline(best.polyline?.encodedPolyline ?? "")),
    source: "google",
  };
}

async function osrmRoute(from: Point, to: Point): Promise<RoadRoute | null> {
  const base = osrmUrl();
  if (!base) return null;
  const response = await fetch(`${base}/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson`, {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] };
  const best = body.routes?.[0];
  if (!best) return null;
  return {
    km: Math.max(0.5, Math.round(best.distance / 10) / 100),
    minutes: Math.max(1, Math.round(best.duration / 60)),
    coords: thin(best.geometry.coordinates),
    source: "osrm",
  };
}

// Google first, then ROVEYA's own OSRM server, then a straight-line estimate.
export async function roadRoute(from: Point, to: Point): Promise<RoadRoute> {
  const key = routeKey(from, to);
  const cached = routes.get(key);
  if (cached && Date.now() - cached.at < ROUTE_TTL) return cached.route;
  let route: RoadRoute | null = null;
  for (const source of [googleRoute, osrmRoute]) {
    try {
      route = await source(from, to);
    } catch (error) {
      logServerError("route", error);
    }
    if (route) break;
  }
  route ??= {
    km: roadKm(from, to),
    minutes: Math.max(3, Math.round((roadKm(from, to) / 24) * 60)),
    coords: [
      [from.longitude, from.latitude],
      [to.longitude, to.latitude],
    ],
    source: "estimate",
  };
  if (routes.size > 2000) routes.clear();
  routes.set(key, { at: Date.now(), route });
  return route;
}

async function googleSearch(query: string, near: Point, session: string): Promise<PlaceHit[] | null> {
  const key = googleKey();
  if (!key) return null;
  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat",
    },
    body: JSON.stringify({
      input: query,
      includedRegionCodes: ["in"],
      languageCode: "en",
      sessionToken: session || undefined,
      locationBias: { circle: { center: { latitude: near.latitude, longitude: near.longitude }, radius: 30000 } },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) {
    logServerError("google-places", new Error(`HTTP ${response.status}`));
    return null;
  }
  const body = (await response.json()) as {
    suggestions?: { placePrediction?: { placeId?: string; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } }[];
  };
  return (body.suggestions ?? [])
    .map((row) => row.placePrediction)
    .filter((row): row is NonNullable<typeof row> => Boolean(row?.placeId && row.structuredFormat?.mainText?.text))
    .slice(0, 8)
    .map((row) => ({
      id: `g:${row.placeId}`,
      name: row.structuredFormat!.mainText!.text!,
      subtitle: (row.structuredFormat?.secondaryText?.text ?? "").replace(/, India$/, ""),
      latitude: null,
      longitude: null,
    }));
}

async function nominatimSearch(query: string, near: Point): Promise<PlaceHit[] | null> {
  const base = nominatimUrl();
  if (!base) return null;
  const span = 0.6;
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    countrycodes: "in",
    limit: "8",
    viewbox: `${near.longitude - span},${near.latitude + span},${near.longitude + span},${near.latitude - span}`,
  });
  const response = await fetch(`${base}/search?${params.toString()}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!response.ok) return null;
  const rows = (await response.json()) as { place_id: number; lat: string; lon: string; name?: string; display_name: string }[];
  return rows.map((row) => {
    const parts = row.display_name.split(",").map((part) => part.trim());
    const name = row.name?.trim() || parts[0] || query;
    return { id: `n:${row.place_id}`, name, subtitle: parts.filter((part) => part !== name && part !== "India").slice(0, 3).join(", "), latitude: Number(row.lat), longitude: Number(row.lon) };
  });
}

export async function searchPlaces(query: string, near: Point, session: string) {
  try {
    const google = await googleSearch(query, near, session);
    if (google) return { places: google, source: "google" };
    const nominatim = await nominatimSearch(query, near);
    if (nominatim) return { places: nominatim, source: "nominatim" };
  } catch (error) {
    logServerError("search", error);
  }
  return { places: [] as PlaceHit[], source: "none" };
}

export async function placeDetails(id: string, session: string): Promise<PlaceHit | null> {
  const key = googleKey();
  const placeId = id.replace(/^g:/, "");
  if (!key || !/^[\w-]+$/.test(placeId)) return null;
  const url = new URL(`https://places.googleapis.com/v1/places/${placeId}`);
  if (session) url.searchParams.set("sessionToken", session);
  const response = await fetch(url, {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "location,displayName,formattedAddress" },
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { location?: { latitude?: number; longitude?: number }; displayName?: { text?: string }; formattedAddress?: string };
  const latitude = Number(body.location?.latitude);
  const longitude = Number(body.location?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const name = body.displayName?.text ?? body.formattedAddress ?? "Selected place";
  return { id, name, subtitle: (body.formattedAddress ?? "").replace(/, India$/, ""), latitude, longitude };
}

// Gives "Current location" a street name so the captain knows where to go.
export async function streetName(point: Point): Promise<string | null> {
  const key = googleKey();
  if (!key) return null;
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("latlng", `${point.latitude},${point.longitude}`);
    url.searchParams.set("result_type", "street_address|route|premise|sublocality");
    url.searchParams.set("key", key);
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const body = (await response.json()) as { results?: { formatted_address?: string }[] };
    const address = body.results?.[0]?.formatted_address;
    return address ? address.split(",").slice(0, 2).join(",").trim().slice(0, 120) : null;
  } catch {
    return null;
  }
}
