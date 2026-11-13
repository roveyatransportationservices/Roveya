import { Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { DocKind, Glyph } from "./types";

export const DOCS: { kind: DocKind; title: string; line: string; icon: Glyph; group: "You" | "Car"; required: boolean }[] = [
  { kind: "dlFront", title: "Driving licence · front", line: "Transport or LMV licence, valid for 6+ months", icon: "mc:card-account-details-outline", group: "You", required: true },
  { kind: "dlBack", title: "Driving licence · back", line: "Vehicle classes and validity in view", icon: "mc:card-account-details-outline", group: "You", required: true },
  { kind: "aadhaar", title: "Aadhaar card", line: "Front side, number and photo clear", icon: "mc:card-account-details-star-outline", group: "You", required: true },
  { kind: "pan", title: "PAN card", line: "For payouts and tax records", icon: "mc:card-text-outline", group: "You", required: false },
  { kind: "selfie", title: "Your photo", line: "Face the camera in good light, no cap or sunglasses", icon: "mc:account-box-outline", group: "You", required: true },
  { kind: "rc", title: "Registration certificate (RC)", line: "Smart card or paper RC for this car", icon: "mc:file-document-outline", group: "Car", required: true },
  { kind: "insurance", title: "Insurance", line: "Commercial or comprehensive, valid today", icon: "mc:shield-car", group: "Car", required: true },
  { kind: "permit", title: "Tourist / contract permit", line: "All-India or state permit for paid trips", icon: "mc:file-certificate-outline", group: "Car", required: true },
  { kind: "fitness", title: "Fitness certificate", line: "Needed for commercial cars older than 2 years", icon: "mc:clipboard-check-outline", group: "Car", required: false },
  { kind: "carFront", title: "Car · front with number plate", line: "Whole car and plate in the photo", icon: "mc:car-side", group: "Car", required: true },
  { kind: "carBack", title: "Car · back", line: "Rear plate visible", icon: "mc:car-back", group: "Car", required: false },
  { kind: "carInside", title: "Car · inside", line: "Seats clean and visible, shown to travellers", icon: "mc:car-seat", group: "Car", required: true },
];

export const REQUIRED_DOCS = DOCS.filter((doc) => doc.required).map((doc) => doc.kind);

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
export async function pickPhoto(kind: DocKind): Promise<string | null> {
  const source = await askSource();
  if (!source) return null;
  const selfie = kind === "selfie";
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    quality: 0.6,
    allowsEditing: selfie,
    aspect: selfie ? [1, 1] : undefined,
    cameraType: selfie ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
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
