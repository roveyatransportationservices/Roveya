import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { BannerCarousel } from "../components/BannerCarousel";
import { art, slide } from "../banners";
import { Chips, Empty, HeadButton, Line, PageShell, Pill, RoutePair, SectionTitle, Stars, page } from "../components/PageShell";
import { TabPage } from "../components/TabPage";
import { DAY_MS, vehicleTitle } from "../data";
import { inr } from "../geo";
import { captainAccess } from "../ridePlan";
import { earned, startOfDay, startOfWeek } from "../orders";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { CaptainStack, CaptainTabs } from "../navigation";
import type { Trip } from "../types";

type TabProps = CompositeScreenProps<BottomTabScreenProps<CaptainTabs, "Earnings">, NativeStackScreenProps<CaptainStack>>;

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function when(at: number) {
  const date = new Date(at);
  const hours = date.getHours();
  const time = `${hours % 12 || 12}:${String(date.getMinutes()).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
  if (at >= startOfDay()) return `Today, ${time}`;
  if (at >= startOfDay() - DAY_MS) return `Yesterday, ${time}`;
  return `${date.getDate()} ${months[date.getMonth()]}, ${time}`;
}

function summarise(trips: Trip[]) {
  const done = trips.filter((trip) => trip.status === "Completed");
  return {
    done,
    total: done.reduce((sum, trip) => sum + earned(trip), 0),
    fares: done.reduce((sum, trip) => sum + trip.fare, 0),
    bonus: done.reduce((sum, trip) => sum + trip.bonus, 0),
    tips: done.reduce((sum, trip) => sum + trip.tip, 0),
    cash: done.filter((trip) => trip.payment === "cash").reduce((sum, trip) => sum + trip.fare, 0),
    km: done.reduce((sum, trip) => sum + trip.km, 0),
    missed: trips.filter((trip) => trip.status === "Missed").length,
    cancelled: trips.filter((trip) => trip.status === "Cancelled").length,
  };
}

export function EarningsScreen({ navigation }: TabProps) {
  const store = useStore();
  const [range, setRange] = useState<"today" | "week">("today");
  const from = range === "today" ? startOfDay() : startOfWeek();
  const trips = store.trips.filter((trip) => trip.at >= from);
  const sum = summarise(trips);
  const stats = store.captainStats;
  const offered = (stats?.offersAccepted ?? 0) + (stats?.offersRejected ?? 0) + (stats?.offersExpired ?? 0);
  const acceptance = offered ? Math.round((stats?.acceptanceRate ?? 0) * 100) : null;
  const rating = stats && stats.ratingCount ? stats.ratingAvg : 0;
  const missed = stats?.offersExpired ?? sum.missed;
  const cancelled = stats?.cancelled ?? sum.cancelled;

  const week = weekdays.map((label, index) => {
    const start = startOfWeek() + index * DAY_MS;
    const value = store.trips.filter((trip) => trip.at >= start && trip.at < start + DAY_MS).reduce((s, trip) => s + earned(trip), 0);
    return { label, value, today: start === startOfDay() };
  });
  const peak = Math.max(1, ...week.map((item) => item.value));

  return (
    <TabPage kicker="EARNINGS" title="Your earnings" right={<HeadButton icon="receipt-outline" label="All rides" onPress={() => navigation.navigate("Orders")} />}>
      <BannerCarousel
        style={{ marginBottom: 14 }}
        slides={[
          slide(art.earn, "EVERY RIDE COUNTS", "Fares, tips, and bonuses in one clear view"),
          slide(art.ride, "DAY PLAN", "The day fee is used on your first completed trip", "See plan", () => navigation.navigate("Incentives")),
          slide(art.auto, "WALLET", "Prepaid day fees come from your wallet. Cash and UPI fares stay with you", "Open wallet", () => navigation.navigate("Wallet")),
        ]}
      />
      <Chips items={[{ key: "today", label: "Today" }, { key: "week", label: "This week" }]} value={range} onChange={setRange} />

      <LinearGradient colors={[colors.burgundy, colors.plum, colors.inkwell]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[page.heroCard, { marginTop: 14 }]}>
        <Text style={page.kicker}>{range === "today" ? "EARNED TODAY" : "EARNED THIS WEEK"}</Text>
        <Text style={styles.total}>{inr(sum.total)}</Text>
        <Text style={page.lead}>
          {sum.done.length} order{sum.done.length === 1 ? "" : "s"} · {sum.km.toFixed(1)} km{range === "today" ? ` · ${Math.floor(store.loginMinutes / 60)}h ${store.loginMinutes % 60}m on duty` : ""}
        </Text>
        {range === "week" ? (
          <View style={styles.chart}>
            {week.map((item) => (
              <View key={item.label} style={styles.barCol}>
                <Text style={styles.barValue}>{item.value ? inr(item.value) : ""}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.bar, { height: `${Math.max(4, (item.value / peak) * 100)}%` }, item.today && styles.barToday]} />
                </View>
                <Text style={[styles.barLabel, item.today && { color: colors.gold }]}>{item.label}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </LinearGradient>

      <SectionTitle>BREAKDOWN</SectionTitle>
      <View style={page.card}>
        <Line label="Ride earnings" value={inr(sum.fares)} />
        <Line label="Bonuses and incentives" value={inr(sum.bonus)} />
        <Line label="Tips from passengers" value={inr(sum.tips)} />
        <View style={page.rule} />
        <Line label="Total" value={inr(sum.total)} strong />
        <Text style={page.small}>
          {(() => {
            const vehicle = store.captain?.vehicle === "auto" ? "auto" : "bike";
            const access = captainAccess(vehicle, store.ridePlan);
            return access.mode === "subscription"
              ? `You keep every fare. Your ${vehicle} plan is ₹${access.day} a day or ₹${access.month} a month.`
              : `Roveya keeps ${access.commissionPct}% of each fare.`;
          })()}
        </Text>
        <View style={page.rule} />
        <Line label="Cash collected" value={inr(sum.cash)} />
        <Line label="To wallet" value={inr(sum.total - sum.cash)} />
      </View>

      <SectionTitle>PERFORMANCE</SectionTitle>
      <View style={styles.grid}>
        <Metric icon="checkmark-done-outline" value={acceptance == null ? "—" : `${acceptance}%`} label="Acceptance" />
        <Metric icon="star-outline" value={rating ? rating.toFixed(2) : "—"} label="Rating" />
        <Metric icon="close-circle-outline" value={String(cancelled)} label="Cancelled" />
        <Metric icon="time-outline" value={String(missed)} label="Expired offers" />
      </View>

      <View style={styles.ordersHead}>
        <Text style={[page.kicker, { flex: 1 }]}>RIDES</Text>
        <Pressable onPress={() => navigation.navigate("Orders")} hitSlop={8}>
          <Text style={styles.seeAll}>See all ›</Text>
        </Pressable>
      </View>
      {trips.length ? (
        <View style={{ gap: 10 }}>
          {trips.slice(0, 6).map((trip) => (
            <TripCard key={`${trip.id}-${trip.at}`} trip={trip} onPress={() => navigation.navigate("OrderDetail", { id: trip.id })} />
          ))}
        </View>
      ) : (
        <Empty icon="speedometer-outline" title="No rides yet" line="Go on duty to start earning today." action="Go to duty" onAction={() => navigation.navigate("Duty")} />
      )}
    </TabPage>
  );
}

function Metric({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string }) {
  return (
    <View style={styles.metric}>
      <Ionicons name={icon} size={18} color={colors.gold} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={page.small}>{label}</Text>
    </View>
  );
}

export function TripCard({ trip, onPress }: { trip: Trip; onPress: () => void }) {
  const done = trip.status === "Completed";
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [page.card, styles.trip, pressed && { borderColor: colors.gold }]}>
      <View style={styles.tripHead}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={page.name}>
            {trip.customer} <Text style={styles.tripId}>· {trip.id}</Text>
          </Text>
          <Text style={page.small}>{when(trip.at)}</Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 5 }}>
          <Text style={[styles.tripFare, !done && { color: colors.faint }]}>{done ? inr(earned(trip)) : inr(0)}</Text>
          <Pill label={trip.status} tone={done ? "gold" : "muted"} />
        </View>
      </View>
      <View style={page.rule} />
      <RoutePair from={trip.pickup} to={trip.drop} />
      {!done && trip.reason ? <Text style={[page.small, { marginTop: 10 }]}>{trip.reason}</Text> : null}
    </Pressable>
  );
}

type Filter = "all" | "Completed" | "Cancelled" | "Missed";

export function OrdersScreen({ navigation }: NativeStackScreenProps<CaptainStack, "Orders">) {
  const store = useStore();
  const [filter, setFilter] = useState<Filter>("all");
  const list = filter === "all" ? store.trips : store.trips.filter((trip) => trip.status === filter);
  const count = (status: Filter) => store.trips.filter((trip) => trip.status === status).length;
  return (
    <PageShell kicker="EARNINGS" title="Ride history" onBack={() => navigation.goBack()}>
      <Chips
        items={[
          { key: "all", label: `All · ${store.trips.length}` },
          { key: "Completed", label: `Done · ${count("Completed")}` },
          { key: "Cancelled", label: `Cancelled · ${count("Cancelled")}` },
          { key: "Missed", label: `Missed · ${count("Missed")}` },
        ]}
        value={filter}
        onChange={setFilter}
      />
      <View style={{ marginTop: 14, gap: 10 }}>
        {list.length ? (
          list.map((trip) => <TripCard key={`${trip.id}-${trip.at}`} trip={trip} onPress={() => navigation.navigate("OrderDetail", { id: trip.id })} />)
        ) : (
          <Empty icon="receipt-outline" title="Nothing here" line="Rides in this list show up as you drive." />
        )}
      </View>
    </PageShell>
  );
}

export function OrderDetailScreen({ route, navigation }: NativeStackScreenProps<CaptainStack, "OrderDetail">) {
  const store = useStore();
  const trip = store.trips.find((item) => item.id === route.params.id);
  if (!trip) {
    return (
      <PageShell kicker="RIDE" title="Ride" onBack={() => navigation.goBack()}>
        <Empty icon="receipt-outline" title="Ride not found" line="This ride is no longer on this phone." />
      </PageShell>
    );
  }
  const done = trip.status === "Completed";
  return (
    <PageShell
      kicker="RIDE DETAILS"
      title={trip.id}
      onBack={() => navigation.goBack()}
      right={<HeadButton icon="share-outline" label="Share" onPress={() => void Share.share({ message: `ROVEYA ride ${trip.id} · ${trip.pickup} to ${trip.drop} · ${when(trip.at)} · Earned ${inr(earned(trip))}` }).catch(() => undefined)} />}
    >
      <LinearGradient colors={done ? [colors.burgundy, colors.plum, colors.inkwell] : [colors.plum, colors.inkwell]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={page.heroCard}>
        <Text style={page.kicker}>{done ? "YOU EARNED" : trip.status.toUpperCase()}</Text>
        <Text style={styles.total}>{inr(earned(trip))}</Text>
        <Text style={page.lead}>{done ? `${trip.payment === "online" ? "Paid online" : trip.payment === "upi" ? "Paid to you by UPI" : "Cash ride"} · ${vehicleTitle[trip.vehicle]}` : trip.reason ?? "No earnings on this ride"}</Text>
        <View style={styles.metaRow}>
          <MetaChip icon="calendar-outline" text={when(trip.at)} />
          {done ? <MetaChip icon="navigate-outline" text={`${trip.km.toFixed(1)} km`} /> : null}
          {done ? <MetaChip icon="time-outline" text={`${trip.minutes} min`} /> : null}
        </View>
      </LinearGradient>

      <SectionTitle>TRIP</SectionTitle>
      <View style={page.card}>
        <RoutePair from={trip.pickup} fromSub="Pickup" to={trip.drop} toSub="Drop" />
      </View>

      <SectionTitle>PASSENGER</SectionTitle>
      <View style={[page.card, styles.customer]}>
        <View style={styles.mark}>
          <Text style={styles.markText}>{trip.customer.charAt(0)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={page.name}>{trip.customer}</Text>
          <Text style={page.small}>{trip.ratingGiven ? `You rated ${trip.ratingGiven} stars` : "Not rated"}</Text>
        </View>
        {trip.ratingReceived ? (
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <Stars value={trip.ratingReceived} />
            <Text style={page.small}>Their rating</Text>
          </View>
        ) : null}
      </View>

      {done ? (
        <>
          <SectionTitle>EARNINGS</SectionTitle>
          <View style={page.card}>
            <Line label="Trip fare" value={inr(trip.fare)} />
            {trip.bonus ? <Line label="Ride bonus" value={inr(trip.bonus)} /> : null}
            {trip.tip ? <Line label="Tip" value={inr(trip.tip)} /> : null}
            <View style={page.rule} />
            <Line label="Total" value={inr(earned(trip))} strong />
            <Line label={trip.payment === "online" ? "Online fare, kept by you" : trip.payment === "upi" ? "Paid to you by UPI" : "Cash collected by you"} value={inr(trip.fare)} />
          </View>
        </>
      ) : null}

      <View style={page.note}>
        <Ionicons name="help-buoy-outline" size={16} color={colors.gold} />
        <Text style={page.noteText}>Fare looks wrong or a passenger left something behind? Open Help and call the captain desk with this ride ID.</Text>
      </View>
      <Pressable onPress={() => navigation.navigate("Help")} style={({ pressed }) => [page.action, { marginTop: 12 }, pressed && { borderColor: colors.gold }]}>
        <Ionicons name="help-buoy-outline" size={15} color={colors.gold} />
        <Text style={page.actionText}>Get help with this ride</Text>
      </Pressable>
    </PageShell>
  );
}

function MetaChip({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.meta}>
      <Ionicons name={icon} size={12} color={colors.gold} />
      <Text style={styles.metaText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  total: { marginTop: 6, color: colors.cream, fontFamily: type.labelStrong, fontSize: 40, lineHeight: 46 },
  chart: { marginTop: 16, flexDirection: "row", gap: 6, height: 150 },
  barCol: { flex: 1, alignItems: "center", gap: 4 },
  barValue: { color: colors.faint, fontFamily: type.label, fontSize: 9 },
  barTrack: { flex: 1, width: "100%", justifyContent: "flex-end", borderRadius: 8, backgroundColor: "rgba(18,6,13,0.45)" },
  bar: { width: "100%", borderRadius: 8, backgroundColor: "rgba(214,160,0,0.55)" },
  barToday: { backgroundColor: colors.gold },
  barLabel: { color: colors.muted, fontFamily: type.label, fontSize: 11 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { width: "48%", flexGrow: 1, padding: 14, borderRadius: 20, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, gap: 4 },
  metricValue: { marginTop: 4, color: colors.cream, fontFamily: type.labelStrong, fontSize: 20 },
  ordersHead: { marginTop: 24, marginBottom: 10, flexDirection: "row", alignItems: "center" },
  seeAll: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 13 },
  trip: { padding: 14 },
  tripHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  tripId: { color: colors.faint, fontFamily: type.label, fontSize: 12.5 },
  tripFare: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 17 },
  metaRow: { marginTop: 14, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  meta: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: "rgba(18,6,13,0.45)", borderWidth: 1, borderColor: colors.hairline },
  metaText: { color: colors.cream, fontFamily: type.label, fontSize: 12 },
  customer: { flexDirection: "row", alignItems: "center", gap: 12 },
  mark: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.goldBright, alignItems: "center", justifyContent: "center" },
  markText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 18 },
});
