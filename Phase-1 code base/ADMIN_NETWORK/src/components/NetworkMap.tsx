"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { CHART } from "@/components/charts";
import { cityById } from "@/lib/rules";

export type MapCity = { id: string; name: string; state: string; status: string; departures: number; arrivals: number; vehicles: number; vado: number; searches: number; unmet: number; inNetwork: boolean };
export type MapLine = { from: string; to: string; weight: number };

const OUTSIDE = "#8A7F89";

export const STATUS_COLOR: Record<string, string> = {
  running: CHART.green,
  live: CHART.green,
  launching: CHART.amber,
  planned: CHART.sky,
  paused: "#9A8F99",
  quiet: CHART.gold,
  new: CHART.lilac,
};

const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
// OpenStreetMap has no dark tiles, so the dark theme inverts them.
const DARK_TILES = "invert(1) hue-rotate(180deg) brightness(0.8) contrast(0.9) saturate(0.6)";
const escape = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
const isLight = () => document.documentElement.dataset.theme === "light";

// Cities as dots (size by trips, colour by status), routes as gold lines (thicker with more trips)
// and demand gaps as dashed rose lines where passengers searched but no trip ran.
export function NetworkMap({ cities, routes, gaps, height = 460 }: { cities: MapCity[]; routes: MapLine[]; gaps: MapLine[]; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | null = null;
    void import("leaflet").then((L) => {
      if (cancelled || !box.current) return;
      map.current?.remove();
      const view = L.map(box.current, { scrollWheelZoom: false, attributionControl: true, zoomControl: true });
      map.current = view;
      L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 12 }).addTo(view);
      const shade = () => {
        const pane = view.getPane("tilePane");
        if (pane) pane.style.filter = isLight() ? "" : DARK_TILES;
      };
      shade();
      observer = new MutationObserver(shade);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

      const at = (id: string) => {
        const city = cityById(id);
        return city ? ([city.lat, city.lng] as [number, number]) : null;
      };
      for (const line of gaps) {
        const a = at(line.from);
        const b = at(line.to);
        if (a && b) L.polyline([a, b], { color: CHART.rose, weight: Math.min(2 + line.weight, 8), opacity: 0.75, dashArray: "6 8" }).addTo(view).bindTooltip(`${escape(cityById(line.from)?.name ?? line.from)} → ${escape(cityById(line.to)?.name ?? line.to)}: ${line.weight} passenger(s) found no trip`);
      }
      for (const line of routes) {
        const a = at(line.from);
        const b = at(line.to);
        if (a && b) L.polyline([a, b], { color: CHART.gold, weight: Math.min(2 + line.weight, 10), opacity: line.weight ? 0.9 : 0.4, dashArray: line.weight ? undefined : "2 6" }).addTo(view).bindTooltip(`${escape(cityById(line.from)?.name ?? line.from)} → ${escape(cityById(line.to)?.name ?? line.to)}: ${line.weight} trip(s)`);
      }
      const points: [number, number][] = [];
      for (const city of cities) {
        const spot = at(city.id);
        if (!spot) continue;
        if (city.inNetwork) points.push(spot);
        const trips = city.departures + city.arrivals;
        const radius = city.inNetwork ? Math.min(6 + Math.sqrt(trips) * 3, 22) : 3.5;
        const color = city.inNetwork ? (STATUS_COLOR[city.status] ?? CHART.gold) : city.unmet ? CHART.rose : OUTSIDE;
        L.circleMarker(spot, { radius, color, weight: city.inNetwork ? 2 : 1.5, fillColor: color, fillOpacity: city.inNetwork ? 0.45 : city.unmet ? 0.6 : 0 })
          .addTo(view)
          .bindPopup(
            `<div style="font:13px/1.45 system-ui,sans-serif;min-width:170px"><strong>${escape(city.name)}</strong> <span style="opacity:.7">· ${escape(city.state)}</span><br/>` +
              (city.inNetwork ? `${city.vehicles} vehicle(s) · ${city.vado} Riders<br/>${city.departures} trips out · ${city.arrivals} in<br/>` : "Not in the network yet<br/>") +
              `${city.searches} searcher(s) · ${city.unmet} found no trip<br/><a href="/networks/${escape(city.id)}" style="color:#D6A000">Open ${escape(city.name)}</a></div>`,
          );
      }
      const all = cities.map((city) => at(city.id)).filter((spot): spot is [number, number] => Boolean(spot));
      const focus = points.length >= 2 ? points : all;
      if (focus.length >= 2) view.fitBounds(L.latLngBounds(focus), { padding: [40, 40], maxZoom: 8 });
      else view.setView(focus[0] ?? [17.385, 78.4867], 7);
    });
    return () => {
      cancelled = true;
      observer?.disconnect();
      map.current?.remove();
      map.current = null;
    };
  }, [cities, routes, gaps]);

  return <div ref={box} style={{ height }} className="relative z-0 w-full overflow-hidden rounded-lg border border-line" />;
}

export function MapLegend() {
  const dot = (color: string, text: string) => (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {text}
    </span>
  );
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] muted">
      {dot(STATUS_COLOR.running!, "Running or live")}
      {dot(STATUS_COLOR.launching!, "Launching")}
      {dot(STATUS_COLOR.planned!, "Planned")}
      {dot(STATUS_COLOR.quiet!, "Quiet (no trips this period)")}
      {dot(STATUS_COLOR.paused!, "Paused")}
      {dot(CHART.rose, "Not in network, passengers searching")}
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full border-[1.5px]" style={{ borderColor: OUTSIDE }} /> Not in network yet
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-0.5 w-5" style={{ background: CHART.gold }} /> Route (thicker = more trips)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-0 w-5 border-t-2 border-dashed" style={{ borderColor: CHART.rose }} /> Demand gap
      </span>
    </div>
  );
}
