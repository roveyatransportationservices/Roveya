/** Client GPS helpers shared by customer map markers (heading wrap + fresher samples). */

export type TrackFix = {
  latitude: number;
  longitude: number;
  heading: number;
  accuracy?: number | null;
  at: number;
};

const rad = (value: number) => (value * Math.PI) / 180;

export function metresBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function bearingDegrees(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }) {
  const y = Math.sin(rad(to.longitude - from.longitude)) * Math.cos(rad(to.latitude));
  const x = Math.cos(rad(from.latitude)) * Math.sin(rad(to.latitude)) - Math.sin(rad(from.latitude)) * Math.cos(rad(to.latitude)) * Math.cos(rad(to.longitude - from.longitude));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function blendHeading(previous: number, next: number, factor = 0.35) {
  const delta = ((next - previous + 540) % 360) - 180;
  return (previous + delta * factor + 360) % 360;
}

export function validGpsHeading(raw: number | null | undefined) {
  return raw != null && Number.isFinite(raw) && raw >= 0 && raw <= 360;
}

export function nextTrackFix(previous: TrackFix | null, sample: { latitude: number; longitude: number; heading?: number | null; accuracy?: number | null; at?: number }): TrackFix {
  const at = sample.at ?? Date.now();
  const accuracy = sample.accuracy ?? null;
  const movedM = previous ? metresBetween(previous, sample) : 999;
  const noiseFloor = Math.max(6, Math.min(25, accuracy ?? 12));
  const moving = movedM >= noiseFloor;

  let heading = previous?.heading ?? 0;
  if (moving && previous && movedM >= 12) {
    const fromMove = bearingDegrees(previous, sample);
    heading = blendHeading(previous.heading, fromMove, 0.45);
  } else if (moving && validGpsHeading(sample.heading)) {
    heading = previous ? blendHeading(previous.heading, sample.heading!, 0.35) : sample.heading!;
  } else if (!previous && validGpsHeading(sample.heading)) {
    heading = sample.heading!;
  }

  if (previous && !moving) {
    return { latitude: previous.latitude, longitude: previous.longitude, heading, accuracy, at };
  }
  return { latitude: sample.latitude, longitude: sample.longitude, heading, accuracy, at };
}

export function sustainedAwayFromGoal(samples: { distanceKm: number; moving: boolean }[], growKm = 0.15, need = 3) {
  if (samples.length < need + 1) return false;
  const recent = samples.slice(-(need + 1));
  if (recent.some((s) => !s.moving)) return false;
  return recent[recent.length - 1].distanceKm - recent[0].distanceKm >= growKm;
}
