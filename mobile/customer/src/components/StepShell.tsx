import { useEffect, useRef, type ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Animated, BackHandler, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, type } from "../theme";

export type FlowIcon = keyof typeof Ionicons.glyphMap;
export type TrailItem = { step: number; icon: FlowIcon; label: string };

export const DESK_PHONE = "tel:+919000000001";

export function StepShell({
  kicker,
  steps,
  step,
  doneLabel,
  trail,
  onBack,
  onTrail,
  footer,
  children,
}: {
  kicker: string;
  steps: string[];
  step: number;
  doneLabel?: string | null;
  trail: TrailItem[];
  onBack: () => void;
  onTrail: (step: number) => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const enter = useRef(new Animated.Value(1)).current;
  const previous = useRef(step);
  const direction = useRef(1);
  const done = Boolean(doneLabel);
  const shownTrail = done ? [] : trail.filter((item) => item.step < step);

  useEffect(() => {
    direction.current = step >= previous.current ? 1 : -1;
    previous.current = step;
    scroll.current?.scrollTo({ y: 0, animated: false });
    enter.setValue(0);
    Animated.timing(enter, { toValue: 1, duration: 260, useNativeDriver: Platform.OS !== "web" }).start();
  }, [step, done]);

  const backRef = useRef(onBack);
  backRef.current = onBack;
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      backRef.current();
      return true;
    });
    return () => sub.remove();
  }, []);

  const slide = {
    opacity: enter,
    transform: [{ translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [22 * direction.current, 0] }) }],
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 6 }]}>
        <View style={styles.headRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={onBack} style={({ pressed }) => [styles.circle, pressed && { backgroundColor: colors.plum }]}>
            <Ionicons name="arrow-back" size={18} color={colors.cream} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>{kicker}</Text>
            <Text style={styles.headStep}>{doneLabel || `Step ${step + 1} of ${steps.length} · ${steps[step]}`}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Call the ROVEYA desk" hitSlop={10} onPress={() => void Linking.openURL(DESK_PHONE)} style={({ pressed }) => [styles.circle, pressed && { backgroundColor: colors.plum }]}>
            <Ionicons name="call-outline" size={17} color={colors.gold} />
          </Pressable>
        </View>
        {!done ? (
          <View style={styles.progress}>
            {steps.map((name, index) => (
              <View key={name} style={[styles.bar, index <= step && styles.barOn]} />
            ))}
          </View>
        ) : null}
        {shownTrail.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trail}>
            {shownTrail.map((item) => (
              <Pressable key={item.step} onPress={() => onTrail(item.step)} style={({ pressed }) => [styles.trailChip, pressed && { borderColor: colors.gold }]}>
                <Ionicons name={item.icon} size={12} color={colors.gold} />
                <Text style={styles.trailText} numberOfLines={1}>{item.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>

      <ScrollView ref={scroll} style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Animated.View style={slide}>{children}</Animated.View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 12 }]}>
        <LinearGradient colors={["rgba(18,6,13,0)", colors.night]} style={styles.footerFade} pointerEvents="none" />
        <View style={styles.footerRow}>{footer}</View>
      </View>
    </View>
  );
}

export function FlowCta({ label, icon = "arrow-forward", disabled, onPress }: { label: string; icon?: FlowIcon; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.cta, disabled && styles.ctaOff, pressed && !disabled && { opacity: 0.9 }]}>
      <Text style={[styles.ctaText, disabled && styles.ctaTextOff]}>{label}</Text>
      <Ionicons name={disabled ? "lock-closed" : icon} size={disabled ? 15 : 18} color={disabled ? colors.muted : colors.night} />
    </Pressable>
  );
}

export function FlowGhost({ label, icon, onPress }: { label: string; icon: FlowIcon; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.ghost, pressed && { borderColor: colors.gold }]}>
      <Ionicons name={icon} size={17} color={colors.gold} />
      <Text style={styles.ghostText}>{label}</Text>
    </Pressable>
  );
}

export function FlowSum({ value, sub }: { value: string; sub: string }) {
  return (
    <View style={styles.sum}>
      <Text style={styles.sumValue}>{value}</Text>
      <Text style={styles.sumSub}>{sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  header: { paddingHorizontal: 16, paddingBottom: 10, backgroundColor: colors.night, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  headRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  circle: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell, alignItems: "center", justifyContent: "center" },
  kicker: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 10, letterSpacing: 2.4 },
  headStep: { marginTop: 2, color: colors.cream, fontFamily: type.label, fontSize: 13.5 },
  progress: { flexDirection: "row", gap: 5, marginTop: 12 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "rgba(246,241,220,0.12)" },
  barOn: { backgroundColor: colors.gold },
  trail: { gap: 8, paddingTop: 10 },
  trailChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, maxWidth: 200 },
  trailText: { color: colors.cream, fontFamily: type.label, fontSize: 12, flexShrink: 1 },
  scroll: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 28 },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.night, borderTopWidth: 1, borderTopColor: colors.hairline },
  footerFade: { position: "absolute", left: 0, right: 0, top: -28, height: 28 },
  footerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  sum: { minWidth: 86 },
  sumValue: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 20, lineHeight: 24 },
  sumSub: { color: colors.faint, fontFamily: type.body, fontSize: 12 },
  cta: { flex: 1, minHeight: 54, borderRadius: 18, backgroundColor: colors.gold, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 18 },
  ctaText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 16, letterSpacing: 0.4 },
  ctaOff: { backgroundColor: colors.plum, borderWidth: 1, borderColor: "rgba(214,160,0,0.45)" },
  ctaTextOff: { color: colors.muted },
  ghost: { minHeight: 54, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18 },
  ghostText: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15 },
});
