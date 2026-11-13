import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { colors, type } from "../theme";

export function Splash({ onDone }: { onDone: () => void }) {
  const appear = useRef(new Animated.Value(0)).current;
  const rule = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const run = Animated.sequence([
      Animated.timing(appear, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(rule, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(900),
    ]);
    run.start(({ finished }) => {
      if (finished) onDone();
    });
    return () => run.stop();
  }, [appear, rule, onDone]);

  const lift = appear.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <Animated.View style={[styles.center, { opacity: appear, transform: [{ translateY: lift }] }]}>
        <View style={styles.mark}>
          <Text style={styles.letter}>R</Text>
          <View style={styles.markLine} />
        </View>
        <Text style={styles.word}>ROVEYA</Text>
        <Animated.View style={[styles.rule, { transform: [{ scaleX: rule }] }]} />
        <Animated.Text style={[styles.tag, { opacity: rule }]}>CAPTAIN</Animated.Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night, alignItems: "center", justifyContent: "center" },
  center: { alignItems: "center" },
  mark: {
    width: 84,
    height: 84,
    borderRadius: 22,
    borderWidth: 1.4,
    borderColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  letter: { color: colors.cream, fontFamily: type.bold, fontSize: 40, fontWeight: "700", marginTop: -8 },
  markLine: { position: "absolute", bottom: 15, width: 46, height: 2, borderRadius: 2, backgroundColor: colors.gold },
  word: { marginTop: 26, color: colors.cream, fontFamily: type.semibold, fontSize: 30, fontWeight: "600", letterSpacing: 10, paddingLeft: 10 },
  rule: { marginTop: 14, width: 56, height: 1.5, backgroundColor: colors.gold },
  tag: { marginTop: 12, color: colors.gold, fontFamily: type.medium, fontSize: 11, letterSpacing: 2.4 },
});
