import { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Alert, Animated, Easing, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import { useIsFocused } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as Location from "expo-location";
import { api, live, watch } from "../backend";
import { jobFromServer, orderFromServer, type ServerOffer, type ServerTrip } from "../remote";
import { BannerCarousel } from "../components/BannerCarousel";
import { DragSheet } from "../components/DragSheet";
import { art, slide } from "../banners";
import { DutyMap } from "../components/DutyMap";
import { Toggle } from "../components/PageShell";
import { SwipeButton } from "../components/SwipeButton";
import { demandZones, home, vehicleTitle } from "../data";
import { distanceKm, inr } from "../geo";
import { captainAccess } from "../ridePlan";
import { dailyTargets, earned, inPeak, nextTarget, startOfDay } from "../orders";
import { useStore } from "../store";
import { startDutyTracking, stopDutyTracking, type TrackingMode } from "../tracking";
import { colors, type } from "../theme";
import type { CaptainStack, CaptainTabs } from "../navigation";
import type { Order } from "../types";

type Props = CompositeScreenProps<BottomTabScreenProps<CaptainTabs, "Duty">, NativeStackScreenProps<CaptainStack>>;

// The phone's GPS when it is allowed, otherwise the demo base in Banjara Hills.
async function locate() {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.granted) {
      const position = await Location.getCurrentPositionAsync({});
      return { latitude: position.coords.latitude, longitude: position.coords.longitude };
    }
  } catch {
    return { latitude: home.latitude, longitude: home.longitude };
  }
  return { latitude: home.latitude, longitude: home.longitude };
}

const OFFER_SECONDS = 20;
const CONSENT_KEY = "roveya-captain-background-ok";

