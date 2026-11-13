import { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import MapView, { Circle, Marker, Polyline } from "react-native-maps";
import { demandZones } from "../data";
import { mapProvider, nativeMap, nightStyle, px } from "../mapStyle";
import { LeafletDutyMap } from "./DutyMapLeaflet";
import { colors } from "../theme";
import { vehicleIcons } from "../vehicleIcons";
import type { VehicleKind } from "../types";

type Point = { latitude: number; longitude: number };

export function DutyMap(props: Parameters<typeof LeafletDutyMap>[0]) {
  return nativeMap ? <GoogleDutyMap {...props} /> : <LeafletDutyMap {...props} />;
}

const iconSize = { bike: 54, auto: 42, cab: 52 };

function GoogleDutyMap({ me, kind, online, target, padBottom, recenter }: { me: Point; kind: VehicleKind; online: boolean; target: Point | null; padBottom: number; recenter: number }) {
  const map = useRef<MapView>(null);
  const [tracking, setTracking] = useState(true);

  useEffect(() => {
    setTracking(true);
    const timer = setTimeout(() => setTracking(false), 1200);
    return () => clearTimeout(timer);
  }, [kind, online]);

  const frame = () => {
    const view = map.current;
    if (!view) return;
    if (target) {
      view.fitToCoordinates([me, target], { edgePadding: { top: px(110), right: px(60), bottom: px(padBottom + 30), left: px(60) }, animated: true });
      return;
    }
    view.animateCamera({ center: me, zoom: 14.5 }, { duration: 600 });
  };

  useEffect(() => {
    const timer = setTimeout(frame, 200);
    return () => clearTimeout(timer);
  }, [me.latitude, me.longitude, target?.latitude, target?.longitude, padBottom, recenter]);

  const size = iconSize[kind];
  return (
    <View style={styles.fill}>
      <MapView
        ref={map}
        provider={mapProvider}
        style={StyleSheet.absoluteFill}
        customMapStyle={nightStyle}
        userInterfaceStyle="dark"
        initialRegion={{ ...me, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
        mapPadding={target ? undefined : { top: 0, right: 0, bottom: px(Math.max(0, padBottom - 90)), left: 0 }}
        onMapReady={frame}
        showsCompass={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
      >
        {online
          ? demandZones.map((zone) => (
              <Circle
                key={zone.name}
                center={zone}
                radius={zone.radius}
                strokeColor={zone.level === "High" ? "rgba(214,160,0,0.7)" : "rgba(214,160,0,0.4)"}
                strokeWidth={1}
                fillColor={zone.level === "High" ? "rgba(214,160,0,0.22)" : "rgba(240,200,90,0.12)"}
              />
            ))
          : null}
        {online
          ? demandZones.map((zone) => (
              <Marker key={`label-${zone.name}`} coordinate={zone} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                <View style={styles.zone}>
                  <Text style={styles.zoneText}>
                    <Text style={{ color: colors.gold }}>{zone.level}</Text> · {zone.name}
                  </Text>
                </View>
              </Marker>
            ))
          : null}
        {online ? <Circle center={me} radius={140} strokeColor="rgba(214,160,0,0.5)" fillColor="rgba(214,160,0,0.18)" /> : null}
        {target ? <Polyline coordinates={[me, target]} strokeColor={colors.gold} strokeWidth={3} lineDashPattern={[6, 7]} /> : null}
        {target ? (
          <Marker coordinate={target} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.pin} />
          </Marker>
        ) : null}
        <Marker coordinate={me} anchor={{ x: 0.5, y: 0.5 }} zIndex={20} tracksViewChanges={tracking}>
          <Image source={{ uri: vehicleIcons[kind] }} style={{ width: size, height: size, opacity: online ? 1 : 0.7 }} />
        </Marker>
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.night },
  zone: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: "rgba(214,160,0,0.55)" },
  zoneText: { color: colors.cream, fontWeight: "600", fontSize: 11 },
  pin: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.gold, borderWidth: 3, borderColor: colors.cream },
});
