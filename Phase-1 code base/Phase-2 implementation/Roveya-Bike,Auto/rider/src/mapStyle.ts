import { PixelRatio, Platform } from "react-native";
import Constants from "expo-constants";
import { PROVIDER_DEFAULT, PROVIDER_GOOGLE } from "react-native-maps";

// Google Maps on Android (free in the Maps SDK), Apple Maps on iOS.
export const mapProvider = Platform.OS === "android" ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;

// An Android build without a Maps key falls back to the in-app web map instead of a blank screen.
export const nativeMap = Platform.OS === "ios" || Boolean(Constants.expoConfig?.android?.config?.googleMaps?.apiKey);

// Android measures map padding in pixels, iOS in points.
export const px = (value: number) => (Platform.OS === "android" ? Math.round(value * PixelRatio.get()) : value);

export const nightStyle = [
  { elementType: "geometry", stylers: [{ color: "#1a0e14" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#a89c8a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#12060d" }] },
  { featureType: "poi", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1c1712" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2e1a24" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#3a2230" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#4c2a3a" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8f8270" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0b0a14" }] },
  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#1f1118" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#3b2430" }] },
];
