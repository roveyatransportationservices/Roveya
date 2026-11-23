import { createElement } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { colors } from "../theme";

export type Point = { latitude: number; longitude: number };

// OpenStreetMap's embed needs no key; the marker shows the car, the box frames it.
export function osmEmbed(center: Point, marker: boolean) {
  const pad = marker ? 0.03 : 0.6;
  const bbox = [center.longitude - pad, center.latitude - pad * 0.7, center.longitude + pad, center.latitude + pad * 0.7].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik${marker ? `&marker=${center.latitude},${center.longitude}` : ""}`;
}

export function MapFrame({ center, marker, height = 300 }: { center: Point; marker: boolean; height?: number }) {
  const uri = osmEmbed(center, marker);
  return (
    <View style={[styles.frame, { height }]}>
      {Platform.OS === "web"
        ? createElement("iframe", { src: uri, title: "Car location", style: { border: 0, width: "100%", height: "100%" } })
        : <WebView source={{ uri }} style={{ flex: 1, backgroundColor: colors.inkwell }} scrollEnabled={false} />}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell },
});
