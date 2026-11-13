import { api, live } from "./backend";

type Point = { latitude: number; longitude: number };

export type RoadRoute = { coords: [number, number][]; km: number; minutes: number };

// Live builds ask the ROVEYA server (Google Routes or ROVEYA's own OSRM); the demo uses the public OSRM server.
export async function roadRoute(from: Point, to: Point, signal?: AbortSignal): Promise<RoadRoute | null> {
  if (live) {
    try {
      const route = await api<RoadRoute>(`/maps/route?from=${from.latitude},${from.longitude}&to=${to.latitude},${to.longitude}`);
      return signal?.aborted ? null : route;
    } catch {
      return null;
    }
  }
  const url = `https://router.project-osrm.org/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson`;
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return null;
    const data = (await response.json()) as { routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] };
    const best = data.routes?.[0];
    if (!best) return null;
    const step = Math.max(1, Math.floor(best.geometry.coordinates.length / 600));
    const coords = best.geometry.coordinates.filter((_, index, all) => index % step === 0 || index === all.length - 1);
    return { coords, km: best.distance / 1000, minutes: Math.max(1, Math.round(best.duration / 60)) };
  } catch {
    return null;
  }
}
