import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, type } from "../theme";

export function TabPage({ kicker, title, right, children }: { kicker: string; title: string; right?: ReactNode; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.body, { paddingTop: Math.max(insets.top, 12) + 8 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>{kicker}</Text>
            <Text style={styles.title}>{title}</Text>
          </View>
          {right}
        </View>
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  body: { paddingHorizontal: 16, paddingBottom: 32 },
  head: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  kicker: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 10, letterSpacing: 2.4 },
  title: { marginTop: 4, color: colors.cream, fontFamily: type.display, fontSize: 26, lineHeight: 31, letterSpacing: -0.4 },
});
