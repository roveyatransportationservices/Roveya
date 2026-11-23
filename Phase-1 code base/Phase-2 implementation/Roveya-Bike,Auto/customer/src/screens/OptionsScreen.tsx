import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StackActions, useIsFocused } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, ApiError, live } from "../backend";
import { DragSheet } from "../components/DragSheet";
import { RouteMap } from "../components/RouteMap";
import { captains, fallbackHere, vehicleCopy } from "../data";
import { kinds, taglines, vehiclePhotos } from "../fleet";
import { distanceKm, inr, quoteFare } from "../geo";
import { rideBill } from "../ridePlan";
import { routeProblem } from "../dayPlan";
import { roadRoute, type RoadRoute } from "../routing";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { PayMethod, VehicleKind } from "../types";
import type { CustomerStack } from "../navigation";

const pace: Record<VehicleKind, number> = { bike: 0.85, auto: 1.2 };
const approachKmPerMin: Record<VehicleKind, number> = { bike: 0.35, auto: 0.3 };
const pickupMinutes: Record<VehicleKind, number> = { bike: 2, auto: 1 };

type ServerQuote = {
  quoteId: string;
  expiresAt: string;
  distanceKm: number;
  durationMin: number;
  route: [number, number][];
  pickupName: string;
  options: { vehicle: VehicleKind; fare: number; fullFare: number; discount: number; etaMin: number }[];
};

function clockAfter(minutes: number) {
  const at = new Date(Date.now() + minutes * 60000);
  const hours = at.getHours();
  return `${hours % 12 || 12}:${String(at.getMinutes()).padStart(2, "0")} ${hours < 12 ? "am" : "pm"}`;
}

