import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { colors } from "../theme";
import { vehicleIcons } from "../vehicleIcons";

export type CaptainPin = { id: string; kind: "bike" | "auto"; latitude: number; longitude: number; heading: number };
type Point = { latitude: number; longitude: number };
type Edit = "pickup" | "drop";

export function LeafletRouteMap({
  pickup,
  drop,
  pickupLabel,
  dropLabel,
  route,
  captains,
  padTop,
  padBottom,
  recenter,
  mode = "plan",
  showDrop = true,
  showPickupLabel = true,
  pickupEta,
  dropEta,
  remaining,
  onEdit,
}: {
  pickup: Point;
  drop: Point;
  pickupLabel: string;
  dropLabel: string;
  route: [number, number][] | null;
  captains: CaptainPin[];
  padTop: number;
  padBottom: number;
  recenter: number;
  mode?: "plan" | "search" | "live";
  showDrop?: boolean;
  showPickupLabel?: boolean;
  pickupEta?: string;
  dropEta?: string;
  remaining?: [number, number][] | null;
  onEdit: (which: Edit) => void;
}) {
  const html = useMemo(() => mapHtml(pickup), []);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const web = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const editRef = useRef(onEdit);
  editRef.current = onEdit;

  const send = (message: object) => {
    if (!ready) return;
    const json = JSON.stringify(message);
    if (Platform.OS === "web") frame.current?.contentWindow?.postMessage(json, "*");
    else web.current?.injectJavaScript(`window.update(${json}); true;`);
  };

  const receive = (raw: unknown) => {
    try {
      const message = JSON.parse(String(raw)) as { type?: string; which?: Edit };
      if (message.type === "edit" && message.which) editRef.current(message.which);
    } catch {
      return;
    }
  };

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onMessage = (event: MessageEvent) => {
      if (event.source === frame.current?.contentWindow) receive(event.data);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const view = { mode, showDrop, showPickupLabel };

  useEffect(() => {
    send({
      view,
      pickup: [pickup.latitude, pickup.longitude],
      drop: [drop.latitude, drop.longitude],
      labels: { pickup: pickupLabel, drop: dropLabel, pickupEta, dropEta },
      route: route ? route.map(([lng, lat]) => [lat, lng]) : null,
      fit: { top: padTop, bottom: padBottom },
    });
  }, [ready, pickup.latitude, pickup.longitude, drop.latitude, drop.longitude, route]);

  useEffect(() => {
    send({ labels: { pickup: pickupLabel, drop: dropLabel, pickupEta, dropEta } });
  }, [pickupLabel, dropLabel, pickupEta, dropEta]);

  useEffect(() => {
    if (remaining) send({ remaining: remaining.map(([lng, lat]) => [lat, lng]) });
  }, [remaining]);

  useEffect(() => {
    send({ view, fit: { top: padTop, bottom: padBottom } });
  }, [padBottom, recenter, mode, showDrop, showPickupLabel]);

  useEffect(() => {
    send({ captains: captains.map((pin) => ({ id: pin.id, kind: pin.kind, at: [pin.latitude, pin.longitude], heading: pin.heading })) });
  }, [ready, captains]);

  if (Platform.OS === "web") {
    return (
      <View style={styles.fill}>
        {createElement("iframe", {
          ref: frame,
          srcDoc: html,
          title: "ROVEYA route map",
          onLoad: () => setReady(true),
          style: { border: 0, width: "100%", height: "100%", background: colors.night },
        })}
      </View>
    );
  }
  return (
    <View style={styles.fill}>
      <WebView
        ref={web}
        originWhitelist={["*"]}
        source={{ html, baseUrl: "https://roveya.app/" }}
        style={styles.fill}
        scrollEnabled={false}
        setBuiltInZoomControls={false}
        onLoadEnd={() => setReady(true)}
        onMessage={(event: WebViewMessageEvent) => receive(event.nativeEvent.data)}
      />
    </View>
  );
}

const iconSize = { bike: 54, auto: 42 };

function mapHtml(center: Point) {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
html,body,#map{height:100%;margin:0;background:${colors.night}}
.leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) brightness(0.85) contrast(0.9) saturate(0.55)}
.leaflet-control-attribution{font-size:9px;background:rgba(18,6,13,0.7)!important;color:rgba(246,241,220,0.6)}
.leaflet-control-attribution a{color:${colors.gold}}
.cap{transition:transform 2.8s linear}
.leaflet-zoom-anim .cap{transition:none}
.veh{width:100%;height:100%;transition:transform 1.2s ease;filter:drop-shadow(0 0 1.2px rgba(246,241,220,0.75)) drop-shadow(0 3px 3px rgba(0,0,0,0.6))}
.veh img{width:100%;height:100%;display:block;pointer-events:none;-webkit-user-drag:none}
.pick-wrap{position:relative;width:16px;height:16px}
.pulse{position:absolute;left:0;top:0;width:16px;height:16px;border-radius:50%;background:rgba(214,160,0,0.32);opacity:0;pointer-events:none}
body.searching .pulse{animation:ping 2.7s ease-out infinite}
body.searching .pulse.p2{animation-delay:0.9s}
body.searching .pulse.p3{animation-delay:1.8s}
@keyframes ping{0%{transform:scale(1);opacity:0.9}100%{transform:scale(15);opacity:0}}
body.locked .callout{pointer-events:none;cursor:default}
body.locked .callout .go{display:none}
body.searching .callout.drop{display:none}
body.nodrop .callout.drop,body.nodrop .pin-drop{display:none}
body.nopicklabel .callout.pickup{display:none}
body.live .cap{transition:transform 1s linear}
.callout .eta{color:${colors.gold};font-weight:700}
.pin-pick{position:relative;width:16px;height:16px;box-sizing:border-box;border-radius:8px;background:${colors.gold};border:3px solid ${colors.cream};box-shadow:0 0 0 7px rgba(214,160,0,0.25)}
.pin-drop{width:22px;height:22px;border-radius:50% 50% 50% 0;background:${colors.burgundy};border:2.5px solid ${colors.goldBright};transform:rotate(-45deg);box-shadow:0 3px 6px rgba(0,0,0,0.5)}
.pin-drop:after{content:"";position:absolute;left:6px;top:6px;width:6px;height:6px;border-radius:3px;background:${colors.cream}}
.callout{background:${colors.inkwell};color:${colors.cream};border:1px solid rgba(214,160,0,0.55);border-radius:10px;font:600 12px system-ui,-apple-system,sans-serif;padding:7px 10px;box-shadow:0 4px 12px rgba(0,0,0,0.45);cursor:pointer;display:flex;align-items:center;gap:8px}
.callout:before{display:none}
.callout .co{display:flex;align-items:center;gap:6px}
.callout .name{max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.callout .go{color:${colors.gold};font-size:15px;line-height:12px}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var icons = ${JSON.stringify(vehicleIcons)};
var sizes = ${JSON.stringify(iconSize)};
var map = L.map("map", { zoomControl: false }).setView([${center.latitude}, ${center.longitude}], 14);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
var pick, drop, glow, line, caps = {}, bounds = null, pad = { top: 90, bottom: 300 }, searching = false;
function notify(m) {
  var s = JSON.stringify(m);
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
  else if (window.parent !== window) window.parent.postMessage(s, "*");
}
function callout(text, which, eta) {
  var el = document.createElement("div");
  el.className = "co";
  if (eta) {
    var time = document.createElement("span");
    time.className = "eta";
    time.textContent = eta;
    el.appendChild(time);
  }
  var name = document.createElement("span");
  name.className = "name";
  name.textContent = text;
  var go = document.createElement("span");
  go.className = "go";
  go.textContent = "\\u203A";
  el.appendChild(name);
  el.appendChild(go);
  el.addEventListener("click", function (e) { e.stopPropagation(); notify({ type: "edit", which: which }); });
  return el;
}
function label(marker, text, which, offset, eta) {
  marker.unbindTooltip();
  marker.bindTooltip(callout(text, which, eta), { permanent: true, interactive: true, direction: "right", offset: offset, className: "callout " + which });
}
var refit = null;
function fit() {
  if (!bounds && !(searching && pick)) return;
  if (map._animatingZoom) {
    clearTimeout(refit);
    refit = setTimeout(fit, 300);
    return;
  }
  var height = map.getSize().y;
  var top = pad.top, bottom = pad.bottom;
  if (height - top - bottom < 90) {
    var squeeze = Math.max(0, top + bottom - (height - 90)) / Math.max(1, top + bottom);
    top = Math.round(top * (1 - squeeze));
    bottom = Math.round(bottom * (1 - squeeze));
  }
  if (searching && pick) {
    map.fitBounds(pick.getLatLng().toBounds(1700), { paddingTopLeft: [16, top], paddingBottomRight: [16, bottom], maxZoom: 16, animate: true });
    return;
  }
  map.fitBounds(bounds, { paddingTopLeft: [40, top], paddingBottomRight: [150, bottom], maxZoom: 16, animate: true });
}
window.update = function (d) {
  if (d.view) {
    searching = d.view.mode === "search";
    var cls = document.body.classList;
    cls.toggle("searching", searching);
    cls.toggle("live", d.view.mode === "live");
    cls.toggle("locked", d.view.mode !== "plan");
    cls.toggle("nodrop", !d.view.showDrop);
    cls.toggle("nopicklabel", !d.view.showPickupLabel);
  }
  if (d.pickup) {
    if (!pick) pick = L.marker(d.pickup, { icon: L.divIcon({ className: "", html: '<div class="pick-wrap"><span class="pulse"></span><span class="pulse p2"></span><span class="pulse p3"></span><div class="pin-pick"></div></div>', iconSize: [16, 16], iconAnchor: [8, 8] }), zIndexOffset: 1000 }).addTo(map);
    else pick.setLatLng(d.pickup);
  }
  if (d.drop) {
    if (!drop) drop = L.marker(d.drop, { icon: L.divIcon({ className: "", html: '<div class="pin-drop"></div>', iconSize: [22, 22], iconAnchor: [11, 28] }), zIndexOffset: 1000 }).addTo(map);
    else drop.setLatLng(d.drop);
  }
  if (d.labels) {
    if (pick) label(pick, d.labels.pickup, "pickup", [14, 0], d.labels.pickupEta);
    if (drop) label(drop, d.labels.drop, "drop", [14, -16], d.labels.dropEta);
  }
  if ("route" in d) {
    if (glow) map.removeLayer(glow);
    if (line) map.removeLayer(line);
    var path = d.route && d.route.length > 1 ? d.route : [d.pickup, d.drop];
    glow = L.polyline(path, { color: "${colors.gold}", weight: 11, opacity: 0.2 }).addTo(map);
    line = L.polyline(path, { color: "${colors.gold}", weight: 4.5, opacity: 1, dashArray: d.route ? null : "8 8" }).addTo(map);
    bounds = glow.getBounds();
  }
  if (d.remaining && d.remaining.length > 1 && line) line.setLatLngs(d.remaining);
  if (d.captains) {
    var keep = {};
    d.captains.forEach(function (c) {
      keep[c.id] = true;
      var old = caps[c.id];
      if (old && old.kind === c.kind) {
        old.marker.setLatLng(c.at);
        var el = old.marker.getElement();
        if (el && el.firstChild) el.firstChild.style.transform = "rotate(" + c.heading + "deg)";
        return;
      }
      if (old) map.removeLayer(old.marker);
      var s = sizes[c.kind];
      var icon = L.divIcon({ className: "cap", html: '<div class="veh" style="transform:rotate(' + c.heading + 'deg)"><img alt="" src="' + icons[c.kind] + '"/></div>', iconSize: [s, s], iconAnchor: [s / 2, s / 2] });
      caps[c.id] = { kind: c.kind, marker: L.marker(c.at, { icon: icon }).addTo(map) };
    });
    Object.keys(caps).forEach(function (id) { if (!keep[id]) { map.removeLayer(caps[id].marker); delete caps[id]; } });
  }
  if (d.fit) { pad = d.fit; fit(); }
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
