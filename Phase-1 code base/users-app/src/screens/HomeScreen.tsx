import { useState } from "react";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Banners, Button, Chip, Icon, Logo, Section, Sheet, Wordmark, inr } from "../components/kit";
import { cityById, escapes, lowestFare, popularRoutes, searchTrips } from "../data";
import { nextDays, relativeLabel } from "../dates";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { Glyph } from "../types";
import type { UserStack, UserTabs } from "../navigation";

type Props = CompositeScreenProps<BottomTabScreenProps<UserTabs, "Home">, NativeStackScreenProps<UserStack>>;

const modes: { key: string; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; badge?: string }[] = [
  { key: "seats", label: "Car seats", icon: "car-seat" },
  { key: "full", label: "Full car", icon: "car-side", badge: "Soon" },
  { key: "airport", label: "Airport", icon: "airplane", badge: "Soon" },
  { key: "rentals", label: "Rentals", icon: "car-clock", badge: "Soon" },
];

const shortcuts: { icon: Glyph; label: string; go: "WomenZone" | "Help" }[] = [
  { icon: "mc:shield-check-outline", label: "Trip Security", go: "Help" },
  { icon: "mc:face-woman-outline", label: "Women Zone", go: "WomenZone" },
];

const reasons: { icon: Glyph; title: string; line: string }[] = [
  { icon: "mc:car-seat", title: "Pick your exact seat", line: "See the car layout before you pay" },
  { icon: "mc:account-check-outline", title: "Verified captains", line: "Background checked and trained" },
  { icon: "mc:map-marker-radius-outline", title: "Live tracking", line: "Share your trip with family" },
  { icon: "mc:lightning-bolt-outline", title: "Online payment", line: "The ticket is confirmed when the payment succeeds" },
];

