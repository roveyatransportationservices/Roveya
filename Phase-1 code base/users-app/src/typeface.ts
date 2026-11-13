import { Dimensions, Platform, StyleSheet, type TextStyle } from "react-native";
import { PHONE_MAX_WIDTH } from "./layout";
import { type } from "./theme";

const original = StyleSheet.create.bind(StyleSheet);

const screenWidth = Math.min(Dimensions.get("window").width || 390, PHONE_MAX_WIDTH);
// Authored sizes are tuned for a 390pt phone; the 0.92 keeps text at AbhiBus-like density.
export const textScale = Math.min(0.96, Math.max(0.84, (screenWidth / 390) * 0.92));

function scaled(value: number) {
  return Math.round(value * textScale * 2) / 2;
}

function family(weight?: TextStyle["fontWeight"]) {
  const value = String(weight ?? "400");
  if (value === "700" || value === "bold" || value === "800" || value === "900") return type.bold;
  if (value === "600") return type.semibold;
  if (value === "500" || value === "medium") return type.medium;
  return type.regular;
}

StyleSheet.create = ((styles: StyleSheet.NamedStyles<Record<string, unknown>>) => {
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(styles)) {
    const value = styles[key];
    if (value && typeof value === "object" && ("fontSize" in value || "fontWeight" in value || "letterSpacing" in value)) {
      const text = value as TextStyle;
      const fontSize = scaled(typeof text.fontSize === "number" ? text.fontSize : 16);
      const authored = typeof text.lineHeight === "number" ? scaled(text.lineHeight) : undefined;
      const lineHeight = authored ?? Math.round(fontSize * 1.2);
      next[key] = {
        ...text,
        ...(typeof text.fontSize === "number" ? { fontSize } : null),
        fontFamily: text.fontFamily ?? family(text.fontWeight),
        fontWeight: "400",
        lineHeight,
        overflow: text.overflow ?? "visible",
      };
    } else {
      next[key] = value;
    }
  }
  return original(next as never);
}) as typeof StyleSheet.create;

if (Platform.OS === "web" && typeof document !== "undefined") {
  const fullHeight = typeof CSS !== "undefined" && CSS.supports("height", "100dvh") ? "100dvh" : "100%";
  document.documentElement.style.height = fullHeight;
  document.body.style.height = fullHeight;
  document.body.style.margin = "0";
  document.body.style.overflow = "hidden";
  document.body.style.background = "#12060D";
  const root = document.getElementById("root");
  if (root) {
    root.style.height = fullHeight;
    root.style.overflow = "hidden";
  }
  const cursor = document.createElement("style");
  cursor.textContent = "*{scrollbar-width:none;-ms-overflow-style:none}*::-webkit-scrollbar{display:none;width:0;height:0}body{user-select:none;-webkit-user-select:none}input,textarea{user-select:text;-webkit-user-select:text;caret-color:#D6A000;outline:none!important;box-shadow:none!important}[role=button],[role=tab]{cursor:pointer}";
  document.head.appendChild(cursor);
}
