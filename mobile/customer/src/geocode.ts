import { api, live } from "./backend";
import type { Place } from "./types";

type NominatimResult = { place_id: number; lat: string; lon: string; name?: string; display_name: string };
type ServerPlace = { id: string; name: string; subtitle: string; latitude: number | null; longitude: number | null };

// One search session per typing burst keeps Google autocomplete billed as a single session.
let session = "";
let sessionAt = 0;
function sessionToken() {
  if (!session || Date.now() - sessionAt > 3 * 60 * 1000) {
    session = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
  sessionAt = Date.now();
  return session;
}

function fromServer(row: ServerPlace): Place {
  return { id: row.id, name: row.name, subtitle: row.subtitle || "India", latitude: row.latitude ?? Number.NaN, longitude: row.longitude ?? Number.NaN };
}

export function hasPoint(place: Place) {
  return Number.isFinite(place.latitude) && Number.isFinite(place.longitude);
}

// Google suggestions carry no coordinates until the passenger picks one.
export async function resolvePlace(place: Place): Promise<Place> {
  if (hasPoint(place)) return place;
  const result = await api<{ place: ServerPlace }>(`/maps/place/${encodeURIComponent(place.id)}?session=${sessionToken()}`);
  session = "";
  return { ...fromServer(result.place), name: place.name, subtitle: place.subtitle };
}

export async function searchAddresses(query: string, near: { latitude: number; longitude: number }, signal?: AbortSignal): Promise<Place[]> {
  if (live) {
    const params = new URLSearchParams({ q: query, lat: String(near.latitude), lng: String(near.longitude), session: sessionToken() });
    const result = await api<{ places: ServerPlace[] }>(`/maps/search?${params.toString()}`);
    return signal?.aborted ? [] : result.places.map(fromServer);
  }
  const span = 0.6;
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    countrycodes: "in",
    limit: "8",
    viewbox: `${near.longitude - span},${near.latitude + span},${near.longitude + span},${near.latitude - span}`,
    "accept-language": "en",
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return [];
  const rows = (await response.json()) as NominatimResult[];
  const seen = new Set<string>();
  return rows.map((row) => {
    const parts = row.display_name.split(",").map((part) => part.trim()).filter(Boolean);
    const name = row.name?.trim() || parts[0] || query;
    const rest = parts.filter((part) => part !== name && !/^\d{6}$/.test(part) && part !== "India");
    return {
      id: `osm-${row.place_id}`,
      name,
      subtitle: rest.slice(0, 3).join(", ") || "India",
      latitude: Number(row.lat),
      longitude: Number(row.lon),
    };
  }).filter((place) => {
    const key = `${place.name}|${place.subtitle.split(",")[0]}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
