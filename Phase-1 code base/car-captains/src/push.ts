import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { api, live } from "./backend";

const APP = "captain";
let registered: string | null = null;

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

// New bookings and settlements arrive as push; the app also listens in realtime, so a refusal never blocks it.
export async function registerPush() {
  if (!live || Platform.OS === "web") return;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("rides", {
        name: "Bookings and trips",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
        vibrationPattern: [0, 250, 150, 250],
        lightColor: "#D6A000",
      });
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
