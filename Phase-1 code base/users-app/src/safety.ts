import { Linking } from "react-native";
import * as Location from "expo-location";
import { api, live } from "./backend";

const APP = "rider";
export const SAFETY_DESK = "+919949856781";

export type SosState = {
  incident: { id: string; code: string; status: "open" | "acknowledged" | "resolved" | "false_alarm"; contactsNotified: number; contactsTotal: number; acknowledgedAt: string | null; createdAt: string };
  shareUrl: string | null;
  deskPhone: string;
  agent?: string | null;
};

async function hereNow() {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return null;
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
    ]);
    return position ? { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy ?? undefined } : null;
  } catch {
    return null;
  }
}

let previewIncident: SosState | null = null;

// Sends the alert even without a GPS fix; the server falls back to the car's last position.
export async function raiseSos(context: { tripId?: string; bookingId?: string }): Promise<SosState> {
  const where = await hereNow();
  if (!live) {
    await new Promise((resolve) => setTimeout(resolve, 900));
    previewIncident = { incident: { id: "preview", code: "SOS-1001", status: "open", contactsNotified: 1, contactsTotal: 1, acknowledgedAt: null, createdAt: new Date().toISOString() }, shareUrl: null, deskPhone: SAFETY_DESK };
    setTimeout(() => {
      if (previewIncident) previewIncident = { ...previewIncident, incident: { ...previewIncident.incident, status: "acknowledged", acknowledgedAt: new Date().toISOString() }, agent: "Priya" };
    }, 8000);
    return previewIncident;
  }
  return api<SosState>(`/safety/sos?app=${APP}`, { body: { ...context, ...(where ?? {}) } });
}

export async function sosStatus(id: string): Promise<SosState> {
  if (!live) return previewIncident!;
  return api<SosState>(`/safety/sos/${id}?app=${APP}`);
}

export async function markSafe(id: string): Promise<SosState> {
  if (!live) return previewIncident!;
  return api<SosState>(`/safety/sos/${id}?app=${APP}`, { method: "POST" });
}

export const call = (number: string) => void Linking.openURL(`tel:${number.replace(/\s/g, "")}`);

export type CallResult = { mode: "bridged" | "desk" | "direct"; message: string; deskPhone?: string; phone?: string };

// Calls go through the ROVEYA number so neither side sees the other's mobile.
export async function connectCall(_bookingId: string): Promise<CallResult> {
  return { mode: "desk", deskPhone: SAFETY_DESK, message: "Call the ROVEYA desk. Private call connecting is off until launch." };
}

export async function deskCallback(): Promise<CallResult> {
  return { mode: "desk", deskPhone: SAFETY_DESK, message: "Call the ROVEYA desk." };
}

export function finishCall(result: CallResult) {
  if (result.mode === "direct" && result.phone) call(`+91${result.phone}`);
  else if (result.mode === "desk") call(result.deskPhone ?? SAFETY_DESK);
  return result.message;
}
