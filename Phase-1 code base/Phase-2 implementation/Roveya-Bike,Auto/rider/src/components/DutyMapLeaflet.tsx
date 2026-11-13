import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { demandZones } from "../data";
import { colors } from "../theme";
import { vehicleIcons } from "../vehicleIcons";
import type { VehicleKind } from "../types";

type Point = { latitude: number; longitude: number };

const iconSize = { bike: 54, auto: 42, cab: 52 };

export function LeafletDutyMap({ me, kind, online, target, padBottom, recenter }: { me: Point; kind: VehicleKind; online: boolean; target: Point | null; padBottom: number; recenter: number }) {
  const html = useMemo(() => mapHtml(me, kind), []);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const web = useRef<WebView>(null);
  const [ready, setReady] = useState(false);

  const send = (message: object) => {
    if (!ready) return;
    const json = JSON.stringify(message);
    if (Platform.OS === "web") frame.current?.contentWindow?.postMessage(json, "*");
    else web.current?.injectJavaScript(`window.update(${json}); true;`);
  };

  useEffect(() => {
    send({ online, me: [me.latitude, me.longitude], target: target ? [target.latitude, target.longitude] : null, pad: padBottom });
  }, [ready, online, me.latitude, me.longitude, target?.latitude, target?.longitude, padBottom, recenter]);

  if (Platform.OS === "web") {
    return (
      <View style={styles.fill}>
        {createElement("iframe", { ref: frame, srcDoc: html, title: "Demand map", onLoad: () => setReady(true), style: { border: 0, width: "100%", height: "100%", background: colors.night } })}
      </View>
    );
  }
  return (
    <View style={styles.fill}>
      <WebView ref={web} originWhitelist={["*"]} source={{ html, baseUrl: "https://roveya.app/" }} style={styles.fill} scrollEnabled={false} onLoadEnd={() => setReady(true)} />
    </View>
  );
}

function mapHtml(center: Point, kind: VehicleKind) {
  const size = iconSize[kind];
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
html,body,#map{height:100%;margin:0;background:${colors.night}}
.leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) brightness(0.85) contrast(0.9) saturate(0.55);transition:filter .6s}
body.offline .leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) brightness(0.55) contrast(0.85) saturate(0)}
.leaflet-control-attribution{font-size:9px;background:rgba(18,6,13,0.7)!important;color:rgba(246,241,220,0.6)}
.leaflet-control-attribution a{color:${colors.gold}}
.zone{background:${colors.inkwell};color:${colors.cream};border:1px solid rgba(214,160,0,0.55);border-radius:10px;font:600 11px system-ui,-apple-system,sans-serif;padding:5px 8px;box-shadow:0 4px 10px rgba(0,0,0,0.45)}
.zone:before{display:none}
.zone b{color:${colors.gold}}
body.offline .zone{display:none}
.me{position:relative;width:${size}px;height:${size}px}
.me img{width:100%;height:100%;filter:drop-shadow(0 0 1.2px rgba(246,241,220,0.75)) drop-shadow(0 3px 3px rgba(0,0,0,0.6))}
.me .ring{position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(214,160,0,0.35);animation:ping 2.4s ease-out infinite}
body.offline .me .ring{display:none}
@keyframes ping{0%{transform:scale(1);opacity:.9}100%{transform:scale(7);opacity:0}}
.pin{width:16px;height:16px;box-sizing:border-box;border-radius:8px;background:${colors.gold};border:3px solid ${colors.cream};box-shadow:0 0 0 7px rgba(214,160,0,0.25)}
</style>
</head>
<body class="offline">
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var zones = ${JSON.stringify(demandZones)};
var map = L.map("map", { zoomControl: false }).setView([${center.latitude}, ${center.longitude}], 14);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
var layers = [];
zones.forEach(function (z) {
  var hot = z.level === "High";
  var c = L.circle([z.latitude, z.longitude], { radius: z.radius, color: "${colors.gold}", weight: 1, opacity: hot ? 0.7 : 0.4, fillColor: hot ? "${colors.gold}" : "${colors.goldBright}", fillOpacity: hot ? 0.22 : 0.12 });
  c.bindTooltip("<b>" + z.level + "</b> · " + z.name, { permanent: true, direction: "center", className: "zone" });
  layers.push(c);
});
var me = L.marker([${center.latitude}, ${center.longitude}], { icon: L.divIcon({ className: "", html: '<div class="me"><span class="ring"></span><img alt="" src="${vehicleIcons[kind]}"/></div>', iconSize: [${size}, ${size}], iconAnchor: [${size / 2}, ${size / 2}] }), zIndexOffset: 1000 }).addTo(map);
var pin = null, line = null, shown = false;
window.update = function (d) {
  document.body.classList.toggle("offline", !d.online);
  if (d.online && !shown) { layers.forEach(function (l) { l.addTo(map); }); shown = true; }
  if (!d.online && shown) { layers.forEach(function (l) { map.removeLayer(l); }); shown = false; }
  if (d.me) me.setLatLng(d.me);
  if (pin) { map.removeLayer(pin); pin = null; }
  if (line) { map.removeLayer(line); line = null; }
  var pad = d.pad || 260;
  if (d.target) {
    pin = L.marker(d.target, { icon: L.divIcon({ className: "", html: '<div class="pin"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }) }).addTo(map);
    line = L.polyline([d.me, d.target], { color: "${colors.gold}", weight: 3, dashArray: "6 7" }).addTo(map);
    var free = Math.max(120, map.getSize().y - pad);
    var zoom = free > 360 ? 14 : 15;
    var lift = (pad - 60) / 2;
    map.setView(map.unproject(map.project(d.target, zoom).add([0, lift]), zoom), zoom, { animate: true });
  } else {
    var shift = Math.max(0, (pad - 90) / 2);
    map.setView(map.unproject(map.project(d.me, 14).add([0, shift]), 14), 14, { animate: true });
  }
};
function onMessage(e) { try { window.update(JSON.parse(e.data)); } catch (err) {} }
window.addEventListener("message", onMessage);
document.addEventListener("message", onMessage);
</script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.night },
});
