import type { ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DESK_PHONE, type FlowIcon } from "./StepShell";
import { colors, type } from "../theme";

export function PageShell({
  kicker,
  title,
  onBack,
  right,
  footer,
  children,
}: {
  kicker: string;
  title: string;
  onBack: () => void;
  right?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 6 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={onBack} style={({ pressed }) => [styles.circle, pressed && { backgroundColor: colors.plum }]}>
          <Ionicons name="arrow-back" size={18} color={colors.cream} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.kicker}>{kicker}</Text>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
        </View>
        {right ?? <HeadButton icon="call-outline" label="Call the ROVEYA desk" onPress={() => void Linking.openURL(DESK_PHONE)} />}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? (
        <View style={styles.footer}>
          <LinearGradient colors={["rgba(18,6,13,0)", colors.night]} style={styles.footerFade} pointerEvents="none" />
          <View style={styles.footerRow}>{footer}</View>
        </View>
      ) : null}
    </View>
  );
}

export function HeadButton({ icon, label, onPress }: { icon: FlowIcon; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={10} onPress={onPress} style={({ pressed }) => [styles.circle, pressed && { backgroundColor: colors.plum }]}>
      <Ionicons name={icon} size={17} color={colors.gold} />
    </Pressable>
  );
}

export function SectionTitle({ children, first }: { children: string; first?: boolean }) {
  return <Text style={[styles.section, first && { marginTop: 0 }]}>{children}</Text>;
}

export function Group({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.group, style]}>{children}</View>;
}

export function ListRow({
  icon,
  label,
  sub,
  right,
  last,
  chevron = true,
  onPress,
}: {
  icon: FlowIcon;
  label: string;
  sub?: string;
  right?: ReactNode;
  last?: boolean;
  chevron?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.row, !last && styles.rowLine, pressed && { backgroundColor: colors.mist }]}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={17} color={colors.gold} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {right}
      {onPress && chevron ? <Ionicons name="chevron-forward" size={16} color={colors.faint} /> : null}
    </Pressable>
  );
}

export function Toggle({ on, locked, onChange, label }: { on: boolean; locked?: boolean; onChange?: (next: boolean) => void; label: string }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on, disabled: locked }}
      disabled={locked}
      hitSlop={8}
      onPress={() => onChange?.(!on)}
      style={[styles.toggle, on && styles.toggleOn, locked && { opacity: 0.6 }]}
    >
      <View style={[styles.knob, on && styles.knobOn]}>{locked ? <Ionicons name="lock-closed" size={9} color={colors.gold} /> : null}</View>
    </Pressable>
  );
}

export function Chips<T extends string>({ items, value, onChange }: { items: { key: T; label: string }[]; value: T; onChange: (key: T) => void }) {
  return (
    <View style={styles.chips}>
      {items.map((item) => {
        const on = item.key === value;
        return (
          <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(item.key)} style={[styles.chip, on && styles.chipOn]}>
            <Text style={[styles.chipText, on && { color: colors.night }]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Pill({ label, tone = "gold" }: { label: string; tone?: "gold" | "muted" | "solid" }) {
  return (
    <View style={[styles.pill, tone === "muted" && styles.pillMuted, tone === "solid" && styles.pillSolid]}>
      <Text style={[styles.pillText, tone === "muted" && { color: colors.muted }, tone === "solid" && { color: colors.night }]}>{label}</Text>
    </View>
  );
}

export function Empty({ icon, title, line, action, onAction }: { icon: FlowIcon; title: string; line: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyRing}>
        <View style={styles.emptyDisc}>
          <Ionicons name={icon} size={28} color={colors.gold} />
        </View>
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyLine}>{line}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} style={({ pressed }) => [styles.emptyCta, pressed && { opacity: 0.9 }]}>
          <Text style={styles.emptyCtaText}>{action}</Text>
          <Ionicons name="arrow-forward" size={15} color={colors.night} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, strong && styles.lineStrong]}>{label}</Text>
      <Text style={[styles.lineValue, strong && styles.lineStrong]}>{value}</Text>
    </View>
  );
}

export function RoutePair({ from, to, fromSub, toSub }: { from: string; to: string; fromSub?: string; toSub?: string }) {
  return (
    <View style={styles.route}>
      <View style={styles.rail}>
        <View style={styles.dotFrom} />
        <View style={styles.railLine} />
        <View style={styles.dotTo} />
      </View>
      <View style={{ flex: 1, gap: 14 }}>
        <View>
          <Text style={styles.routeName} numberOfLines={1}>{from}</Text>
          {fromSub ? <Text style={styles.routeSub} numberOfLines={1}>{fromSub}</Text> : null}
        </View>
        <View>
          <Text style={styles.routeName} numberOfLines={1}>{to}</Text>
          {toSub ? <Text style={styles.routeSub} numberOfLines={1}>{toSub}</Text> : null}
        </View>
      </View>
    </View>
  );
}

export function Stars({ value, size = 13 }: { value: number; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons key={n} name={n <= value ? "star" : "star-outline"} size={size} color={n <= value ? colors.gold : colors.faint} />
      ))}
    </View>
  );
}