// Google Play asks for this notice before the app requests background location.
async function backgroundConsent() {
  if (Platform.OS === "web") return false;
  if ((await AsyncStorage.getItem(CONSENT_KEY)) === "yes") return true;
  const agreed = await new Promise<boolean>((resolve) =>
    Alert.alert(
      "Location while on duty",
      "ROVEYA Captain collects your location to match you with nearby ride requests, even when the app is closed or not in use. It only runs while you are on duty and stops when you go off duty.",
      [
        { text: "Not now", style: "cancel", onPress: () => resolve(false) },
        { text: "Continue", onPress: () => resolve(true) },
      ],
    ),
  );
  if (agreed) await AsyncStorage.setItem(CONSENT_KEY, "yes");
  return agreed;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function hours(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function clockSince(since: number | null) {
  if (!since) return "0:00";
  const seconds = Math.floor((Date.now() - since) / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export function DutyScreen({ navigation }: Props) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const captain = store.captain!;
  const [sheetHeight, setSheetHeight] = useState(320);
  const [collapsed, setCollapsed] = useState(false);
  const [recenter, setRecenter] = useState(0);
  const [toast, setToast] = useState("");
  const [, tick] = useState(0);

  const today = store.trips.filter((trip) => trip.at >= startOfDay());
  const done = today.filter((trip) => trip.status === "Completed");
  const todayEarned = done.reduce((sum, trip) => sum + earned(trip), 0);
  const target = nextTarget(dailyTargets, done.length);
  const peak = inPeak();
  const hot = [...demandZones].filter((zone) => zone.level === "High").sort((a, b) => distanceKm(home, a) - distanceKm(home, b))[0];

  useEffect(() => {
    if (!store.online) return;
    const timer = setInterval(() => tick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [store.online]);

  const offerRef = useRef(store.offer);
  offerRef.current = store.offer;

  useEffect(() => {
    if (!live || !store.online || store.job) return;
    let stopped = false;
    const pull = async () => {
      const result = await api<{ offer: ServerOffer | null }>("/captain/offers/current").catch(() => null);
      if (stopped || !result) return;
      if (!result.offer) {
        const assigned = await api<{ trip: ServerTrip | null }>("/captain/trips/current").catch(() => null);
        if (!stopped && assigned?.trip) {
          store.adoptJob(jobFromServer(assigned.trip));
          return;
        }
      }
      if (result.offer && result.offer.id !== offerRef.current?.offerId) store.pushOffer(orderFromServer(result.offer));
      if (!result.offer && offerRef.current) store.reject("Withdrawn");
    };
    void pull();
    const timer = setInterval(() => void pull(), 3000);
    const unwatch = watch("trip_offers", `status=eq.offered`, () => void pull());
    return () => {
      stopped = true;
      clearInterval(timer);
      unwatch();
    };
  }, [store.online, store.job?.id]);

  const [me, setMe] = useState({ latitude: home.latitude, longitude: home.longitude });
  const [tracking, setTracking] = useState<TrackingMode>("off");

  // The map follows the phone; without "allow all the time" this screen also sends the heartbeat.
  useEffect(() => {
    if (!live || !store.online) return;
    if (Platform.OS === "web") {
      const beat = () =>
        void locate().then((spot) => {
          setMe(spot);
          return api("/captain/location", { body: { ...spot, heading: 0 } }).catch(() => undefined);
        });
      const timer = setInterval(beat, 10000);
      return () => clearInterval(timer);
    }
    let stopped = false;
    let lastBeat = 0;
    let subscription: Location.LocationSubscription | null = null;
    void Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 15 }, (position) => {
      const spot = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setMe(spot);
      if (tracking !== "background" && Date.now() - lastBeat > 10000) {
        lastBeat = Date.now();
        const heading = position.coords.heading ?? 0;
        void api("/captain/location", { body: { ...spot, heading: heading >= 0 && heading <= 360 ? heading : 0 } }).catch(() => undefined);
      }
    })
      .then((sub) => {
        if (stopped) sub.remove();
        else subscription = sub;
      })
      .catch(() => undefined);
    return () => {
      stopped = true;
      subscription?.remove();
    };
  }, [store.online, tracking]);

  const acceptLive = async () => {
    const offer = store.offer;
    if (!offer) return;
    if (!live || !offer.offerId) return store.accept();
    try {
      await api(`/captain/offers/${offer.offerId}/accept`, { method: "POST" });
      store.accept();
    } catch (error) {
      store.reject("Missed");
      setToast(error instanceof Error ? error.message : "This ride request is no longer available.");
    }
  };

  const rejectLive = (reason: string) => {
    const offer = store.offer;
    if (live && offer?.offerId) void api(`/captain/offers/${offer.offerId}/reject`, { method: "POST", body: { reason } }).catch(() => undefined);
    store.reject(reason);
  };

  const goOffline = () => {
    if (live) void api("/captain/duty", { body: { online: false } }).catch(() => undefined);
    void stopDutyTracking();
    setTracking("off");
    store.setOnline(false);
  };

  useEffect(() => {
    if (store.job && focused) navigation.navigate("Job");
  }, [store.job?.id]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const goOnline = async () => {
    if (store.captain?.status === "suspended") {
      setToast("This account is suspended. The desk has to turn it back on.");
      return;
    }
    if (!store.canDuty()) {
      setToast(store.dutyLine());
      return;
    }
    let mode: TrackingMode = "foreground";
    if (live) {
      try {
        const spot = await locate();
        const duty = await api<{ dayCharge?: { amount: number } | null; balancePaise?: number; feePaise?: number; requiredPaise?: number; feePaidToday?: boolean; rechargeAvailable?: boolean }>("/captain/duty", {
          body: { online: true, ...spot, autoAccept: store.autoAccept },
        });
        setMe(spot);
        if (duty.dayCharge) store.payForToday();
      } catch (error) {
        const err = error as Error & { balancePaise?: number; feePaise?: number; requiredPaise?: number; rechargeAvailable?: boolean };
        const message = err instanceof Error ? err.message : "We could not put you on duty. Try again.";
        if (/Insufficient wallet balance/i.test(message)) {
          const balance = typeof err.balancePaise === "number" ? inr(err.balancePaise / 100) : null;
          const fee = typeof err.feePaise === "number" ? inr(err.feePaise / 100) : null;
          const need = typeof err.requiredPaise === "number" ? inr(err.requiredPaise / 100) : null;
          const detail = [balance ? `Balance ${balance}` : null, fee ? `Today's fee ${fee}` : null, need ? `Need ${need} more` : null, "Wallet recharge is not available in this build yet."]
            .filter(Boolean)
            .join(". ");
          setToast(`${message} ${detail}`);
        } else {
          setToast(message);
        }
        return;
      }
      if (await backgroundConsent()) mode = await startDutyTracking().catch(() => "foreground" as const);
      setTracking(mode);
    }
    store.setOnline(true);
    setToast(mode === "background" || !live ? "You are on duty. Ride requests near you appear here." : "On duty. Allow location all the time to get requests with the screen off.");
  };

  const visibleSheet = collapsed ? 110 : sheetHeight;

  return (
    <View style={styles.screen}>
      <DutyMap me={me} kind={captain.vehicle} online={store.online} target={store.offer?.pickup ?? null} padBottom={store.offer ? 440 : visibleSheet} recenter={recenter} />

      <View style={[styles.top, { paddingTop: Math.max(insets.top, 12) + 6 }]} pointerEvents="box-none">
        <Pressable accessibilityRole="button" accessibilityLabel="Profile" onPress={() => navigation.navigate("Account")} style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(captain.name)}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: store.online }}
          accessibilityLabel={store.online ? "Go off duty" : "Go on duty"}
          onPress={() => (store.online ? goOffline() : void goOnline())}
          style={[styles.duty, store.online && styles.dutyOn]}
        >
          <View style={[styles.dutyDot, store.online && styles.dutyDotOn]} />
          <Text style={[styles.dutyText, store.online && { color: colors.night }]}>{store.online ? "ON DUTY" : "OFF DUTY"}</Text>
          <View style={[styles.dutyKnob, store.online && styles.dutyKnobOn]} />
        </Pressable>
      </View>

      {toast ? (
        <View style={[styles.toast, { top: Math.max(insets.top, 12) + 64 }]}>
          <Ionicons name="information-circle" size={16} color={colors.gold} />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      {!store.offer ? (
        <Pressable accessibilityLabel="Recenter map" onPress={() => setRecenter((value) => value + 1)} style={[styles.recenter, { bottom: visibleSheet + 14 }]}>
          <Ionicons name="locate" size={20} color={colors.gold} />
        </Pressable>
      ) : null}

      {!store.offer ? (
        <DragSheet peek={110} onSnap={setCollapsed} onHeight={setSheetHeight}>
          {store.job ? (
            <>
              <Text style={styles.kicker}>RIDE IN PROGRESS</Text>
              <Text style={styles.title}>{store.job.customer.name} · {store.job.pickup.name}</Text>
              <SwipeButton label="Open ride" icon="navigate" onDone={() => navigation.navigate("Job")} />
            </>
          ) : store.online ? (
            <>
              <View style={styles.headRow}>
                <Text style={styles.kicker}>ON DUTY · {clockSince(store.onlineSince)}</Text>
                <Text style={styles.service}>{vehicleTitle[captain.vehicle].toUpperCase()}</Text>
              </View>
              <Text style={styles.title}>Finding ride requests near you</Text>
              <SearchBar />
              <Stats earned={todayEarned} orders={done.length} minutes={store.loginMinutes} />
              <PlanLine />
              {target ? (
                <Pressable onPress={() => navigation.navigate("Incentives")} style={styles.target}>
                  <Ionicons name="trophy" size={16} color={colors.gold} />
                  <Text style={styles.targetText}>
                    <Text style={styles.targetStrong}>{target.orders - done.length} more</Text> for the {inr(target.reward)} daily incentive
                  </Text>
                  <Ionicons name="chevron-forward" size={15} color={colors.faint} />
                </Pressable>
              ) : null}
              <View style={styles.autoRow}>
                <View style={styles.autoIcon}>
                  <Ionicons name="flash" size={15} color={colors.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.autoTitle}>Auto accept</Text>
                  <Text style={styles.autoSub}>{store.autoAccept ? "New ride requests are accepted for you" : "Accept each ride request yourself"}</Text>
                </View>
                <Toggle
                  on={store.autoAccept}
                  label="Auto accept"
                  onChange={(next) => {
                    store.setAutoAccept(next);
                    if (live) void locate().then((spot) => api("/captain/duty", { body: { online: true, ...spot, autoAccept: next } }).catch(() => undefined));
                  }}
                />
              </View>
              {hot ? (
                <Text style={styles.hint}>
                  <Text style={{ color: colors.gold }}>Busy area</Text> near {hot.name} · {distanceKm(home, hot).toFixed(1)} km
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <BannerCarousel
                height={96}
                slides={[
                  slide(art.ride, "YOUR PLAN", "The day fee is charged once, the first time you go on duty", "See plan", () => navigation.navigate("Incentives")),
                  slide(art.earn, "PAYOUTS", "Redeem on Monday and Thursday, from ₹100", "Open wallet", () => navigation.navigate("Wallet")),
                  slide(art.cab, "FIVE-STAR SERVICE", "Courtesy on every trip builds your rating", "My ratings", () => navigation.navigate("Ratings")),
                ]}
              />
              <Text style={styles.kicker}>YOU ARE OFF DUTY</Text>
              <Text style={styles.title}>Go on duty to get ride requests</Text>
              <Stats earned={todayEarned} orders={done.length} minutes={store.loginMinutes} />
              <PlanLine />
              <SwipeButton label="Swipe to go on duty" icon="power" onDone={() => void goOnline()} />
              <Text style={styles.hint}>Rush hour does not change the passenger price.</Text>
            </>
          )}
        </DragSheet>
      ) : null}

      {store.offer ? <OfferCard key={store.offer.id} order={store.offer} bottom={insets.bottom} onAccept={() => void acceptLive()} onReject={() => rejectLive("Rejected")} onTimeout={() => {
        rejectLive("Missed");
        setToast("Ride request missed. It has gone to the next captain.");
      }} /> : null}
    </View>
  );
}

function PlanLine() {
  const store = useStore();
  const vehicle = store.captain?.vehicle === "auto" ? "auto" : "bike";
  const access = captainAccess(vehicle, store.ridePlan);
  const text = access.mode === "subscription" ? store.dutyLine() : `Roveya keeps ${access.commissionPct}% of each fare.`;
  return <Text style={styles.hint}>{text}</Text>;
}

function Stats({ earned: total, orders, minutes }: { earned: number; orders: number; minutes: number }) {
  return (
    <View style={styles.stats}>
      <View style={styles.stat}>
        <Text style={styles.statValue}>{inr(total)}</Text>
        <Text style={styles.statLabel}>Today</Text>
      </View>
      <View style={styles.statLine} />
      <View style={styles.stat}>
        <Text style={styles.statValue}>{orders}</Text>
        <Text style={styles.statLabel}>Rides</Text>
      </View>
      <View style={styles.statLine} />
      <View style={styles.stat}>
        <Text style={styles.statValue}>{hours(minutes)}</Text>
        <Text style={styles.statLabel}>On duty</Text>
      </View>
    </View>
  );
}

function SearchBar() {
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== "web" }));
    loop.start();
    return () => loop.stop();
  }, [sweep]);
  return (
    <View style={styles.bar}>
      <Animated.View style={[styles.barFill, { transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-120, 360] }) }] }]} />
    </View>
  );
}

