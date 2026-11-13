import { StyleSheet, Text, View } from "react-native";
import { colors, type } from "../theme";

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.26,
        backgroundColor: colors.night,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1.2,
        borderColor: colors.gold,
      }}
    >
      <Text style={{ color: colors.mark, fontFamily: type.bold, fontSize: size * 0.46, fontWeight: "700", marginTop: -size * 0.08 }}>R</Text>
      <View style={{ position: "absolute", bottom: size * 0.16, width: size * 0.56, height: 1.5, borderRadius: 2, backgroundColor: colors.gold }} />
    </View>
  );
}

export function Wordmark({ kicker = "Captain", size = 18 }: { kicker?: string; size?: number }) {
  return (
    <View>
      <Text style={styles.word}>ROVEYA</Text>
      <Text style={[styles.kicker, { fontSize: size * 0.55 }]}>{kicker}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  word: { color: colors.cream, fontFamily: type.semibold, fontSize: 18, letterSpacing: 4 },
  kicker: { color: colors.gold, fontFamily: type.medium, letterSpacing: 1.2, marginTop: 3, textTransform: "uppercase" },
});
