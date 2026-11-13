import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { api, live } from "./backend";

const APP = "rider";
let registered: string | null = null;

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

// Push is a nudge on top of polling and realtime, so a refusal never blocks the app.
export async function registerPush() {
  if (!live || Platform.OS === "web") return;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("rides", {
        name: "Ride updates",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
        vibrationPattern: [0, 250, 150, 250],
        lightColor: "#D6A000",
      });
      await Notifications.setNotificationChannelAsync("default", { name: "ROVEYA", importance: Notifications.AndroidImportance.DEFAULT });
    }
    const current = await Notifications.getPermissionsAsync();
    const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (token === registered) return;
    await api("/push/register", { body: { app: APP, token, platform: Platform.OS } });
    registered = token;
  } catch {
    registered = null;
  }
}

export async function forgetPush() {
  if (!registered) return;
  const token = registered;
  registered = null;
  await api("/push/register", { method: "DELETE", body: { token } }).catch(() => undefined);
}