function OfferCard({ order, bottom, onAccept, onReject, onTimeout }: { order: Order; bottom: number; onAccept: () => void; onReject: () => void; onTimeout: () => void }) {
  const windowSeconds = order.seconds && order.seconds > 0 ? order.seconds : OFFER_SECONDS;
  const left = useRef(new Animated.Value(1)).current;
  const [seconds, setSeconds] = useState(windowSeconds);
  const timeoutRef = useRef(onTimeout);
  timeoutRef.current = onTimeout;

  useEffect(() => {
    Animated.timing(left, { toValue: 0, duration: windowSeconds * 1000, easing: Easing.linear, useNativeDriver: false }).start();
    const timer = setInterval(() => setSeconds((value) => value - 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (seconds <= 0) timeoutRef.current();
  }, [seconds]);

  return (
    <View style={[styles.offer, { paddingBottom: Math.max(bottom, 12) + 4 }]}>
      <View style={styles.offerTimer}>
        <Animated.View style={[styles.offerTimerFill, { width: left.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
      </View>
      <View style={styles.offerHead}>
        <View style={styles.newChip}>
          <View style={styles.newDot} />
          <Text style={styles.newText}>NEW RIDE REQUEST</Text>
        </View>
        <Text style={styles.offerSeconds}>{Math.max(0, seconds)}s</Text>
      </View>

      <View style={styles.offerMoney}>
        <View>
          <Text style={styles.offerFare}>{inr(order.fare + order.bonus)}</Text>
          <Text style={styles.offerSub}>
            {order.bonus ? `Includes ${inr(order.bonus)} bonus · ` : ""}
            {order.payment === "online" ? "Online payment" : order.payment === "upi" ? "UPI to you" : "Cash ride"}
          </Text>
        </View>
        <View style={styles.offerKind}>
          <Ionicons name={order.vehicle === "bike" ? "bicycle" : "car"} size={15} color={colors.night} />
          <Text style={styles.offerKindText}>{vehicleTitle[order.vehicle]}</Text>
        </View>
      </View>

      <View style={styles.offerRoute}>
        <View style={styles.rail}>
          <View style={styles.dotFrom} />
          <View style={styles.railLine} />
          <View style={styles.dotTo} />
        </View>
        <View style={{ flex: 1, gap: 14 }}>
          <View>
            <Text style={styles.legMeta}>PICKUP · {order.pickupKm.toFixed(1)} KM · {order.pickupMin} MIN AWAY · UNPAID</Text>
            <Text style={styles.legName} numberOfLines={1}>{order.pickup.name}</Text>
            <Text style={styles.legSub} numberOfLines={1}>{order.pickup.subtitle}</Text>
          </View>
          <View>
            <Text style={styles.legMeta}>DROP · {order.tripKm.toFixed(1)} KM TRIP · {order.tripMin} MIN</Text>
            <Text style={styles.legName} numberOfLines={1}>{order.drop.name}</Text>
            <Text style={styles.legSub} numberOfLines={1}>{order.drop.subtitle}</Text>
          </View>
        </View>
      </View>

      <View style={styles.customer}>
        <View style={styles.customerMark}>
          <Text style={styles.customerLetter}>{order.customer.name.charAt(0)}</Text>
        </View>
        <Text style={styles.customerName}>{order.customer.name}</Text>
        <Ionicons name="star" size={12} color={colors.gold} />
        <Text style={styles.customerMeta}>{order.customer.rating.toFixed(1)} · {order.customer.rides} rides</Text>
      </View>

      <View style={styles.offerActions}>
        <Pressable accessibilityRole="button" onPress={onReject} style={({ pressed }) => [styles.reject, pressed && { borderColor: colors.gold }]}>
          <Ionicons name="close" size={20} color={colors.cream} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <SwipeButton label="Swipe to accept" onDone={onAccept} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  top: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.plum, borderWidth: 1.5, borderColor: colors.gold, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 14 },
  duty: { flex: 1, height: 46, borderRadius: 23, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 5, gap: 8, shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 10, elevation: 8 },
  dutyOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  dutyDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.faint },
  dutyDotOn: { backgroundColor: colors.night },
  dutyText: { flex: 1, color: colors.cream, fontFamily: type.labelStrong, fontSize: 14, letterSpacing: 1.6 },
  dutyKnob: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.plum, borderWidth: 1, borderColor: colors.line },
  dutyKnobOn: { backgroundColor: colors.night, borderColor: colors.night },
  sos: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  toast: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 16, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.gold },
  toastText: { flex: 1, color: colors.cream, fontFamily: type.label, fontSize: 13 },
  recenter: { position: "absolute", right: 16, width: 46, height: 46, borderRadius: 23, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  kicker: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 10, letterSpacing: 2.4 },
  service: { color: colors.faint, fontFamily: type.labelStrong, fontSize: 10, letterSpacing: 1.6 },
  title: { color: colors.cream, fontFamily: type.display, fontSize: 21, lineHeight: 26, letterSpacing: -0.3 },
  bar: { height: 3, borderRadius: 2, backgroundColor: "rgba(246,241,220,0.1)", overflow: "hidden" },
  barFill: { width: 120, height: 3, borderRadius: 2, backgroundColor: colors.gold },
  stats: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderRadius: 18, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.hairline },
  stat: { flex: 1, alignItems: "center" },
  statValue: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 17 },
  statLabel: { marginTop: 2, color: colors.faint, fontFamily: type.label, fontSize: 11.5 },
  statLine: { width: 1, height: 28, backgroundColor: colors.line },
  target: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 16, backgroundColor: "rgba(214,160,0,0.08)", borderWidth: 1, borderColor: colors.line },
  targetText: { flex: 1, color: colors.muted, fontFamily: type.body, fontSize: 13 },
  targetStrong: { color: colors.cream, fontFamily: type.labelStrong },
  autoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  autoIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  autoTitle: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 14.5 },
  autoSub: { color: colors.faint, fontFamily: type.body, fontSize: 12 },
  hint: { textAlign: "center", color: colors.faint, fontFamily: type.body, fontSize: 12 },
  offer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 0, backgroundColor: colors.inkwell, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderTopWidth: 1, borderColor: colors.gold, overflow: "hidden", gap: 14, shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 20, elevation: 20 },
  offerTimer: { height: 4, marginHorizontal: -16, backgroundColor: "rgba(246,241,220,0.08)" },
  offerTimerFill: { height: 4, backgroundColor: colors.gold },
  offerHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  newChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: "rgba(214,160,0,0.14)", borderWidth: 1, borderColor: colors.line },
  newDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.gold },
  newText: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 10.5, letterSpacing: 1.8 },
  offerSeconds: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15 },
  offerMoney: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  offerFare: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 38, lineHeight: 44 },
  offerSub: { color: colors.muted, fontFamily: type.body, fontSize: 12.5 },
  offerKind: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: colors.gold },
  offerKindText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 13 },
  offerRoute: { flexDirection: "row", gap: 12, padding: 14, borderRadius: 20, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.hairline },
  rail: { width: 12, alignItems: "center", paddingTop: 18, paddingBottom: 26 },
  dotFrom: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.gold },
  railLine: { flex: 1, width: 1.5, marginVertical: 3, backgroundColor: colors.line },
  dotTo: { width: 10, height: 10, borderRadius: 2, backgroundColor: colors.burgundy, borderWidth: 1.5, borderColor: colors.goldBright },
  legMeta: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 10, letterSpacing: 1.2 },
  legName: { marginTop: 3, color: colors.cream, fontFamily: type.labelStrong, fontSize: 16 },
  legSub: { color: colors.faint, fontFamily: type.body, fontSize: 12.5 },
  customer: { flexDirection: "row", alignItems: "center", gap: 6 },
  customerMark: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.goldBright, alignItems: "center", justifyContent: "center", marginRight: 4 },
  customerLetter: { color: colors.night, fontFamily: type.labelStrong, fontSize: 13 },
  customerName: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 14, marginRight: 4 },
  customerMeta: { color: colors.muted, fontFamily: type.body, fontSize: 12.5 },
  offerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  reject: { width: 58, height: 58, borderRadius: 29, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, alignItems: "center", justifyContent: "center" },
});
