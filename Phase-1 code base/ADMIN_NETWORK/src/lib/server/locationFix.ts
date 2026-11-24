const kmBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const rad = (value: number) => (value * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

/** India-bound and 140 km/h speed gate used by captain location updates. */
export function locationFixBelievable(
  previous: { latitude: number; longitude: number; updatedAt?: string | null } | null,
  spot: { latitude: number; longitude: number },
  now = Date.now(),
) {
  if (!Number.isFinite(spot.latitude) || !Number.isFinite(spot.longitude)) return false;
  if (spot.latitude < 6.5 || spot.latitude > 37.6 || spot.longitude < 68 || spot.longitude > 97.5) return false;
  if (!previous || previous.latitude == null || previous.longitude == null) return true;
  const km = kmBetween({ lat: previous.latitude, lng: previous.longitude }, { lat: spot.latitude, lng: spot.longitude });
  const seconds = Math.max(1, (now - Date.parse(String(previous.updatedAt ?? ""))) / 1000);
  if (!Number.isFinite(seconds)) return km <= 2;
  return km / (seconds / 3600) <= 140;
}