export function HomeScreen({ navigation }: Props) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const [calendar, setCalendar] = useState(false);
  const [soon, setSoon] = useState<string | null>(null);
  const from = cityById(store.search.fromId);
  const to = cityById(store.search.toId);
  const strip = nextDays(5);
  const month = nextDays(30);
  const picked = month.find((day) => day.iso === store.search.date) ?? month[0];

  const search = () => {
    store.rememberSearch();
    navigation.navigate("Results");
  };

  const openRoute = (fromId: string, toId: string) => {
    store.setSearch({ fromId, toId });
    navigation.navigate("Results");
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[colors.cherry, colors.night]} style={[styles.top, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
          <View style={styles.brandRow}>
            <Logo size={38} />
            <View style={{ flex: 1 }}>
              <Wordmark size={16} />
            </View>
            <Pressable accessibilityLabel="Women Zone" onPress={() => navigation.navigate("WomenZone")} style={styles.womenBtn}>
              <Icon name="mc:face-woman-outline" size={16} color={colors.rose} />
              <Text style={styles.womenText}>Women Zone</Text>
            </Pressable>
          </View>

          <View style={styles.modes}>
            {modes.map((mode) => {
              const on = mode.key === "seats";
              return (
                <Pressable key={mode.key} onPress={() => (on ? undefined : setSoon(mode.label))} style={styles.mode}>
                  <View style={[styles.modeIcon, on && styles.modeIconOn]}>
                    <MaterialCommunityIcons name={mode.icon} size={24} color={on ? colors.night : colors.gold} />
                    {mode.badge ? (
                      <View style={styles.modeBadge}>
                        <Text style={styles.modeBadgeText}>{mode.badge}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.modeText, on && { color: colors.cream }]}>{mode.label}</Text>
                  {on ? <View style={styles.modeLine} /> : null}
                </Pressable>
              );
            })}
          </View>
        </LinearGradient>

        <View style={styles.searchCard}>
          <Pressable onPress={() => navigation.navigate("CitySearch", { field: "from" })} style={styles.place}>
            <Ionicons name="navigate" size={18} color={colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={styles.placeLabel}>Leaving from</Text>
              <Text style={styles.placeValue}>{from.name}</Text>
            </View>
          </Pressable>
          <View style={styles.placeRule} />
          <Pressable onPress={() => navigation.navigate("CitySearch", { field: "to" })} style={styles.place}>
            <Ionicons name="location" size={18} color={colors.rose} />
            <View style={{ flex: 1 }}>
              <Text style={styles.placeLabel}>Going to</Text>
              <Text style={styles.placeValue}>{to.name}</Text>
            </View>
          </Pressable>
          <Pressable accessibilityLabel="Swap cities" onPress={() => store.setSearch({ fromId: store.search.toId, toId: store.search.fromId })} style={styles.swap}>
            <Ionicons name="swap-vertical" size={18} color={colors.gold} />
          </Pressable>

          <View style={styles.dateRow}>
            <Pressable onPress={() => setCalendar(true)} style={styles.month}>
              <Ionicons name="calendar-outline" size={16} color={colors.gold} />
              <Text style={styles.monthText}>{picked.month.toUpperCase()}</Text>
              <Text style={styles.yearText}>{picked.year}</Text>
            </Pressable>
            {strip.map((day) => {
              const on = day.iso === store.search.date;
              return (
                <Pressable key={day.iso} onPress={() => store.setSearch({ date: day.iso })} style={[styles.day, on && styles.dayOn]}>
                  {day.offset === 0 ? <Text style={[styles.dayTag, on && { color: colors.night }]}>Today</Text> : null}
                  <Text style={[styles.dayNum, on && { color: colors.night }]}>{day.date}</Text>
                  <Text style={[styles.dayName, on && { color: colors.night }]}>{day.day}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.personal}>Tap for personalised trips</Text>
          <View style={styles.personalRow}>
            <Chip label="Women travellers" icon="mc:face-woman-outline" on={store.womenOnly} onPress={() => store.setWomenOnly(!store.womenOnly)} />
          </View>
          <Button label="Search cars" icon="search" onPress={search} style={{ marginTop: 16 }} />
        </View>

        <View style={styles.shortcuts}>
          {shortcuts.map((item) => (
            <Pressable key={item.label} onPress={() => (item.go === "Help" ? navigation.navigate("Tabs", { screen: "Help" }) : navigation.navigate(item.go))} style={styles.shortcut}>
              <View style={styles.shortcutIcon}>
                <Icon name={item.icon} size={22} color={colors.gold} />
              </View>
              <Text style={styles.shortcutText}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        {store.recent.length ? (
          <>
            <Section title="Recent searches" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
              {store.recent.map((item) => (
                <Pressable key={`${item.fromId}-${item.toId}`} onPress={() => openRoute(item.fromId, item.toId)} style={styles.recent}>
                  <Ionicons name="time-outline" size={15} color={colors.gold} />
                  <Text style={styles.recentText}>{cityById(item.fromId).name} → {cityById(item.toId).name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        <Section title="Trusted travel partner" />
        <Banners
          slides={[
            { image: require("../../assets/hero-car.jpg"), kicker: "ROVEYA PRIME", title: "Brand-new cars, top-rated captains", cta: "Book Prime", onPress: search },
            { image: require("../../assets/cust-pool-group.jpg"), kicker: "TRAVEL TOGETHER", title: "Book every seat for your family", cta: "See cars", onPress: search },
            { image: require("../../assets/cust-car-woman.jpg"), kicker: "WOMEN ZONE", title: "Women-only seats, marked in pink", cta: "Learn more", onPress: () => navigation.navigate("WomenZone") },
          ]}
        />

        <Section title="Popular routes" />
        <View style={styles.routes}>
          {popularRoutes.map(([fromId, toId]) => {
            const trips: ReturnType<typeof searchTrips> = [];
            const cheapest = trips.length ? Math.min(...trips.map(lowestFare)) : 0;
            return (
              <Pressable key={`${fromId}-${toId}`} onPress={() => openRoute(fromId, toId)} style={({ pressed }) => [styles.route, pressed && { borderColor: colors.gold }]}>
                <Text style={styles.routeName} numberOfLines={1}>{cityById(fromId).name}</Text>
                <View style={styles.routeArrow}>
                  <View style={styles.routeDash} />
                  <Icon name="mc:car-side" size={16} color={colors.gold} />
                  <View style={styles.routeDash} />
                </View>
                <Text style={styles.routeName} numberOfLines={1}>{cityById(toId).name}</Text>
                <Text style={styles.routeFare}>{trips.length ? `${trips.length} cars · from ${inr(cheapest)}` : "See cars and seats"}</Text>
              </Pressable>
            );
          })}
        </View>

        <Section title="Divine escapes" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
          {escapes.map((place) => (
            <Pressable key={place.cityId} onPress={() => openRoute("hyd", place.cityId)}>
              <LinearGradient colors={[colors.burgundy, colors.plum, colors.inkwell]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.escape}>
                <View style={styles.escapeIcon}>
                  <Icon name={place.icon} size={26} />
                </View>
                <Text style={styles.escapeTitle}>{place.title}</Text>
                <Text style={styles.escapeLine}>{place.line}</Text>
                <Text style={styles.escapeFrom}>From Hyderabad · {relativeLabel(store.search.date)}</Text>
              </LinearGradient>
            </Pressable>
          ))}
        </ScrollView>

        <Section title="Why choose ROVEYA" />
        <View style={styles.reasons}>
          {reasons.map((reason) => (
            <View key={reason.title} style={styles.reason}>
              <View style={styles.reasonIcon}>
                <Icon name={reason.icon} size={20} color={colors.gold} />
              </View>
              <Text style={styles.reasonTitle}>{reason.title}</Text>
              <Text style={styles.reasonLine}>{reason.line}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <Sheet visible={calendar} onClose={() => setCalendar(false)} title="Pick your travel date">
        <View style={styles.calendar}>
          {month.map((day) => {
            const on = day.iso === store.search.date;
            return (
              <Pressable
                key={day.iso}
                onPress={() => {
                  store.setSearch({ date: day.iso });
                  setCalendar(false);
                }}
                style={[styles.calDay, on && styles.dayOn]}
              >
                <Text style={[styles.dayName, on && { color: colors.night }]}>{day.day}</Text>
                <Text style={[styles.dayNum, on && { color: colors.night }]}>{day.date}</Text>
                <Text style={[styles.dayName, on && { color: colors.night }]}>{day.month}</Text>
              </Pressable>
            );
          })}
        </View>
      </Sheet>

      <Sheet visible={Boolean(soon)} onClose={() => setSoon(null)} title={soon ?? ""} footer={<Button label="Book car seats" onPress={() => setSoon(null)} />}>
        <Text style={styles.soonText}>{soon} bookings open in the next ROVEYA release. Car seats on every route are live now.</Text>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  top: { paddingHorizontal: 16, paddingBottom: 46 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  womenBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 14, backgroundColor: "rgba(229,138,168,0.12)", borderWidth: 1, borderColor: "rgba(229,138,168,0.4)" },
  womenText: { color: colors.cream, fontFamily: type.medium, fontSize: 12 },
  modes: { flexDirection: "row", justifyContent: "space-between", marginTop: 22 },
  mode: { alignItems: "center", flex: 1 },
  modeIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(18,6,13,0.5)", borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  modeIconOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  modeBadge: { position: "absolute", top: -6, right: -10, backgroundColor: colors.burgundy, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: colors.gold },
  modeBadgeText: { color: colors.cream, fontFamily: type.semibold, fontSize: 9 },
  modeText: { marginTop: 7, color: colors.muted, fontFamily: type.medium, fontSize: 12.5 },
  modeLine: { marginTop: 5, width: 26, height: 3, borderRadius: 2, backgroundColor: colors.gold },
  searchCard: { marginTop: -30, marginHorizontal: 16, borderRadius: 24, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, padding: 16 },
  place: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, paddingRight: 50 },
  placeLabel: { color: colors.faint, fontFamily: type.regular, fontSize: 12 },
  placeValue: { marginTop: 1, color: colors.cream, fontFamily: type.semibold, fontSize: 17 },
  placeRule: { height: 1, backgroundColor: colors.hairline, marginLeft: 30, marginVertical: 4 },
  swap: { position: "absolute", right: 16, top: 44, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  dateRow: { flexDirection: "row", alignItems: "stretch", gap: 6, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.hairline },
  month: { width: 52, alignItems: "center", justifyContent: "center", gap: 2 },
  monthText: { color: colors.cream, fontFamily: type.semibold, fontSize: 12 },
  yearText: { color: colors.faint, fontFamily: type.regular, fontSize: 10.5 },
  day: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8, borderRadius: 12, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.hairline },
  dayOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  dayTag: { color: colors.gold, fontFamily: type.semibold, fontSize: 9 },
  dayNum: { color: colors.cream, fontFamily: type.semibold, fontSize: 16 },
  dayName: { color: colors.faint, fontFamily: type.regular, fontSize: 11 },
  personal: { marginTop: 16, color: colors.muted, fontFamily: type.regular, fontSize: 12.5 },
  personalRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  shortcuts: { flexDirection: "row", marginHorizontal: 16, marginTop: 16, borderRadius: 20, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, paddingVertical: 14 },
  shortcut: { flex: 1, alignItems: "center", gap: 7 },
  shortcutIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  shortcutText: { color: colors.cream, fontFamily: type.medium, fontSize: 11.5, textAlign: "center" },
  recent: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  recentText: { color: colors.cream, fontFamily: type.medium, fontSize: 13 },
  routes: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 16 },
  route: { width: "48%", flexGrow: 1, borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, padding: 14 },
  routeName: { color: colors.cream, fontFamily: type.semibold, fontSize: 14.5 },
  routeArrow: { flexDirection: "row", alignItems: "center", gap: 6, marginVertical: 6 },
  routeDash: { flex: 1, height: 1, backgroundColor: colors.line },
  routeFare: { marginTop: 8, color: colors.gold, fontFamily: type.medium, fontSize: 12 },
  escape: { width: 200, height: 170, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.line, justifyContent: "flex-end" },
  escapeIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(18,6,13,0.45)", borderWidth: 1, borderColor: colors.line },
  escapeTitle: { marginTop: 10, color: colors.cream, fontFamily: type.semibold, fontSize: 18 },
  escapeLine: { marginTop: 3, color: colors.muted, fontFamily: type.regular, fontSize: 12, lineHeight: 17 },
  escapeFrom: { marginTop: 8, color: colors.gold, fontFamily: type.medium, fontSize: 11 },
  reasons: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 16 },
  reason: { width: "48%", flexGrow: 1, borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 6 },
  reasonIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line, marginBottom: 4 },
  reasonTitle: { color: colors.cream, fontFamily: type.semibold, fontSize: 14 },
  reasonLine: { color: colors.muted, fontFamily: type.regular, fontSize: 12, lineHeight: 17 },
  calendar: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  calDay: { width: "13%", flexGrow: 1, alignItems: "center", paddingVertical: 8, borderRadius: 12, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.hairline },
  soonText: { color: colors.muted, fontFamily: type.regular, fontSize: 14, lineHeight: 21 },
});
