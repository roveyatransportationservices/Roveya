import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button, Header } from "../components/kit";
import { cityById } from "../data";
import { dayLabel } from "../dates";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { StopPoint } from "../types";
import type { UserStack } from "../navigation";

export function PointsScreen({ navigation }: NativeStackScreenProps<UserStack, "Points">) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const draft = store.draft;
  const [tab, setTab] = useState<"boarding" | "drop">(draft?.boarding && !draft.drop ? "drop" : "boarding");
  if (!draft) return null;
  const { trip } = draft;
  const list = tab === "boarding" ? trip.boarding : trip.drops;
  const picked = tab === "boarding" ? draft.boarding : draft.drop;

  const choose = (point: StopPoint) => {
    if (tab === "boarding") {
      store.patchDraft({ boarding: point });
      if (!draft.drop) setTab("drop");
    } else store.patchDraft({ drop: point });
  };

  return (
    <View style={styles.screen}>
      <Header title="Boarding and drop" subtitle={`${cityById(trip.fromId).name} → ${cityById(trip.toId).name} · ${dayLabel(trip.date)}`} onBack={() => navigation.goBack()} />
      <View style={styles.tabs}>
        {(["boarding", "drop"] as const).map((key) => {
          const value = key === "boarding" ? draft.boarding : draft.drop;
          return (
            <Pressable key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabOn]}>
              <Text style={[styles.tabLabel, tab === key && { color: colors.gold }]}>{key === "boarding" ? "BOARDING POINT" : "DROP POINT"}</Text>
              <Text style={styles.tabValue} numberOfLines={1}>{value ? `${value.time} · ${value.name}` : "Select"}</Text>
            </Pressable>
          );
        })}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        <Text style={styles.kicker}>{tab === "boarding" ? `PICKUP IN ${cityById(trip.fromId).name.toUpperCase()}` : `DROP IN ${cityById(trip.toId).name.toUpperCase()}`}</Text>
        <View style={styles.list}>
          {list.map((point, index) => {
            const on = picked?.id === point.id;
            return (
              <Pressable key={point.id} onPress={() => choose(point)} style={[styles.row, index < list.length - 1 && styles.rowLine, on && { backgroundColor: colors.mist }]}>
                <View style={{ width: 58 }}>
                  <Text style={styles.time}>{point.time}</Text>
                  {point.dayOffset ? <Text style={styles.day}>Next day</Text> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{point.name}</Text>
                  <Text style={styles.sub}>{point.landmark}</Text>
                  <Pressable hitSlop={6} onPress={() => void Linking.openURL(`tel:+91${point.phone}`)} style={styles.call}>
                    <Ionicons name="call-outline" size={12} color={colors.gold} />
                    <Text style={styles.callText}>{point.phone}</Text>
                  </Pressable>
                </View>
                <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.tip}>
          <Ionicons name="time-outline" size={16} color={colors.gold} />
          <Text style={styles.tipText}>Reach your boarding point 10 minutes early. The captain waits 5 minutes after the time shown.</Text>
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Button label="Continue to traveller details" icon="arrow-forward" disabled={!draft.boarding || !draft.drop} onPress={() => navigation.navigate("Review")} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  tabs: { flexDirection: "row", gap: 10, padding: 16, paddingBottom: 4 },
  tab: { flex: 1, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell },
  tabOn: { borderColor: colors.gold },
  tabLabel: { color: colors.faint, fontFamily: type.semibold, fontSize: 10, letterSpacing: 1.5 },
  tabValue: { marginTop: 4, color: colors.cream, fontFamily: type.semibold, fontSize: 13.5 },
  kicker: { marginTop: 8, marginBottom: 10, color: colors.gold, fontFamily: type.semibold, fontSize: 11, letterSpacing: 2 },
  list: { borderRadius: 20, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  time: { color: colors.cream, fontFamily: type.semibold, fontSize: 15 },
  day: { color: colors.gold, fontFamily: type.regular, fontSize: 10.5 },
  name: { color: colors.cream, fontFamily: type.semibold, fontSize: 14.5 },
  sub: { marginTop: 2, color: colors.muted, fontFamily: type.regular, fontSize: 12.5 },
  call: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  callText: { color: colors.gold, fontFamily: type.medium, fontSize: 12 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.faint, alignItems: "center", justifyContent: "center", marginTop: 2 },
  radioOn: { borderColor: colors.gold },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.gold },
  tip: { flexDirection: "row", gap: 8, marginTop: 14, padding: 12, borderRadius: 14, backgroundColor: "rgba(214,160,0,0.08)", borderWidth: 1, borderColor: colors.line },
  tipText: { flex: 1, color: colors.muted, fontFamily: type.regular, fontSize: 12.5, lineHeight: 18 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.inkwell, borderTopWidth: 1, borderTopColor: colors.line },
});
