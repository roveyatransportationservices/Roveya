import { useEffect, useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CarSeats } from "../components/CarSeats";
import { Button, Icon, Logo, SkeletonCard } from "../components/kit";
import { VerifyClock } from "../components/VerifyClock";
import { REQUIRED_DOCS } from "../docs";
import { clock, dayLabel, inr, route, shortDate } from "../format";
import { useLive } from "../hooks";
import { service } from "../service";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { CaptainStack, CaptainTabs } from "../navigation";

type Props = CompositeScreenProps<BottomTabScreenProps<CaptainTabs, "Home">, NativeStackScreenProps<CaptainStack>>;

const DESK = "tel:+919000000001";

export function HomeScreen({ navigation }: Props) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const profile = store.profile!;
  const active = profile.captain.status === "active";
  const [approving, setApproving] = useState(false);
  const trips = useLive(() => (active ? service.trips("upcoming") : Promise.resolve([])), active ? null : false);
  const payouts = useLive(() => (active ? service.payouts() : Promise.resolve(null)));
  const next = trips.data?.[0];
  const reloadTrips = trips.reload;
  const reloadPayouts = payouts.reload;

  useEffect(() => {
    if (!active) return;
    void reloadTrips();
    void reloadPayouts();
  }, [active, reloadTrips, reloadPayouts]);
  const { refresh: refreshProfile } = store;
  useEffect(() => {
    if (active) return;
    const timer = setInterval(() => void refreshProfile().catch(() => undefined), 8000);
    return () => clearInterval(timer);
  }, [active, refreshProfile]);
  const docsDone = REQUIRED_DOCS.filter((kind) => profile.documents.some((doc) => doc.kind === kind)).length;
  const first = profile.captain.name.split(" ")[0];
  const check = profile.verification;

  const refresh = () => {
    void store.refresh();
    void trips.reload(true);
    void payouts.reload();
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} refreshControl={<RefreshControl refreshing={trips.refreshing} onRefresh={refresh} tintColor={colors.gold} colors={[colors.gold]} />} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[colors.cherry, colors.night]} style={[styles.top, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
          <View style={styles.brandRow}>
            <Logo size={38} />
            <View style={{ flex: 1 }}>
              <Text style={styles.hello}>Hi, {first}</Text>
              <Text style={styles.code}>
                {profile.captain.captain_code} · {profile.car?.makeModel ?? "No car yet"}
              </Text>
            </View>
            <View style={[styles.status, active ? styles.statusOn : styles.statusReview]}>
              <View style={[styles.statusDot, { backgroundColor: active ? colors.success : colors.gold }]} />
              <Text style={styles.statusText}>{active ? "Approved" : "In review"}</Text>
            </View>
          </View>

          <View style={styles.stats}>
            <Pressable onPress={() => navigation.navigate("Tabs", { screen: "Earnings" })} style={styles.stat}>
              <Text style={styles.statLabel}>Wallet</Text>
              <Text style={styles.statValue}>{inr(payouts.data?.balance ?? profile.balance)}</Text>
            </Pressable>
            <View style={styles.statRule} />
            <Pressable onPress={() => navigation.navigate("PayoutPlan")} style={styles.stat}>
              <Text style={styles.statLabel}>{(payouts.data?.plan ?? profile.plan)?.cycle === "daily" ? "Daily payout" : (payouts.data?.plan ?? profile.plan)?.cycle === "monthly" ? "Monthly payout" : "Weekly payout"}</Text>
              <Text style={styles.statValue}>{(payouts.data?.plan ?? profile.plan) ? shortDate((payouts.data?.plan ?? profile.plan)!.periodEnd) : "—"}</Text>
            </Pressable>
            <View style={styles.statRule} />
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Rating</Text>
              <Text style={styles.statValue}>{Number(profile.captain.rating).toFixed(1)} ★</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={{ paddingHorizontal: 16, gap: 14, marginTop: -18 }}>
          {!active ? (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.cardIcon}>
                  <Icon name="mc:shield-search" size={22} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Your account is in review</Text>
                  <Text style={styles.cardLine}>The ROVEYA desk checks your documents and car within {check?.minutes ?? 45} minutes of registering. You can publish trips the second you are approved.</Text>
                </View>
              </View>
              {check ? <VerifyClock minutes={check.minutes} startedAt={Date.parse(check.startedAt)} dueAt={Date.parse(check.dueAt)} /> : null}
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${(docsDone / REQUIRED_DOCS.length) * 100}%` }]} />
              </View>
              <Text style={styles.cardSmall}>
                {docsDone} of {REQUIRED_DOCS.length} required documents added
              </Text>
              <Button label={docsDone < REQUIRED_DOCS.length ? "Add documents" : "View documents"} icon="mc:file-upload-outline" tone={docsDone < REQUIRED_DOCS.length ? "gold" : "ghost"} onPress={() => navigation.navigate("Documents")} />
              {service.approvePreview ? (
                <Button
                  label="Preview: approve my account"
                  tone="ghost"
                  loading={approving}
                  onPress={async () => {
                    setApproving(true);
                    store.setProfile(await service.approvePreview!());
                    setApproving(false);
                  }}
                />
              ) : (
                <Pressable onPress={() => void Linking.openURL(DESK)} style={styles.deskRow}>
                  <Icon name="mc:headset" size={16} />
                  <Text style={styles.deskText}>Questions? Call the captain desk, 5 AM to 11 PM</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <>
              <Pressable onPress={() => navigation.navigate("Publish")} style={({ pressed }) => [styles.publish, pressed && { opacity: 0.9 }]}>
                <View style={styles.publishIcon}>
                  <Icon name="mc:car-arrow-right" size={24} color={colors.night} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.publishTitle}>Publish a trip</Text>
                  <Text style={styles.publishLine}>Pick a route and time. Travellers book your seats.</Text>
                </View>
                <Icon name="chevron-forward" size={20} color={colors.night} />
              </Pressable>

              <Text style={styles.section}>NEXT TRIP</Text>
              {!trips.data ? (
                <SkeletonCard lines={4} />
              ) : next ? (
                <Pressable onPress={() => navigation.navigate("Trip", { id: next.id })} style={({ pressed }) => [styles.card, pressed && { borderColor: colors.gold }]}>
                  <View style={styles.tripHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tripDate}>{dayLabel(next.date).toUpperCase()}</Text>
                      <Text style={styles.tripRoute}>{route(next.fromId, next.toId)}</Text>
                      <Text style={styles.cardLine}>
                        Leaves {clock(next.departAt)} · {next.code}
                      </Text>
                    </View>
                    <View style={styles.bookedPill}>
                      <Text style={styles.bookedValue}>
                        {next.booked}/{next.seats.length}
                      </Text>
                      <Text style={styles.bookedLabel}>booked</Text>
                    </View>
                  </View>
                  <View style={{ transform: [{ scale: 0.82 }], marginVertical: -26 }}>
                    <CarSeats cells={next.seats.map((seat) => ({ ...seat, status: seat.state === "available" || seat.state === "female" ? "available" : "booked", gender: seat.state === "bookedFemale" ? "Female" : null, passenger: null }))} />
                  </View>
                  <View style={styles.tripFoot}>
                    <Text style={styles.cardSmall}>Seat fares so far</Text>
                    <Text style={styles.revenue}>{inr(next.revenue)}</Text>
                  </View>
                </Pressable>
              ) : (
                <View style={[styles.card, { alignItems: "center" }]}>
                  <Icon name="mc:calendar-blank-outline" size={36} />
                  <Text style={[styles.cardTitle, { marginTop: 10 }]}>No trips coming up</Text>
                  <Text style={[styles.cardLine, { textAlign: "center" }]}>Publish your next drive and the seats show up in the ROVEYA app within seconds.</Text>
                </View>
              )}
              {trips.error ? <Text style={styles.error}>{trips.error}</Text> : null}
            </>
          )}

          <Text style={styles.section}>GOOD TO KNOW</Text>
          <View style={styles.tips}>
            {[
              { icon: "mc:clock-check-outline" as const, title: "Be on time", line: "Reach the first boarding point 10 minutes early." },
              { icon: "mc:account-check-outline" as const, title: "Check every PNR", line: "Mark travellers boarded as they get in." },
              { icon: "mc:face-woman-outline" as const, title: "Women Zone", line: "Seats beside a woman are sold only to women." },
            ].map((tip) => (
              <View key={tip.title} style={styles.tip}>
                <Icon name={tip.icon} size={20} />
                <Text style={styles.tipTitle}>{tip.title}</Text>
                <Text style={styles.tipLine}>{tip.line}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  top: { paddingHorizontal: 16, paddingBottom: 36 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  hello: { color: colors.cream, fontFamily: type.semibold, fontSize: 18 },
  code: { marginTop: 1, color: colors.gold, fontFamily: type.medium, fontSize: 11.5 },
  status: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1 },
  statusOn: { backgroundColor: "rgba(127,199,154,0.12)", borderColor: "rgba(127,199,154,0.4)" },
  statusReview: { backgroundColor: "rgba(214,160,0,0.12)", borderColor: colors.line },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { color: colors.cream, fontFamily: type.medium, fontSize: 11.5 },
  stats: { flexDirection: "row", alignItems: "center", marginTop: 20, paddingVertical: 14, borderRadius: 18, backgroundColor: "rgba(18,6,13,0.45)", borderWidth: 1, borderColor: colors.line },
  stat: { flex: 1, alignItems: "center", gap: 3 },
  statLabel: { color: colors.faint, fontFamily: type.regular, fontSize: 11.5 },
  statValue: { color: colors.cream, fontFamily: type.semibold, fontSize: 16 },
  statRule: { width: 1, height: 30, backgroundColor: colors.line },
  card: { padding: 16, borderRadius: 20, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, gap: 12 },
  cardHead: { flexDirection: "row", gap: 12 },
  cardIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line },
  cardTitle: { color: colors.cream, fontFamily: type.semibold, fontSize: 16 },
  cardLine: { marginTop: 3, color: colors.muted, fontFamily: type.regular, fontSize: 12.5, lineHeight: 18 },
  cardSmall: { color: colors.faint, fontFamily: type.regular, fontSize: 12 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.mist, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.gold },
  deskRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  deskText: { color: colors.gold, fontFamily: type.medium, fontSize: 12.5 },
  publish: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 20, backgroundColor: colors.gold },
  publishIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(18,6,13,0.12)" },
  publishTitle: { color: colors.night, fontFamily: type.bold, fontSize: 16 },
  publishLine: { marginTop: 2, color: "rgba(18,6,13,0.72)", fontFamily: type.medium, fontSize: 12.5 },
  section: { marginTop: 6, color: colors.gold, fontFamily: type.semibold, fontSize: 11, letterSpacing: 2 },
  tripHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  tripDate: { color: colors.gold, fontFamily: type.semibold, fontSize: 10.5, letterSpacing: 1.5 },
  tripRoute: { marginTop: 4, color: colors.cream, fontFamily: type.semibold, fontSize: 17 },
  bookedPill: { alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line },
  bookedValue: { color: colors.gold, fontFamily: type.bold, fontSize: 18 },
  bookedLabel: { color: colors.faint, fontFamily: type.regular, fontSize: 10.5 },
  tripFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.hairline },
  revenue: { color: colors.gold, fontFamily: type.bold, fontSize: 18 },
  error: { color: colors.danger, fontFamily: type.regular, fontSize: 12.5 },
  tips: { flexDirection: "row", gap: 10 },
  tip: { flex: 1, padding: 12, borderRadius: 16, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, gap: 5 },
  tipTitle: { color: colors.cream, fontFamily: type.semibold, fontSize: 12.5 },
  tipLine: { color: colors.muted, fontFamily: type.regular, fontSize: 11, lineHeight: 15 },
});