export function OptionsScreen({ route, navigation }: NativeStackScreenProps<CustomerStack, "Options">) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const drop = route.params.drop;
  const pickup = store.pickup ?? fallbackHere;
  const [vehicle, setVehicle] = useState<VehicleKind>("bike");
  const [payment, setPayment] = useState<PayMethod>("cash");
  const [note, setNote] = useState("");
  const [road, setRoad] = useState<RoadRoute | null>(null);
  const [routing, setRouting] = useState(true);
  const focused = useIsFocused();
  const [fleet, setFleet] = useState(() => (live ? [] : spawn(pickup)));
  const [sheetHeight, setSheetHeight] = useState(300);
  const [collapsed, setCollapsed] = useState(false);
  const [recenter, setRecenter] = useState(0);

  const [quote, setQuote] = useState<ServerQuote | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (live) return;
    const controller = new AbortController();
    setRouting(true);
    roadRoute(pickup, drop, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setRoad(result);
      setRouting(false);
    });
    return () => controller.abort();
  }, [pickup.latitude, pickup.longitude, drop.latitude, drop.longitude]);

  // The server prices the ride and holds that price for this quote; booking charges exactly it.
  useEffect(() => {
    if (!live) return;
    let stale = false;
    setRouting(true);
    api<ServerQuote>("/rides/quote", {
      body: {
        pickup: { name: pickup.name, latitude: pickup.latitude, longitude: pickup.longitude },
        drop: { name: drop.name, latitude: drop.latitude, longitude: drop.longitude },
      },
    })
      .then((result) => {
        if (stale) return;
        setQuote(result);
        setRoad({ coords: result.route, km: result.distanceKm, minutes: result.durationMin });
        setNote("");
      })
      .catch((error) => {
        if (!stale) setNote(error instanceof Error ? error.message : "We could not get fares. Try again.");
      })
      .finally(() => {
        if (!stale) setRouting(false);
      });
    return () => {
      stale = true;
    };
  }, [pickup.latitude, pickup.longitude, drop.latitude, drop.longitude, refresh]);

  useEffect(() => {
    if (!live || !quote) return;
    const wait = Math.max(5000, Date.parse(quote.expiresAt) - Date.now() - 20000);
    const timer = setTimeout(() => setRefresh((value) => value + 1), wait);
    return () => clearTimeout(timer);
  }, [quote?.quoteId]);

  // Live: blurred positions of real captains on duty nearby, only while this screen is in front. Demo: a sample fleet.
  useEffect(() => {
    if (live) {
      if (!focused) return;
      const load = () =>
        void api<{ captains: { vehicle: VehicleKind; latitude: number; longitude: number; heading: number }[] }>(`/captains/nearby?lat=${pickup.latitude}&lng=${pickup.longitude}`, { method: "GET" })
          .then((result) => setFleet(result.captains.map((pin, index) => ({ id: `live-${index}`, kind: pin.vehicle, latitude: pin.latitude, longitude: pin.longitude, heading: pin.heading }))))
          .catch(() => undefined);
      load();
      const timer = setInterval(load, 10000);
      return () => clearInterval(timer);
    }
    setFleet([]);
  }, [pickup.latitude, pickup.longitude, focused]);

  const kilometers = road ? road.km : distanceKm(pickup, drop) * 1.25;
  const driveMinutes = road ? road.minutes : Math.round((kilometers / 28) * 60);
  const shown = useMemo(() => fleet.filter((pin) => pin.kind === vehicle), [fleet, vehicle]);

  const arrival = useMemo(() => {
    const result = {} as Record<VehicleKind, number>;
    kinds.forEach((kind) => {
      const nearest = Math.min(...fleet.filter((pin) => pin.kind === kind).map((pin) => distanceKm(pin, pickup)));
      result[kind] = Number.isFinite(nearest) ? Math.max(2, Math.round(nearest / approachKmPerMin[kind]) + pickupMinutes[kind]) : pickupMinutes[kind] + 6;
    });
    return result;
  }, [fleet, pickup]);
  const fastest = kinds.reduce((best, kind) => (arrival[kind] < arrival[best] ? kind : best), kinds[0]);

  const optionFor = (kind: VehicleKind) => quote?.options.find((option) => option.vehicle === kind);
  const fareFor = (kind: VehicleKind) => (live ? (optionFor(kind)?.fare ?? 0) : quoteFare(kind, kilometers));
  const fullFareFor = (kind: VehicleKind) => (live ? (optionFor(kind)?.fullFare ?? 0) : quoteFare(kind, kilometers));
  const fare = fareFor(vehicle);
  const bill = rideBill(vehicle, fare, store.ridePlan);
  const tripMinutes = (kind: VehicleKind) => (live && optionFor(kind) ? optionFor(kind)!.etaMin : Math.max(3, Math.round(driveMinutes * pace[kind])));
  const priced = !live || Boolean(quote);

  const edit = (which: "pickup" | "drop") => {
    if (which === "pickup") navigation.navigate("Search", { target: "pickup" });
    else navigation.dispatch(StackActions.popTo("Search", { target: "drop" }));
  };

  const [booking, setBooking] = useState(false);

  const book = async () => {
    const problem = routeProblem(kilometers, pickup.id === drop.id || pickup.name === drop.name);
    if (problem) {
      setNote(problem);
      return;
    }
    if (booking) return;
    let server: { id: string; code: string; otp: string | null; fare: number; distanceKm: number; etaMin: number } | null = null;
    if (live) {
      if (!quote) {
        setNote("Fares are on the way. Try again in a moment.");
        return;
      }
      setBooking(true);
      try {
        server = await api(`/${vehicle}/rides`, { body: { quoteId: quote.quoteId, payment } });
      } catch (error) {
        setNote(error instanceof Error ? error.message : "We could not book the ride. Try again.");
        if (error instanceof ApiError && error.status === 409 && /fare/i.test(error.message)) setRefresh((value) => value + 1);
        return;
      } finally {
        setBooking(false);
      }
    }
    store.startTrip({
      id: server?.code ?? `RV-${Date.now().toString().slice(-6)}`,
      pickup: quote ? { ...pickup, name: quote.pickupName } : pickup,
      drop,
      vehicle,
      fare: server?.fare ?? fare,
      passengerFee: rideBill(vehicle, server?.fare ?? fare, store.ridePlan).passengerFee,
      distanceKm: server?.distanceKm ?? kilometers,
      etaMin: server?.etaMin ?? tripMinutes(vehicle),
      payment,
      otp: server?.otp || (live ? "" : String(1000 + Math.floor(Math.random() * 9000))),
      captain: live ? { name: "Looking for a captain", rating: 0, vehicleNo: "", vehicleName: vehicleCopy[vehicle].title, trips: 0 } : captains[vehicle],
      status: "searching",
      progress: 0,
      serverId: server?.id,
    });
    navigation.navigate("Trip");
  };

  const visibleSheet = collapsed ? 66 : sheetHeight;

  return (
    <View style={styles.screen}>
      <View style={styles.mapArea}>
        <RouteMap
          pickup={pickup}
          drop={drop}
          pickupLabel={pickup.name}
          dropLabel={drop.name}
          route={road?.coords ?? null}
          captains={shown}
          padTop={Math.max(insets.top, 12) + 70}
          padBottom={visibleSheet + 30}
          recenter={recenter}
          onEdit={edit}
        />

        <View style={[styles.top, { paddingTop: Math.max(insets.top, 12) + 6 }]} pointerEvents="box-none">
          <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => navigation.goBack()} style={({ pressed }) => [styles.circle, pressed && { backgroundColor: colors.plum }]}>
            <Ionicons name="arrow-back" size={18} color={colors.cream} />
          </Pressable>
          <View style={styles.tripChip}>
            {routing ? (
              <ActivityIndicator size="small" color={colors.gold} />
            ) : (
              <>
                <Ionicons name="navigate" size={13} color={colors.gold} />
                <Text style={styles.tripKm}>{kilometers < 10 ? kilometers.toFixed(1) : Math.round(kilometers)} km</Text>
                <View style={styles.tripDot} />
                <Text style={styles.tripMin}>{driveMinutes >= 60 ? `${Math.floor(driveMinutes / 60)}h ${driveMinutes % 60}m` : `${driveMinutes} min`}</Text>
              </>
            )}
          </View>
        </View>

        <Pressable accessibilityLabel="Recenter map" onPress={() => setRecenter((value) => value + 1)} style={[styles.recenter, { bottom: visibleSheet + 14 }]}>
          <Ionicons name="locate" size={20} color={colors.gold} />
        </Pressable>

        <DragSheet peek={66} onSnap={setCollapsed} onHeight={setSheetHeight}>
          <View style={styles.sheetHead}>
            <Text style={styles.kicker}>CHOOSE A RIDE</Text>
            <Text style={styles.nearby}>
              <Text style={{ color: colors.gold }}>{shown.length}</Text> {vehicleCopy[vehicle].title.toLowerCase()} {shown.length === 1 ? "captain" : "captains"} nearby
            </Text>
          </View>
          <View>
            {kinds.map((kind) => {
              const on = kind === vehicle;
              return (
                <Pressable key={kind} onPress={() => setVehicle(kind)} style={[styles.option, on && styles.optionOn]}>
                  <Image source={vehiclePhotos[kind]} style={[styles.photo, on && styles.photoOn]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name}>{vehicleCopy[kind].title}</Text>
                      {kind === fastest ? (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>FASTEST</Text>
                        </View>
                      ) : null}
                    </View>
                    {on ? <Text style={styles.tagline}>{taglines[kind]}</Text> : null}
                    <Text style={styles.sub} numberOfLines={1}>
                      {arrival[kind]} min away · Drop {clockAfter(arrival[kind] + tripMinutes(kind))} ·{" "}
                      <Ionicons name="person" size={11} color={colors.faint} /> {vehicleCopy[kind].seats.split(" ")[0]}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    {fullFareFor(kind) > fareFor(kind) ? <Text style={styles.fareWas}>{inr(fullFareFor(kind))}</Text> : null}
                    <Text style={[styles.fare, on && styles.fareOn]}>{priced ? inr(fareFor(kind)) : "…"}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </DragSheet>
      </View>

      <View style={styles.footer}>
        {note ? <Text style={styles.note}>{note}</Text> : null}
        <View style={styles.choices}>
          <Pressable onPress={() => setPayment("cash")} style={[styles.choice, payment === "cash" && styles.choiceOn]}>
            <Ionicons name="cash" size={16} color={payment === "cash" ? colors.night : colors.gold} />
            <Text style={[styles.choiceText, payment === "cash" && styles.choiceTextOn]}>Cash</Text>
          </Pressable>
          <Pressable onPress={() => setPayment("upi")} style={[styles.choice, payment === "upi" && styles.choiceOn]}>
            <Ionicons name="phone-portrait" size={16} color={payment === "upi" ? colors.night : colors.gold} />
            <Text style={[styles.choiceText, payment === "upi" && styles.choiceTextOn]}>UPI</Text>
          </Pressable>
          <Pressable onPress={() => setPayment("online")} style={[styles.choice, payment === "online" && styles.choiceOn]}>
            <Ionicons name="card" size={16} color={payment === "online" ? colors.night : colors.gold} />
            <Text style={[styles.choiceText, payment === "online" && styles.choiceTextOn]}>Online</Text>
          </Pressable>
        </View>
        {priced ? <Text style={styles.note}>{bill.passengerFee ? `Booking fee ${inr(bill.passengerFee)} is included in ${inr(bill.passengerPays)}` : "You pay this fare. No extra fee."}</Text> : null}
        <Pressable disabled={booking || !priced} onPress={() => void book()} style={({ pressed }) => [styles.book, (pressed || booking || !priced) && { opacity: 0.85 }]}>
          <Text style={styles.bookText}>{booking ? "Booking…" : priced ? `Book ${vehicleCopy[vehicle].title}` : "Getting fares…"}</Text>
          {priced ? <Text style={styles.bookFare}>{inr(bill.passengerPays)}</Text> : null}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  mapArea: { flex: 1, overflow: "hidden" },
  top: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  circle: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  tripChip: { flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  tripKm: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 13 },
  tripDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.faint },
  tripMin: { color: colors.muted, fontFamily: type.label, fontSize: 12.5 },
  recenter: { position: "absolute", right: 14, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  kicker: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 10, letterSpacing: 2.4 },
  nearby: { color: colors.faint, fontFamily: type.label, fontSize: 12 },
  option: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1.5, borderColor: "transparent" },
  optionOn: { borderColor: colors.gold, backgroundColor: colors.night, paddingVertical: 13 },
  photo: { width: 54, height: 42, borderRadius: 10 },
  photoOn: { width: 60, height: 48 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 16 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: "rgba(214,160,0,0.16)", borderWidth: 1, borderColor: "rgba(214,160,0,0.5)" },
  badgeText: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 9.5, letterSpacing: 1 },
  tagline: { marginTop: 2, color: colors.muted, fontFamily: type.label, fontSize: 12.5 },
  sub: { marginTop: 3, color: colors.faint, fontFamily: type.body, fontSize: 12.5, overflow: "hidden" },
  fare: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 16 },
  fareOn: { color: colors.gold, fontSize: 18 },
  fareWas: { color: colors.faint, fontFamily: type.label, fontSize: 11.5, textDecorationLine: "line-through" },
  offerRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  offerChip: { maxWidth: "48%", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night },
  offerChipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  offerCode: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 12, letterSpacing: 1 },
  offerTitle: { color: colors.muted, fontFamily: type.label, fontSize: 11 },
  footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, backgroundColor: colors.sheet, borderTopWidth: 1, borderTopColor: colors.hairline, gap: 10 },
  coupon: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, height: 46, borderRadius: 16, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.night },
  couponInput: { flex: 1, height: 44, color: colors.cream, fontFamily: type.labelStrong, fontSize: 14, letterSpacing: 1 },
  note: { color: colors.goldBright, fontFamily: type.label, fontSize: 12.5 },
  choices: { flexDirection: "row", gap: 8 },
  choice: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 42, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night },
  choiceOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  choiceText: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 13 },
  choiceTextOn: { color: colors.night },
  choiceSub: { color: colors.faint, fontFamily: type.label, fontSize: 11.5 },
  choiceLine: { width: 1, height: 26, backgroundColor: colors.hairline, marginHorizontal: 12 },
  book: { height: 54, borderRadius: 27, backgroundColor: colors.gold, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 22 },
  bookText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 16.5 },
  bookFare: { color: colors.night, fontFamily: type.bold, fontSize: 16.5, opacity: 0.8 },
});
