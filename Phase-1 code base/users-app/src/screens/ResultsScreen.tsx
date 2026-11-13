import { useState } from "react";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button, Chip, Icon, Rating, Sheet, Skeleton, Tag, inr } from "../components/kit";
import { cityById, durationLabel, lowestFare, seatsLeft, todayIso } from "../data";
import { useTrips } from "../remote";
import { dayLabel, isPast, shiftDay } from "../dates";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { Trip } from "../types";
import type { UserStack } from "../navigation";

type Sort = "departure" | "price" | "rating" | "fastest";
type Slot = "morning" | "afternoon" | "evening" | "night";

const slots: { key: Slot; label: string; range: [number, number]; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "morning", label: "Before 12 PM", range: [0, 12], icon: "sunny-outline" },
  { key: "afternoon", label: "12 PM to 5 PM", range: [12, 17], icon: "partly-sunny-outline" },
  { key: "evening", label: "5 PM to 9 PM", range: [17, 21], icon: "cloudy-night-outline" },
  { key: "night", label: "After 9 PM", range: [21, 24], icon: "moon-outline" },
];

export function ResultsScreen({ navigation }: NativeStackScreenProps<UserStack, "Results">) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const { fromId, toId, date } = store.search;
  const { trips: all, loading, error: loadError, reload } = useTrips(fromId, toId, date);
  const [tab, setTab] = useState<"boarding" | "drop" | "operator">("boarding");
  const [boarding, setBoarding] = useState<string | null>(null);
  const [drop, setDrop] = useState<string | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [classes, setClasses] = useState<string[]>([]);
  const [women, setWomen] = useState(store.womenOnly);
  const [withOffer, setWithOffer] = useState(false);
  const [sort, setSort] = useState<Sort>("departure");
  const [slot, setSlot] = useState<Slot | null>(null);
  const [sheet, setSheet] = useState(false);

  const pointNames = (pick: (trip: Trip) => string[]) => [...new Set(all.flatMap(pick))];
  const tabOptions = tab === "boarding" ? pointNames((trip) => trip.boarding.map((point) => point.name)) : tab === "drop" ? pointNames((trip) => trip.drops.map((point) => point.name)) : pointNames((trip) => [trip.operator]);
  const tabValue = tab === "boarding" ? boarding : tab === "drop" ? drop : operator;
  const setTabValue = (value: string | null) => (tab === "boarding" ? setBoarding(value) : tab === "drop" ? setDrop(value) : setOperator(value));

  const trips = all
    .filter((trip) => !boarding || trip.boarding.some((point) => point.name === boarding))
    .filter((trip) => !drop || trip.drops.some((point) => point.name === drop))
    .filter((trip) => !operator || trip.operator === operator)
    .filter((trip) => !classes.length || classes.includes(trip.carClass))
    .filter((trip) => !women || trip.womenFriendly)
    .filter((trip) => !withOffer || Boolean(trip.offer))
    .filter((trip) => {
      if (!slot) return true;
      const hour = Number(trip.departAt.slice(0, 2));
      const range = slots.find((item) => item.key === slot)!.range;
      return hour >= range[0] && hour < range[1];
    })
    .sort((a, b) => (sort === "price" ? lowestFare(a) - lowestFare(b) : sort === "rating" ? b.rating - a.rating : sort === "fastest" ? a.durationMin - b.durationMin : a.departAt.localeCompare(b.departAt)));

  const toggleClass = (value: string) => setClasses((list) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]));
  const activeFilters = [boarding, drop, operator, slot, women || null, withOffer || null].filter(Boolean).length + classes.length + (sort !== "departure" ? 1 : 0);
  const clear = () => {
    setBoarding(null);
    setDrop(null);
    setOperator(null);
    setClasses([]);
    setWomen(false);
    setWithOffer(false);
    setSlot(null);
    setSort("departure");
  };

  const header = (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.offers}>
        <View style={styles.offer}>
          <View style={styles.offerIcon}>
            <Icon name="mc:tag-outline" size={17} />
          </View>
          <View>
            <Text style={styles.offerTitle}>₹200 off your first seat</Text>
            <Text style={styles.offerLine}>Code ROVEYAFIRST</Text>
          </View>
        </View>
        <View style={styles.offer}>
          <View style={styles.offerIcon}>
            <Icon name="mc:crown-outline" size={17} />
          </View>
          <View>
            <Text style={styles.offerTitle}>ROVEYA Prime cars</Text>
            <Text style={styles.offerLine}>₹100 off with PRIME100</Text>
          </View>
        </View>
        <View style={styles.offer}>
          <View style={[styles.offerIcon, { borderColor: "rgba(229,138,168,0.4)" }]}>
            <Icon name="mc:face-woman-outline" size={17} color={colors.rose} />
          </View>
          <View>
            <Text style={styles.offerTitle}>Women travellers</Text>
            <Text style={styles.offerLine}>15% off with WOMEN15</Text>
          </View>
        </View>
      </ScrollView>
      <View style={styles.tabs}>
        {(["boarding", "drop", "operator"] as const).map((key) => (
          <Pressable key={key} onPress={() => setTab(key)} style={styles.tab}>
            <Text style={[styles.tabText, tab === key && styles.tabTextOn]}>{key === "boarding" ? "Boarding points" : key === "drop" ? "Dropping points" : "Operators"}</Text>
            {tab === key ? <View style={styles.tabLine} /> : null}
          </Pressable>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pointRow}>
        {tabOptions.map((name) => (
          <Chip key={name} label={name} on={tabValue === name} onPress={() => setTabValue(tabValue === name ? null : name)} />
        ))}
      </ScrollView>
      <Text style={styles.count}>
        {trips.length} of {all.length} car{all.length === 1 ? "" : "s"}{activeFilters ? " · filters on" : ""}
      </Text>
    </>
  );

  return (
    <View style={styles.screen}>
      <LinearGradient colors={[colors.burgundy, colors.cherry]} style={[styles.top, { paddingTop: Math.max(insets.top, 12) + 4 }]}>
        <View style={styles.topRow}>
          <Pressable accessibilityLabel="Back" hitSlop={10} onPress={() => navigation.goBack()} style={styles.back}>
            <Ionicons name="arrow-back" size={18} color={colors.cream} />
          </Pressable>
          <Pressable onPress={() => navigation.navigate("CitySearch", { field: "to" })} style={{ flex: 1 }}>
            <Text style={styles.route} numberOfLines={1}>
              {cityById(fromId).name} → {cityById(toId).name}
            </Text>
            <Text style={styles.sub}>{loading ? "Finding cars…" : all.length ? `${all.length} car${all.length === 1 ? "" : "s"} · seats from ${inr(Math.min(...all.map(lowestFare)))}` : "No cars left today"}</Text>
          </Pressable>
        </View>
        <View style={styles.dateBar}>
          <Pressable disabled={isPast(shiftDay(date, -1))} onPress={() => store.setSearch({ date: shiftDay(date, -1) })} style={[styles.dateArrow, isPast(shiftDay(date, -1)) && { opacity: 0.3 }]}>
            <Ionicons name="chevron-back" size={16} color={colors.cream} />
          </Pressable>
          <Text style={styles.dateText}>{dayLabel(date)}</Text>
          <Pressable onPress={() => store.setSearch({ date: shiftDay(date, 1) })} style={styles.dateArrow}>
            <Ionicons name="chevron-forward" size={16} color={colors.cream} />
          </Pressable>
        </View>
      </LinearGradient>

      {loading ? (
        <ScrollView contentContainerStyle={{ paddingTop: 6, paddingBottom: 110 }} scrollEnabled={false}>
          {[0, 1, 2, 3].map((index) => (
            <TripSkeleton key={index} />
          ))}
        </ScrollView>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(trip) => trip.id}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingBottom: 110 }}
          renderItem={({ item }) => <TripCard trip={item} onPress={() => navigation.navigate("Seats", { tripId: item.id })} />}
          ListEmptyComponent={
            all.length ? (
              <View style={styles.empty}>
                <MaterialCommunityIcons name="car-off" size={40} color={colors.gold} />
                <Text style={styles.emptyTitle}>No car matches these filters</Text>
                <Button label="Clear filters" tone="ghost" onPress={clear} style={{ marginTop: 14, alignSelf: "stretch" }} />
              </View>
            ) : loadError ? (
              <View style={styles.empty}>
                <MaterialCommunityIcons name="wifi-off" size={40} color={colors.gold} />
                <Text style={styles.emptyTitle}>Cars could not load</Text>
                <Text style={styles.emptyLine}>{loadError}</Text>
                <Button label="Try again" onPress={reload} style={{ marginTop: 14, alignSelf: "stretch" }} />
              </View>
            ) : (
              <View style={styles.empty}>
                <MaterialCommunityIcons name="weather-night" size={40} color={colors.gold} />
                <Text style={styles.emptyTitle}>{date === todayIso() ? "No more cars today" : "No cars on this date yet"}</Text>
                <Text style={styles.emptyLine}>{date === todayIso() ? "Tomorrow has early-morning cars on this route." : "Captains publish trips up to 30 days ahead. Try the next day."}</Text>
                <Button label="See the next day" icon="arrow-forward" onPress={() => store.setSearch({ date: shiftDay(date, 1) })} style={{ marginTop: 14, alignSelf: "stretch" }} />
              </View>
            )
          }
        />
      )}

      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }} style={{ flex: 1 }}>
          <Chip label="Sedan" icon="mc:car-side" on={classes.includes("Sedan")} onPress={() => toggleClass("Sedan")} />
          <Chip label="SUV" icon="mc:car-estate" on={classes.includes("SUV") || classes.includes("Premium SUV")} onPress={() => setClasses((list) => (list.includes("SUV") ? list.filter((item) => item !== "SUV" && item !== "Premium SUV") : [...list, "SUV", "Premium SUV"]))} />
          <Chip label="Women friendly" icon="mc:face-woman-outline" on={women} onPress={() => setWomen(!women)} />
          <Chip label="Offers" icon="mc:tag-outline" on={withOffer} onPress={() => setWithOffer(!withOffer)} />
        </ScrollView>
        <Pressable onPress={() => setSheet(true)} style={styles.sortBtn}>
          <Ionicons name="options-outline" size={18} color={colors.night} />
          <Text style={styles.sortText}>Sort{activeFilters ? ` · ${activeFilters}` : ""}</Text>
        </Pressable>
      </View>

      <Sheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title="Sort and filter"
        footer={
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button label="Clear all" tone="ghost" onPress={clear} style={{ flex: 1 }} />
            <Button label={`Show ${trips.length} cars`} onPress={() => setSheet(false)} style={{ flex: 1.4 }} />
          </View>
        }
      >
        <Text style={styles.sheetKicker}>SORT BY</Text>
        <View style={styles.wrap}>
          {(
            [
              ["departure", "Earliest departure"],
              ["price", "Lowest price"],
              ["rating", "Top rated"],
              ["fastest", "Fastest"],
            ] as [Sort, string][]
          ).map(([key, label]) => (
            <Chip key={key} label={label} on={sort === key} onPress={() => setSort(key)} />
          ))}
        </View>
        <Text style={styles.sheetKicker}>DEPARTURE TIME</Text>
        <View style={styles.wrap}>
          {slots.map((item) => (
            <Chip key={item.key} label={item.label} icon={item.icon} on={slot === item.key} onPress={() => setSlot(slot === item.key ? null : item.key)} />
          ))}
        </View>
        <Text style={styles.sheetKicker}>CAR TYPE</Text>
        <View style={styles.wrap}>
          {["Sedan", "SUV", "Premium SUV"].map((value) => (
            <Chip key={value} label={value} on={classes.includes(value)} onPress={() => toggleClass(value)} />
          ))}
        </View>
        <Text style={styles.sheetKicker}>OPERATOR</Text>
        <View style={styles.wrap}>
          {pointNames((trip) => [trip.operator]).map((name) => (
            <Chip key={name} label={name} on={operator === name} onPress={() => setOperator(operator === name ? null : name)} />
          ))}
        </View>
      </Sheet>
    </View>
  );
}

