import { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Animated, PanResponder, StyleSheet, Text, View } from "react-native";
import { colors, type } from "../theme";
import type { FlowIcon } from "./StepShell";

const KNOB = 50;
const PAD = 4;

export function SwipeButton({ label, icon = "chevron-forward", tone = "gold", disabled, onDone }: { label: string; icon?: FlowIcon; tone?: "gold" | "burgundy"; disabled?: boolean; onDone: () => void }) {
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const max = Math.max(1, width - KNOB - PAD * 2);
  const maxRef = useRef(max);
  maxRef.current = max;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const offRef = useRef(disabled);
  offRef.current = disabled;

  useEffect(() => {
    x.setValue(0);
  }, [label]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !offRef.current,
      onMoveShouldSetPanResponder: (_, g) => !offRef.current && Math.abs(g.dx) > 4,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => x.setValue(Math.max(0, Math.min(maxRef.current, g.dx))),
      onPanResponderRelease: (_, g) => {
        if (g.dx > maxRef.current * 0.72) {
          Animated.timing(x, { toValue: maxRef.current, duration: 120, useNativeDriver: false }).start(() => {
            doneRef.current();
            setTimeout(() => x.setValue(0), 400);
          });
        } else Animated.spring(x, { toValue: 0, useNativeDriver: false, bounciness: 6 }).start();
      },
      onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: false }).start(),
    }),
  ).current;

  const gold = tone === "gold";
  const fill = x.interpolate({ inputRange: [0, max], outputRange: [KNOB + PAD * 2, width || KNOB], extrapolate: "clamp" });
  const fade = x.interpolate({ inputRange: [0, max * 0.6], outputRange: [1, 0], extrapolate: "clamp" });

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityActions={[{ name: "activate" }]}
      onAccessibilityAction={() => !disabled && onDone()}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.track, gold ? styles.trackGold : styles.trackBurgundy, disabled && { opacity: 0.45 }]}
    >
      <Animated.View style={[styles.fill, { width: fill, backgroundColor: gold ? "rgba(18,6,13,0.14)" : "rgba(214,160,0,0.18)" }]} />
      <Animated.Text style={[styles.label, { color: gold ? colors.night : colors.cream, opacity: fade }]} numberOfLines={1}>
        {label}
      </Animated.Text>
      <View style={styles.chev} pointerEvents="none">
        <Ionicons name="chevron-forward" size={14} color={gold ? "rgba(18,6,13,0.35)" : "rgba(246,241,220,0.3)"} />
        <Ionicons name="chevron-forward" size={14} color={gold ? "rgba(18,6,13,0.55)" : "rgba(246,241,220,0.5)"} />
      </View>
      <Animated.View {...pan.panHandlers} style={[styles.knob, gold ? styles.knobGold : styles.knobBurgundy, { transform: [{ translateX: x }] }]}>
        <Ionicons name={icon} size={22} color={gold ? colors.gold : colors.night} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: KNOB + PAD * 2, borderRadius: (KNOB + PAD * 2) / 2, justifyContent: "center", overflow: "hidden" },
  trackGold: { backgroundColor: colors.gold },
  trackBurgundy: { backgroundColor: colors.burgundy, borderWidth: 1, borderColor: colors.line },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: (KNOB + PAD * 2) / 2 },
  label: { position: "absolute", left: KNOB + 18, right: 44, textAlign: "center", fontFamily: type.labelStrong, fontSize: 16, letterSpacing: 0.3 },
  chev: { position: "absolute", right: 16, flexDirection: "row" },
  knob: { position: "absolute", left: PAD, width: KNOB, height: KNOB, borderRadius: KNOB / 2, alignItems: "center", justifyContent: "center" },
  knobGold: { backgroundColor: colors.night },
  knobBurgundy: { backgroundColor: colors.gold },
});
