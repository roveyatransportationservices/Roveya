type Coord = [number, number];

function heading(from: Coord, to: Coord) {
  const dx = (to[0] - from[0]) * Math.cos((from[1] * Math.PI) / 180);
  const dy = to[1] - from[1];
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

function lengths(coords: Coord[]) {
  const out = [0];
  for (let i = 1; i < coords.length; i += 1) {
    const dx = (coords[i][0] - coords[i - 1][0]) * Math.cos((coords[i][1] * Math.PI) / 180);
    const dy = coords[i][1] - coords[i - 1][1];
    out.push(out[i - 1] + Math.hypot(dx, dy));
  }
  return out;
}

export function alongPath(coords: Coord[], progress: number) {
  const p = Math.min(1, Math.max(0, progress));
  if (coords.length < 2) {
    const only = coords[0] ?? [0, 0];
    return { latitude: only[1], longitude: only[0], heading: 0, remaining: coords };
  }
  const sums = lengths(coords);
  const target = sums[sums.length - 1] * p;
  let i = 1;
  while (i < sums.length - 1 && sums[i] < target) i += 1;
  const span = sums[i] - sums[i - 1] || 1;
  const t = Math.min(1, Math.max(0, (target - sums[i - 1]) / span));
  const a = coords[i - 1];
  const b = coords[i];
  const here: Coord = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return { latitude: here[1], longitude: here[0], heading: heading(a, b), remaining: [here, ...coords.slice(i)] };
}