function TripCard({ trip, onPress }: { trip: Trip; onPress: () => void }) {
  const left = seatsLeft(trip);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { borderColor: colors.gold }]}>
      <View style={styles.cardHead}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.operatorRow}>
            <Text style={styles.operator} numberOfLines={1}>{trip.operator}</Text>
            {trip.assured ? (
              <View style={styles.assured}>
                <Ionicons name="shield-checkmark" size={11} color={colors.night} />
                <Text style={styles.assuredText}>Assured</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.car} numberOfLines={1}>
            {trip.car} · {trip.carClass} · AC
          </Text>
        </View>
        <Rating value={trip.rating} count={trip.reviews} />
      </View>

      <View style={styles.times}>
        <View>
          <Text style={styles.time}>{trip.departAt}</Text>
          <Text style={styles.point} numberOfLines={1}>{trip.boarding[0].name}</Text>
        </View>
        <View style={styles.duration}>
          <View style={styles.durationLine} />
          <Text style={styles.durationText}>{durationLabel(trip.durationMin)}</Text>
          <View style={styles.durationLine} />
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.time}>
            {trip.arriveAt}
            {trip.drops[trip.drops.length - 1].dayOffset > 0 ? <Text style={styles.nextDay}> +1</Text> : null}
          </Text>
          <Text style={styles.point} numberOfLines={1}>{trip.drops[trip.drops.length - 1].name}</Text>
        </View>
      </View>

      <View style={styles.cardFoot}>
        <View style={styles.tags}>
          {trip.tags.slice(0, 3).map((tag) => (
            <Tag key={tag} label={tag} icon={tag === "Women friendly" ? "mc:face-woman-outline" : tag === "Live tracking" ? "mc:crosshairs-gps" : tag === "Car photos" ? "mc:image-multiple-outline" : "mc:car-info"} />
          ))}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.starts}>Starts @</Text>
          <Text style={styles.fare}>{inr(lowestFare(trip))}</Text>
        </View>
      </View>

      <View style={styles.cardBottom}>
        <Text style={[styles.left, left <= 2 && { color: colors.danger }]}>{left === 0 ? "Sold out" : `${left} seat${left > 1 ? "s" : ""} left`} · {trip.seats.length} in car</Text>
        {trip.offer ? <Text style={styles.offerText} numberOfLines={1}>{trip.offer}</Text> : null}
      </View>
    </Pressable>
  );
}

