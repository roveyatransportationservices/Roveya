import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { api, live, loadSession } from "./backend";

const TASK = "roveya-seat-trip-location";
const KEY = "roveya-seat-tracking-trip";
let lastSent = 0;
let watcher: Location.LocationSubscription | null = null;

async function send(tripId: string, coords: Location.LocationObjectCoords) {
  const heading = coords.heading ?? 0;
  const speed = coords.speed && coords.speed > 0 ? coords.speed * 3.6 : 0;
  await api(`/seats/captain/trips/${tripId}/location`, {
    body: { latitude: coords.latitude, longitude: coords.longitude, heading: heading >= 0 && heading <= 360 ? heading : 0, speedKmh: Math.min(299, speed) },
  }).catch(() => undefined);
}

// Defined at import time so Android can keep running it with the app closed.
if (Platform.OS !== "web") {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
    const latest = data?.locations?.at(-1);
    if (error || !latest || Date.now() - lastSent < 8000) return;
    const tripId = await AsyncStorage.getItem(KEY);
    if (!tripId) return;
    lastSent = Date.now();
    await loadSession();
    await send(tripId, latest.coords);
  });
}

export type TrackingMode = "background" | "foreground" | "off";

// Shares the car's position with travellers, their families and the safety desk for this trip only.
export async function startTripTracking(tripId: string): Promise<TrackingMode> {
  if (!live) return "foreground";
  await AsyncStorage.setItem(KEY, tripId);
  const foreground = await Location.requestForegroundPermissionsAsync().catch(() => null);
  if (!foreground?.granted) return "off";
  if (Platform.OS !== "web") {
    const background = await Location.requestBackgroundPermissionsAsync().catch(() => null);
    if (background?.granted) {
      const running = await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false);
      if (!running) {
        await Location.startLocationUpdatesAsync(TASK, {
          accuracy: Location.Accuracy.High,
          timeInterval: 10000,
          distanceInterval: 25,
          deferredUpdatesInterval: 10000,
          pausesUpdatesAutomatically: false,
          activityType: Location.ActivityType.AutomotiveNavigation,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: "ROVEYA trip in progress",
            notificationBody: "Sharing the car's location with your travellers and the safety desk.",
            notificationColor: "#D6A000",
            killServiceOnDestroy: false,
          },
        });
      }
      return "background";
    }
  }
  watcher?.remove();
  watcher = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 25 }, (position) => {
    if (Date.now() - lastSent < 8000) return;
    lastSent = Date.now();
    void send(tripId, position.coords);
  });
  return "foreground";
}

export async function stopTripTracking() {
  await AsyncStorage.removeItem(KEY);
  watcher?.remove();
  watcher = null;
  if (Platform.OS === "web") return;
  const running = await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false);
  if (running) await Location.stopLocationUpdatesAsync(TASK).catch(() => undefined);
}

export async function trackingTrip() {
  return AsyncStorage.getItem(KEY);
}
