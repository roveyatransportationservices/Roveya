import { Platform } from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { api, live, loadSession } from "./backend";

const TASK = "roveya-duty-location";
let lastSent = 0;

// Defined at import time so Android can run it after the app is closed.
if (Platform.OS !== "web") {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
    const latest = data?.locations?.at(-1);
    if (error || !latest || Date.now() - lastSent < 8000) return;
    lastSent = Date.now();
    await loadSession();
    const heading = latest.coords.heading ?? 0;
    await api("/captain/location", {
      body: { latitude: latest.coords.latitude, longitude: latest.coords.longitude, heading: heading >= 0 && heading <= 360 ? heading : 0 },
    }).catch(() => undefined);
  });
}

export type TrackingMode = "background" | "foreground" | "off";

export async function startDutyTracking(): Promise<TrackingMode> {
  if (!live || Platform.OS === "web") return "foreground";
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) return "off";
  const background = await Location.requestBackgroundPermissionsAsync().catch(() => null);
  if (!background?.granted) return "foreground";
  const running = await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false);
  if (!running) {
    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 10000,
      distanceInterval: 20,
      deferredUpdatesInterval: 10000,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.AutomotiveNavigation,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "ROVEYA Captain is on duty",
        notificationBody: "Sharing your location so nearby ride requests reach you.",
        notificationColor: "#D6A000",
        killServiceOnDestroy: false,
      },
    });
  }
  return "background";
}

export async function stopDutyTracking() {
  if (Platform.OS === "web") return;
  const running = await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false);
  if (running) await Location.stopLocationUpdatesAsync(TASK).catch(() => undefined);
}
