import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, type } from "../theme";
import type { Cycle, Glyph } from "../types";
import { Icon } from "./kit";

export const CYCLES: { cycle: Cycle; title: string; line: string; icon: Glyph; tag?: string }[] = [
  { cycle: "daily", title: "Daily", line: "Earnings settle every night at 12 AM. Good for fuel and daily costs.", icon: "mc:weather-sunset" },
  { cycle: "weekly", title: "Weekly", line: "One settlement every 7 days. Most captains choose this.", icon: "mc:calendar-week", tag: "Recommended" },
  { cycle: "monthly", title: "Monthly", line: "One larger settlement a month. Locked for the full month once it starts.", icon: "mc:calendar-month-outline" },
];

export function CycleOptions({ value, onChange, current }: { value: Cycle; onChange: (cycle: Cycle) => void; current?: Cycle }) {
  return (
    <View style={{ gap: 10 }}>
      {CYCLES.map((item) => {
        const on = item.cycle === value;
        return (
          <Pressable key={item.cycle} onPress={() => onChange(item.cycle)} style={[styles.card, on && styles.cardOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
            <View style={[styles.icon, on && { backgroundColor: colors.gold, borderColor: colors.gold }]}>
              <Icon name={item.icon} size={20} color={on ? colors.night : colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{item.title}</Text>
                {item.tag ? <Text style={styles.tag}>{item.tag}</Text> : null}
                {current === item.cycle ? <Text style={styles.current}>Current</Text> : null}
              </View>
              <Text style={styles.line}>{item.line}</Text>
            </View>
            <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.dot} /> : null}</View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night },
  cardOn: { borderColor: colors.gold, backgroundColor: "rgba(214,160,0,0.06)" },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: colors.cream, fontFamily: type.semibold, fontSize: 15 },
  tag: { color: colors.night, backgroundColor: colors.gold, fontFamily: type.semibold, fontSize: 9.5, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, overflow: "hidden" },
  current: { color: colors.success, fontFamily: type.semibold, fontSize: 10.5 },
  line: { marginTop: 3, color: colors.muted, fontFamily: type.regular, fontSize: 12, lineHeight: 17 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.faint, alignItems: "center", justifyContent: "center" },
  radioOn: { borderColor: colors.gold },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.gold },
});