function TripSkeleton() {
  return (
    <View style={[styles.card, { padding: 14, gap: 12 }]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <View style={{ gap: 6, flex: 1 }}>
          <Skeleton width="55%" height={15} />
          <Skeleton width="40%" height={11} />
        </View>
        <Skeleton width={58} height={20} radius={6} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Skeleton width={54} height={20} />
        <Skeleton height={2} style={{ flex: 1 }} />
        <Skeleton width={54} height={20} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Skeleton width={64} height={22} radius={8} />
          <Skeleton width={84} height={22} radius={8} />
        </View>
        <Skeleton width={70} height={24} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  offerIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line },
  emptyLine: { marginTop: 4, color: colors.muted, fontFamily: type.regular, fontSize: 13, textAlign: "center" },
  top: { paddingHorizontal: 14, paddingBottom: 12 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  back: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(18,6,13,0.4)", alignItems: "center", justifyContent: "center" },
  route: { color: colors.cream, fontFamily: type.semibold, fontSize: 18 },
  sub: { marginTop: 2, color: colors.muted, fontFamily: type.regular, fontSize: 12.5 },
  dateBar: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 14, backgroundColor: "rgba(18,6,13,0.4)", paddingHorizontal: 6, paddingVertical: 4 },
  dateArrow: { width: 34, height: 30, alignItems: "center", justifyContent: "center" },
  dateText: { color: colors.cream, fontFamily: type.semibold, fontSize: 14 },
  offers: { gap: 10, padding: 14 },
  offer: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  offerTitle: { color: colors.cream, fontFamily: type.semibold, fontSize: 13 },
  offerLine: { color: colors.gold, fontFamily: type.medium, fontSize: 11.5 },
  tabs: { flexDirection: "row", paddingHorizontal: 14, gap: 18, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  tab: { paddingVertical: 10 },
  tabText: { color: colors.faint, fontFamily: type.medium, fontSize: 14 },
  tabTextOn: { color: colors.gold },
  tabLine: { position: "absolute", bottom: -1, left: 0, right: 0, height: 2, backgroundColor: colors.gold },
  pointRow: { gap: 8, padding: 14 },
  count: { paddingHorizontal: 16, paddingBottom: 4, color: colors.faint, fontFamily: type.regular, fontSize: 12.5 },
  card: { marginHorizontal: 14, marginTop: 12, borderRadius: 20, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, paddingBottom: 6 },
  operatorRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  operator: { flexShrink: 1, color: colors.cream, fontFamily: type.semibold, fontSize: 16 },
  assured: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.gold, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  assuredText: { color: colors.night, fontFamily: type.semibold, fontSize: 10 },
  car: { marginTop: 3, color: colors.muted, fontFamily: type.regular, fontSize: 12.5 },
  times: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 8 },
  time: { color: colors.cream, fontFamily: type.semibold, fontSize: 18 },
  nextDay: { color: colors.gold, fontFamily: type.semibold, fontSize: 11 },
  point: { marginTop: 2, maxWidth: 120, color: colors.faint, fontFamily: type.regular, fontSize: 11.5 },
  duration: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  durationLine: { flex: 1, height: 1, backgroundColor: colors.line },
  durationText: { color: colors.muted, fontFamily: type.medium, fontSize: 11.5 },
  cardFoot: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 10, paddingHorizontal: 14, paddingBottom: 12 },
  tags: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  starts: { color: colors.faint, fontFamily: type.regular, fontSize: 11 },
  fare: { color: colors.gold, fontFamily: type.bold, fontSize: 20 },
  cardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.mist, borderTopWidth: 1, borderTopColor: colors.hairline },
  left: { color: colors.success, fontFamily: type.medium, fontSize: 12 },
  offerText: { flexShrink: 1, color: colors.goldBright, fontFamily: type.medium, fontSize: 11.5 },
  empty: { alignItems: "center", padding: 30, margin: 14, borderRadius: 20, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  emptyTitle: { marginTop: 12, color: colors.cream, fontFamily: type.semibold, fontSize: 16 },
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingTop: 10, backgroundColor: colors.inkwell, borderTopWidth: 1, borderTopColor: colors.line },
  sortBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, height: 40, borderRadius: 14, backgroundColor: colors.gold },
  sortText: { color: colors.night, fontFamily: type.semibold, fontSize: 13 },
  sheetKicker: { marginTop: 14, marginBottom: 10, color: colors.gold, fontFamily: type.semibold, fontSize: 11, letterSpacing: 2 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
