import { Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { api } from "./backend";
import type { DocKey } from "./types";

function askSource(): Promise<"camera" | "library" | null> {
  if (Platform.OS === "web") return Promise.resolve("library");
  return new Promise((resolve) => {
    Alert.alert("Add a clear photo", "All four corners in view, no glare.", [
      { text: "Take photo", onPress: () => resolve("camera") },
      { text: "Choose from gallery", onPress: () => resolve("library") },
      { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
    ]);
  });
}

// Returns a local photo of the document, or null if the captain backs out.
export async function pickDocumentPhoto(kind: DocKey): Promise<string | null> {
  const source = await askSource();
  if (!source) return null;
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    quality: 0.6,
    allowsEditing: kind === "selfie",
    aspect: kind === "selfie" ? [1, 1] : undefined,
    cameraType: kind === "selfie" ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
  };
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error("Allow camera access to photograph your document.");
    const result = await ImagePicker.launchCameraAsync(options);
    return result.canceled ? null : (result.assets[0]?.uri ?? null);
  }
  const result = await ImagePicker.launchImageLibraryAsync(options);
  return result.canceled ? null : (result.assets[0]?.uri ?? null);
}

// The photo goes straight to private storage on a one-time link; the server then checks it arrived.
export async function uploadDocument(kind: DocKey, uri: string) {
  const slot = await api<{ uploadUrl: string; path: string }>("/captain/documents", { body: { kind } });
  const form = new FormData();
  form.append("cacheControl", "3600");
  if (Platform.OS === "web") form.append("", await (await fetch(uri)).blob(), `${kind}.jpg`);
  else form.append("", { uri, name: `${kind}.jpg`, type: "image/jpeg" } as unknown as Blob);
  const response = await fetch(slot.uploadUrl, { method: "PUT", body: form, headers: { "x-upsert": "true" } }).catch(() => null);
  if (!response?.ok) throw new Error("The photo did not upload. Check your internet and try again.");
  await api("/captain/documents/confirm", { body: { kind, path: slot.path } });
}
