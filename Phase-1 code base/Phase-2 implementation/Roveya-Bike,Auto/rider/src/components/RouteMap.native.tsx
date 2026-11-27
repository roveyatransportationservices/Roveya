import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Circle, Marker, Polyline } from "react-native-maps";
import { mapProvider, nativeMap, nightStyle, px } from "../mapStyle";
import { LeafletRouteMap } from "./RouteMapLeaflet";
import { colors } from "../theme";
import { vehicleIcons } from "../vehicleIcons";


export type CaptainPin = { id: string; kind: "bike" | "auto" | "cab"; latitude: number; longitude: number; heading: number };
type Point = { latitude: number; longitude: number };
type Edit = "pickup" | "drop";

const iconSize = { bike: 54, auto: 42, cab: 52 };
const LABEL_WIDTH = 230;

export function RouteMap(props: Parameters<typeof LeafletRouteMap>[0]) {
  return nativeMap ? <GoogleRouteMap {...props} /> : <LeafletRouteMap {...props} />;
}

const toPoints = (coords: [number, number][]) => coords.map(([longitude, latitude]) => ({ latitude, longitude }));

function GoogleRouteMap({
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
  const map = useRef<MapView>(null);
  const path = useMemo(() => (route && route.length > 1 ? toPoints(route) : [pickup, drop]), [route, pickup.latitude, pickup.longitude, drop.latitude, drop.longitude]);
  const left = useMemo(() => (remaining && remaining.length > 1 ? toPoints(remaining) : null), [remaining]);
  const editable = mode === "plan";
  const [follow, setFollow] = useState(true);

  useEffect(() => {
    setFollow(true);
  }, [recenter]);

  const me = captains[0];

  const fit = () => {
    const view = map.current;
    if (!view || !follow) return;
    // Live navigation: follow the captain pin. Manual pan/zoom only pauses camera follow.
    if (mode === "live" && me) {
      view.animateCamera({ center: { latitude: me.latitude, longitude: me.longitude }, zoom: 15.2 }, { duration: 450 });
      return;
    }
    if (mode === "search" || !showDrop) {
      view.animateCamera({ center: pickup, zoom: 15.5 }, { duration: 600 });
      return;
    }
    view.fitToCoordinates(path, { edgePadding: { top: px(padTop), right: px(70), bottom: px(padBottom), left: px(40) }, animated: true });
  };

  useEffect(() => {
    const timer = setTimeout(fit, 250);
    return () => clearTimeout(timer);
  }, [path, padTop, padBottom, recenter, mode, showDrop, follow, me?.latitude, me?.longitude]);

  return (
    <View style={styles.fill}>
      <MapView
        ref={map}
        provider={mapProvider}
        style={StyleSheet.absoluteFill}
        customMapStyle={nightStyle}
        userInterfaceStyle="dark"
        initialRegion={{ ...pickup, latitudeDelta: 0.03, longitudeDelta: 0.03 }}
        onMapReady={fit}
        onPanDrag={() => setFollow(false)}
        showsCompass={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
      >
        {mode === "search" ? <Circle center={pickup} radius={450} strokeColor="rgba(214,160,0,0.45)" fillColor="rgba(214,160,0,0.14)" /> : null}
        {showDrop ? <Polyline coordinates={path} strokeColor="rgba(214,160,0,0.22)" strokeWidth={10} /> : null}
        {showDrop ? <Polyline coordinates={left ?? path} strokeColor={colors.gold} strokeWidth={4.5} lineDashPattern={route ? undefined : [8, 8]} /> : null}
        {captains.map((pin) => (
          <CaptainMarker key={pin.id} pin={pin} />
        ))}
        <Marker coordinate={pickup} anchor={{ x: 8 / LABEL_WIDTH, y: 0.5 }} zIndex={10} onPress={() => editable && onEdit("pickup")}>
          <Label kind="pickup" text={pickupLabel} eta={pickupEta} show={showPickupLabel && mode !== "search"} editable={editable} />
        </Marker>
        {showDrop ? (
          <Marker coordinate={drop} anchor={{ x: 11 / LABEL_WIDTH, y: 0.5 }} zIndex={10} onPress={() => editable && onEdit("drop")}>
            <Label kind="drop" text={dropLabel} eta={dropEta} show={mode !== "search"} editable={editable} />
          </Marker>
        ) : null}
      </MapView>
    </View>
  );
}

function Label({ kind, text, eta, show, editable }: { kind: Edit; text: string; eta?: string; show: boolean; editable: boolean }) {
  return (
    <View style={styles.labelRow} pointerEvents={editable ? "auto" : "none"}>
      {kind === "pickup" ? <View style={styles.pick} /> : <View style={styles.drop}><View style={styles.dropDot} /></View>}
      {show ? (
        <Pressable style={styles.callout} disabled={!editable}>
          {eta ? <Text style={styles.eta}>{eta}</Text> : null}
          <Text style={styles.name} numberOfLines={1}>{text}</Text>
          {editable ? <Text style={styles.go}>›</Text> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

// Custom marker views must redraw until the vehicle image has loaded, then stop for speed.
// Heading is smoothed across the 0/360 wrap; tracksViewChanges stays off after the first paint
// so coordinate updates do not remount or re-spin the image.
function CaptainMarker({ pin }: { pin: CaptainPin }) {
  const [tracking, setTracking] = useState(true);
  const [facing, setFacing] = useState(() => ((pin.heading % 360) + 360) % 360);
  const lastAt = useRef({ latitude: pin.latitude, longitude: pin.longitude });
  useEffect(() => {
    setTracking(true);
    const timer = setTimeout(() => setTracking(false), 900);
    return () => clearTimeout(timer);
  }, [pin.kind]);
  useEffect(() => {
    const next = ((pin.heading % 360) + 360) % 360;
    const moved =
      Math.abs(pin.latitude - lastAt.current.latitude) + Math.abs(pin.longitude - lastAt.current.longitude) > 0.00004;
    lastAt.current = { latitude: pin.latitude, longitude: pin.longitude };
    setFacing((prev) => {
      const delta = ((next - prev + 540) % 360) - 180;
      if (!moved && Math.abs(delta) <= 8) return prev;
      return (prev + delta * (moved ? 0.4 : 0.2) + 360) % 360;
    });
  }, [pin.latitude, pin.longitude, pin.heading]);
  const size = iconSize[pin.kind];
  return (
    <Marker
      coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      rotation={facing}
      flat
      tracksViewChanges={tracking}
    >
      <Image source={{ uri: vehicleIcons[pin.kind] }} style={{ width: size, height: size }} />
    </Marker>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.night },
  labelRow: { width: LABEL_WIDTH, flexDirection: "row", alignItems: "center", gap: 8 },
  pick: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.gold, borderWidth: 3, borderColor: colors.cream },
  drop: { width: 22, height: 22, borderRadius: 11, borderTopLeftRadius: 2, backgroundColor: colors.burgundy, borderWidth: 2.5, borderColor: colors.goldBright, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-45deg" }] },
  dropDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.cream },
  callout: { flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: "rgba(214,160,0,0.55)" },
  eta: { color: colors.gold, fontWeight: "700", fontSize: 12 },
  name: { flexShrink: 1, color: colors.cream, fontWeight: "600", fontSize: 12 },
  go: { color: colors.gold, fontSize: 15, lineHeight: 15 },
});
