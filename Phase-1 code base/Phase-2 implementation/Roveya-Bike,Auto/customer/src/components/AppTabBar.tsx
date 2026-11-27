import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, type } from "../theme";

export type AppTab = "Home" | "Pool" | "Parcel" | "Account";

const items: { key: AppTab; label: string; icon: keyof typeof Ionicons.glyphMap; iconOn: keyof typeof Ionicons.glyphMap }[] = [
  { key: "Home", label: "Ride", icon: "home-outline", iconOn: "home" },
  { key: "Pool", label: "Pool", icon: "people-outline", iconOn: "people" },
  { key: "Parcel", label: "Parcel", icon: "cube-outline", iconOn: "cube" },
  { key: "Account", label: "Profile", icon: "person-outline", iconOn: "person" },
];

function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setOpen(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}

export function AppTabBar({ active, onPress }: { active: AppTab; onPress: (tab: AppTab) => void }) {
  const insets = useSafeAreaInsets();
  const keyboardOpen = useKeyboardOpen();
  if (keyboardOpen) return null;
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.bar}>
        {items.map((item) => {
          const on = item.key === active;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={item.label}
              onPress={() => onPress(item.key)}
              style={styles.item}
            >
              <View style={[styles.pill, on && styles.pillOn]}>
                <Ionicons name={on ? item.iconOn : item.icon} size={19} color={on ? colors.cream : colors.faint} />
              </View>
              <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 6, backgroundColor: colors.night },
  bar: {
    flexDirection: "row",
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.inkwell,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 4,
    shadowColor: "#000000",
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 14,
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  pill: { width: 40, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  pillOn: { backgroundColor: colors.burgundy },
  label: { color: colors.faint, fontFamily: type.medium, fontSize: 10.5 },
  labelOn: { color: colors.gold, fontFamily: type.semibold },
});
