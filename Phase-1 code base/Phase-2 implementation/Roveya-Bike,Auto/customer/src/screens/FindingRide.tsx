import { useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Animated, BackHandler, Easing, Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, live } from "../backend";
import { DragSheet } from "../components/DragSheet";
import { RouteMap } from "../components/RouteMap";
import { vehicleCopy } from "../data";
import { converge, spawn, vehiclePhotos } from "../fleet";
import { inr } from "../geo";
import { roadRoute, type RoadRoute } from "../routing";
import { colors, type } from "../theme";
import type { ActiveTrip } from "../types";

const cancelReasons = ["Plans changed", "Booked by mistake", "Waiting too long", "Fare is higher than expected", "Found another ride"];

function messages(count: number) {
  return [
    count ? `Sending your request to ${count} ${count === 1 ? "captain" : "captains"} nearby` : "Sending your request to captains nearby",
    "Captains are checking your pickup point",
    "Matching you with the nearest captain",
  ];
}

function SearchBar() {
  const [width, setWidth] = useState(0);
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== "web" }));
    loop.start();
    return () => loop.stop();
  }, [sweep]);
  const segment = width * 0.36;
  const translateX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-segment, width] });
  return (
    <View style={styles.track} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width ? <Animated.View style={[styles.sweep, { width: segment, transform: [{ translateX }] }]} /> : null}
    </View>
  );
}

