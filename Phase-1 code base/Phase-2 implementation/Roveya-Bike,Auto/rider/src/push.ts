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

// Push wakes the phone for a ride request; polling and realtime still run when the app is open.
export async function registerPush() {
  if (!live || Platform.OS === "web") return;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("offers", {
        name: "Ride requests",
        importance: Notifications.AndroidImportance.MAX,
        sound: "default",
        vibrationPattern: [0, 400, 200, 400, 200, 400],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        lightColor: "#D6A000",
      });
      await Notifications.setNotificationChannelAsync("default", { name: "ROVEYA Captain", importance: Notifications.AndroidImportance.DEFAULT });
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

export function onPushTap(handler: (data: Record<string, unknown>) => void) {
  if (Platform.OS === "web") return () => undefined;
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => handler((response.notification.request.content.data ?? {}) as Record<string, unknown>));
  return () => subscription.remove();
}