export const page = StyleSheet.create({
  card: { borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, padding: 16 },
  heroCard: { borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 18, overflow: "hidden" },
  kicker: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 10, letterSpacing: 2.4 },
  title: { color: colors.cream, fontFamily: type.display, fontSize: 22, lineHeight: 27, letterSpacing: -0.3 },
  big: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 34, lineHeight: 40 },
  lead: { color: colors.muted, fontFamily: type.body, fontSize: 13.5, lineHeight: 20 },
  small: { color: colors.faint, fontFamily: type.body, fontSize: 12.5, lineHeight: 18 },
  name: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15 },
  gold: { color: colors.gold, fontFamily: type.labelStrong },
  rule: { height: 1, backgroundColor: colors.hairline, marginVertical: 12 },
  input: { height: 52, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, paddingHorizontal: 14, color: colors.cream, fontFamily: type.label, fontSize: 15 },
  inputFocus: { borderColor: colors.gold },
  label: { marginBottom: 6, color: colors.muted, fontFamily: type.label, fontSize: 12.5 },
  note: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, padding: 12, borderRadius: 16, backgroundColor: "rgba(214,160,0,0.08)", borderWidth: 1, borderColor: colors.line },
  noteText: { flex: 1, color: colors.muted, fontFamily: type.body, fontSize: 12.5, lineHeight: 18 },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  action: { flex: 1, minHeight: 46, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 10 },
  actionText: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 13.5 },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  circle: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell, alignItems: "center", justifyContent: "center" },
  kicker: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 10, letterSpacing: 2.4 },
  title: { marginTop: 1, color: colors.cream, fontFamily: type.display, fontSize: 19, lineHeight: 24, letterSpacing: -0.3 },
  body: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 32 },
  footer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, backgroundColor: colors.night, borderTopWidth: 1, borderTopColor: colors.hairline },
  footerFade: { position: "absolute", left: 0, right: 0, top: -28, height: 28 },
  footerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  section: { marginTop: 24, marginBottom: 10, color: colors.gold, fontFamily: type.labelStrong, fontSize: 10, letterSpacing: 2.4 },
  group: { borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 14 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  rowLabel: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15 },
  rowSub: { marginTop: 2, color: colors.faint, fontFamily: type.body, fontSize: 12.5, lineHeight: 17 },
  toggle: { width: 46, height: 28, borderRadius: 14, padding: 3, backgroundColor: colors.night, borderWidth: 1, borderColor: "rgba(246,241,220,0.2)", justifyContent: "center" },
  toggleOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.faint, alignItems: "center", justifyContent: "center" },
  knobOn: { alignSelf: "flex-end", backgroundColor: colors.night },
  chips: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  chipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipText: { color: colors.cream, fontFamily: type.label, fontSize: 13 },
  pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, backgroundColor: "rgba(214,160,0,0.14)", borderWidth: 1, borderColor: colors.line },
  pillMuted: { backgroundColor: "rgba(246,241,220,0.06)", borderColor: colors.hairline },
  pillSolid: { backgroundColor: colors.gold, borderColor: colors.gold },
  pillText: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 11 },
  empty: { alignItems: "center", paddingVertical: 34, paddingHorizontal: 20, borderRadius: 24, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  emptyRing: { width: 84, height: 84, borderRadius: 42, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  emptyDisc: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.gold, alignItems: "center", justifyContent: "center" },
  emptyTitle: { marginTop: 16, color: colors.cream, fontFamily: type.display, fontSize: 20, textAlign: "center" },
  emptyLine: { marginTop: 6, color: colors.muted, fontFamily: type.body, fontSize: 13.5, lineHeight: 20, textAlign: "center" },
  emptyCta: { marginTop: 18, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, height: 46, borderRadius: 16, backgroundColor: colors.gold },
  emptyCtaText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 15 },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingVertical: 6 },
  lineLabel: { flexShrink: 1, color: colors.muted, fontFamily: type.body, fontSize: 13.5 },
  lineValue: { flexShrink: 1, textAlign: "right", color: colors.cream, fontFamily: type.label, fontSize: 13.5 },
  lineStrong: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 16 },
  route: { flexDirection: "row", gap: 12 },
  rail: { width: 12, alignItems: "center", paddingTop: 5, paddingBottom: 5 },
  dotFrom: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.gold },
  railLine: { flex: 1, width: 1.5, marginVertical: 3, backgroundColor: colors.line },
  dotTo: { width: 10, height: 10, borderRadius: 2, backgroundColor: colors.burgundy, borderWidth: 1.5, borderColor: colors.goldBright },
  routeName: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 14.5 },
  routeSub: { marginTop: 1, color: colors.faint, fontFamily: type.body, fontSize: 12 },
});