export function FindingRide({ trip, onCancel }: { trip: ActiveTrip; onCancel: () => void }) {
  const insets = useSafeAreaInsets();
  const [road, setRoad] = useState<RoadRoute | null>(null);
  const [fleet, setFleet] = useState(() => (live ? [] : spawn(trip.pickup).filter((pin) => pin.kind === trip.vehicle)));
  const [seconds, setSeconds] = useState(0);
  const [sheetHeight, setSheetHeight] = useState(320);
  const [collapsed, setCollapsed] = useState(false);
  const [recenter, setRecenter] = useState(0);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    roadRoute(trip.pickup, trip.drop, controller.signal).then((result) => {
      if (!controller.signal.aborted) setRoad(result);
    });
    return () => controller.abort();
  }, [trip.pickup, trip.drop]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((value) => value + 1);
    }, 1000);
    const moving = live ? undefined : setInterval(() => setFleet((pins) => converge(pins, trip.pickup)), 3000);
    return () => {
      clearInterval(timer);
      clearInterval(moving);
    };
  }, [trip.pickup]);

  // Live: real captains of this ride type on duty near the pickup, refreshed every 10 seconds.
  useEffect(() => {
    if (!live) return;
    const load = () =>
      void api<{ captains: { latitude: number; longitude: number; heading: number }[] }>(
        `/${trip.vehicle}/captains/nearby?lat=${trip.pickup.latitude}&lng=${trip.pickup.longitude}`,
        { method: "GET" },
      )
        .then((result) => setFleet(result.captains.map((pin, index) => ({ id: `live-${index}`, kind: trip.vehicle, latitude: pin.latitude, longitude: pin.longitude, heading: pin.heading }))))
        .catch(() => undefined);
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [trip.vehicle, trip.pickup.latitude, trip.pickup.longitude]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setCancelling((value) => !value);
      return true;
    });
    return () => sub.remove();
  }, []);

  const lines = useMemo(() => messages(fleet.length), [fleet.length]);
  const line = lines[Math.floor(seconds / 4) % lines.length];
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const title = vehicleCopy[trip.vehicle].title;
  const visibleSheet = collapsed ? 150 : sheetHeight;

  return (
    <View style={styles.screen}>
      <View style={styles.mapArea}>
        <RouteMap
          pickup={trip.pickup}
          drop={trip.drop}
          pickupLabel={trip.pickup.name}
          dropLabel={trip.drop.name}
          route={road?.coords ?? null}
          captains={fleet}
          padTop={Math.max(insets.top, 12) + 70}
          padBottom={visibleSheet + 24}
          recenter={recenter}
          mode="search"
          onEdit={() => undefined}
        />

        <View style={[styles.top, { paddingTop: Math.max(insets.top, 12) + 6 }]} pointerEvents="box-none">
          <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => setCancelling(true)} style={({ pressed }) => [styles.circle, pressed && { backgroundColor: colors.plum }]}>
            <Ionicons name="arrow-back" size={18} color={colors.cream} />
          </Pressable>
          <View style={styles.chip}>
            <View style={styles.liveDot} />
            <Text style={styles.chipText}>Searching</Text>
            <View style={styles.chipDot} />
            <Text style={styles.chipClock}>{clock}</Text>
          </View>
        </View>

        {cancelling ? null : (
          <Pressable accessibilityLabel="Recenter map" onPress={() => setRecenter((value) => value + 1)} style={[styles.recenter, { bottom: visibleSheet + 14 }]}>
            <Ionicons name="locate" size={20} color={colors.gold} />
          </Pressable>
        )}

        <DragSheet peek={150} onSnap={setCollapsed} onHeight={setSheetHeight}>
          <View style={styles.sheetHead}>
            <Text style={styles.kicker}>FINDING YOUR RIDE</Text>
            <Text style={styles.nearby}>
              <Text style={{ color: colors.gold }}>{fleet.length}</Text> {title.toLowerCase()} {fleet.length === 1 ? "captain" : "captains"} nearby
            </Text>
          </View>
          <View style={{ gap: 4 }}>
            <Text style={styles.title}>Looking for a {title} captain</Text>
            <Text style={styles.message} numberOfLines={1}>{line}</Text>
          </View>
          <SearchBar />

          <View style={styles.card}>
            <View style={styles.stop}>
              <View style={styles.pickDot} />
              <View style={styles.stopText}>
                <Text style={styles.stopLabel}>PICKUP</Text>
                <Text style={styles.stopName} numberOfLines={1}>{trip.pickup.name}</Text>
              </View>
            </View>
            <View style={styles.connector} />
            <View style={styles.stop}>
              <View style={styles.dropPin}>
                <View style={styles.dropCore} />
              </View>
              <View style={styles.stopText}>
                <Text style={styles.stopLabel}>DROP</Text>
                <Text style={styles.stopName} numberOfLines={1}>{trip.drop.name}</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.ride}>
              <Image source={vehiclePhotos[trip.vehicle]} style={styles.photo} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rideName}>{title}</Text>
                <Text style={styles.rideSub} numberOfLines={1}>
                  {trip.distanceKm < 10 ? trip.distanceKm.toFixed(1) : Math.round(trip.distanceKm)} km · {trip.id}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 2 }}>
                <Text style={styles.rideFare}>{inr(trip.fare)}</Text>
                <View style={styles.payRow}>
                  <Ionicons name={trip.payment === "cash" ? "cash-outline" : "wallet-outline"} size={12} color={colors.muted} />
                  <Text style={styles.payText}>{trip.payment === "cash" ? "Cash" : "Wallet"}</Text>
                </View>
              </View>
            </View>
          </View>
        </DragSheet>
      </View>

      <View style={styles.footer}>
        {cancelling ? (
          <>
            <Text style={styles.askTitle}>Why do you want to cancel?</Text>
            <View style={styles.reasons}>
              {cancelReasons.map((reason) => (
                <Pressable key={reason} onPress={onCancel} style={({ pressed }) => [styles.reason, pressed && { borderColor: colors.gold }]}>
                  <Text style={styles.reasonText}>{reason}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => setCancelling(false)} style={({ pressed }) => [styles.keep, pressed && { opacity: 0.9 }]}>
              <Text style={styles.keepText}>Keep searching</Text>
            </Pressable>
          </>
        ) : (
          <Pressable onPress={() => setCancelling(true)} style={({ pressed }) => [styles.cancel, pressed && { backgroundColor: colors.plum }]}>
            <Ionicons name="close" size={17} color={colors.cream} />
            <Text style={styles.cancelText}>Cancel search</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  mapArea: { flex: 1, overflow: "hidden" },
  top: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  circle: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 7, height: 36, paddingHorizontal: 13, borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold, shadowColor: colors.gold, shadowOpacity: 0.9, shadowRadius: 6 },
  chipText: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 13 },
  chipDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.faint },
  chipClock: { color: colors.muted, fontFamily: type.label, fontSize: 12.5, minWidth: 30 },
  recenter: { position: "absolute", right: 14, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  kicker: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 10, letterSpacing: 2.4 },
  nearby: { color: colors.faint, fontFamily: type.label, fontSize: 12 },
  title: { color: colors.cream, fontFamily: type.display, fontSize: 20, letterSpacing: -0.3 },
  message: { color: colors.muted, fontFamily: type.body, fontSize: 13, overflow: "hidden" },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.hairline, overflow: "hidden", marginTop: 2 },
  sweep: { height: 4, borderRadius: 2, backgroundColor: colors.gold },
  card: { marginTop: 2, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 18, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.hairline },
  divider: { height: 1, backgroundColor: colors.hairline, marginVertical: 10 },
  stop: { flexDirection: "row", alignItems: "center", gap: 12 },
  stopText: { flex: 1, minWidth: 0 },
  stopLabel: { color: colors.faint, fontFamily: type.labelStrong, fontSize: 9.5, letterSpacing: 1.6 },
  stopName: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 14.5, marginTop: 1, overflow: "hidden" },
  pickDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.gold, borderWidth: 2.5, borderColor: colors.cream, marginHorizontal: 2 },
  connector: { width: 0, height: 10, marginLeft: 8.5, marginVertical: 2, borderLeftWidth: 1.5, borderColor: colors.faint, borderStyle: "dashed" },
  dropPin: { width: 18, height: 18, borderRadius: 9, borderBottomLeftRadius: 0, backgroundColor: colors.burgundy, borderWidth: 2, borderColor: colors.goldBright, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-45deg" }] },
  dropCore: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.cream },
  ride: { flexDirection: "row", alignItems: "center", gap: 12 },
  photo: { width: 48, height: 38, borderRadius: 9 },
  rideName: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15.5 },
  rideSub: { color: colors.faint, fontFamily: type.body, fontSize: 12.5, marginTop: 2, overflow: "hidden" },
  rideFare: { color: colors.gold, fontFamily: type.bold, fontSize: 17 },
  payRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  payText: { color: colors.muted, fontFamily: type.label, fontSize: 12 },
  footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, backgroundColor: colors.sheet, borderTopWidth: 1, borderTopColor: colors.hairline, gap: 10 },
  cancel: { height: 50, borderRadius: 25, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  cancelText: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15.5 },
  askTitle: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15 },
  reasons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  reason: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night },
  reasonText: { color: colors.cream, fontFamily: type.label, fontSize: 13 },
  keep: { height: 52, borderRadius: 26, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center", marginTop: 2 },
  keepText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 16 },
});
