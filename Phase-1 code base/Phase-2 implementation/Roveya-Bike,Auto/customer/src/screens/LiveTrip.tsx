import { useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { BackHandler, Linking, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DragSheet } from "../components/DragSheet";
import { Avatar, Plate } from "../components/kit";
import { RouteMap, type CaptainPin } from "../components/RouteMap";
import { DESK_PHONE } from "../components/StepShell";
import { vehicleCopy } from "../data";
import { api } from "../backend";
import { distanceKm, inr } from "../geo";
import { alongPath } from "../path";
import { roadRoute } from "../routing";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { ActiveTrip } from "../types";

type Coord = [number, number];
type Leg = { coords: Coord[]; minutes: number; km: number };

// Demo pacing: one minute of ETA plays out in this many real seconds.
const PACE = { approach: 4, ride: 3 };
const ARRIVED_WAIT_MS = 10000;
const FREE_WAIT_SECONDS = 180;

const cancelReasons = ["Captain is too far", "Captain asked me to cancel", "Plans changed", "Booked by mistake", "Waiting too long"];
const goodTags = ["Smooth ride", "Polite captain", "Clean vehicle", "On time", "Safe driving"];
const fixTags = ["Late pickup", "Rash driving", "Took a longer route", "Vehicle not clean", "Rude behaviour"];

function clockAfter(minutes: number) {
  const at = new Date(Date.now() + minutes * 60000);
  const hours = at.getHours();
  return `${hours % 12 || 12}:${String(at.getMinutes()).padStart(2, "0")} ${hours < 12 ? "am" : "pm"}`;
}

function straight(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }): Coord[] {
  return [[from.longitude, from.latitude], [to.longitude, to.latitude]];
}

function kmText(km: number) {
  return km < 1 ? `${Math.max(50, Math.round(km * 1000 / 50) * 50)} m` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export function LiveTrip({ trip, onCancel, onDone, onSafety }: { trip: ActiveTrip; onCancel: () => void; onDone: () => void; onSafety: () => void }) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const status = trip.status;
  const title = vehicleCopy[trip.vehicle].title;
  const captain = trip.captain;
  const first = captain.name.split(" ")[0];

  const start = useMemo(() => ({ latitude: trip.pickup.latitude + 0.011, longitude: trip.pickup.longitude - 0.008 }), [trip.pickup]);
  const [approach, setApproach] = useState<Leg | null>(null);
  const [ride, setRide] = useState<Leg | null>(null);
  const [prog, setProg] = useState({ leg: status, p: 0 });
  const [waited, setWaited] = useState(0);
  const [sheetHeight, setSheetHeight] = useState(340);
  const [collapsed, setCollapsed] = useState(false);
  const [recenter, setRecenter] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const [stars, setStars] = useState(0);
  const [payNote, setPayNote] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    roadRoute(start, trip.pickup, controller.signal).then((road) => {
      if (controller.signal.aborted) return;
      setApproach(road
        ? { coords: road.coords, minutes: Math.max(4, Math.round(road.minutes * 1.5)), km: road.km }
        : { coords: straight(start, trip.pickup), minutes: 5, km: distanceKm(start, trip.pickup) * 1.3 });
    });
    roadRoute(trip.pickup, trip.drop, controller.signal).then((road) => {
      if (controller.signal.aborted) return;
      setRide(road
        ? { coords: road.coords, minutes: Math.max(3, Math.round(road.minutes)), km: road.km }
        : { coords: straight(trip.pickup, trip.drop), minutes: Math.max(3, trip.etaMin), km: trip.distanceKm });
    });
    return () => controller.abort();
  }, [start, trip.pickup, trip.drop]);

  const leg = status === "assigned" ? approach : status === "onTrip" ? ride : null;
  const p = prog.leg === status ? prog.p : 0;

  useEffect(() => {
    if (!leg) return;
    const step = 1 / (leg.minutes * (status === "assigned" ? PACE.approach : PACE.ride));
    const timer = setInterval(() => {
      setProg((current) => ({ leg: status, p: Math.min(1, (current.leg === status ? current.p : 0) + step) }));
    }, 1000);
    return () => clearInterval(timer);
  }, [leg, status]);

  const patch = useRef(store.patchTrip);
  patch.current = store.patchTrip;

  // A server-backed ride moves only when the captain acts; the simulation drives demo rides.
  const simulated = !trip.serverId;

  useEffect(() => {
    if (p < 1 || !simulated) return;
    if (status === "assigned") patch.current({ status: "arrived" });
    if (status === "onTrip") patch.current({ status: "payment", progress: 1 });
  }, [p, status, simulated]);

  useEffect(() => {
    if (status !== "arrived") return;
    setWaited(0);
    const tick = setInterval(() => setWaited((value) => value + 1), 1000);
    const go = simulated ? setTimeout(() => patch.current({ status: "onTrip", progress: 0 }), ARRIVED_WAIT_MS) : undefined;
    return () => {
      clearInterval(tick);
      clearTimeout(go);
    };
  }, [status]);

  useEffect(() => {
    if (status !== "assigned" && status !== "arrived") setCancelling(false);
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, [status]);

  const atPickup = approach ? alongPath(approach.coords, 1) : null;
  const here =
    status === "assigned" && approach ? alongPath(approach.coords, p) :
    status === "onTrip" && ride ? alongPath(ride.coords, p) :
    status === "arrived" && atPickup ? atPickup :
    (status === "payment" || status === "rating") && ride ? alongPath(ride.coords, 1) :
    { latitude: start.latitude, longitude: start.longitude, heading: 180, remaining: null };
  const spot = !simulated && trip.captainAt ? trip.captainAt : here;
  const pin: CaptainPin = { id: "captain", kind: trip.vehicle, latitude: spot.latitude, longitude: spot.longitude, heading: spot.heading };

  // Server rides measure progress from the captain's last reported position; demo rides use the timer.
  const goal = status === "assigned" ? trip.pickup : trip.drop;
  const progress = !simulated && trip.captainAt && leg && leg.km > 0 ? Math.min(1, Math.max(0, 1 - (distanceKm(trip.captainAt, goal) * 1.3) / leg.km)) : p;
  const minutesLeft = leg ? Math.max(1, Math.ceil(leg.minutes * (1 - progress))) : status === "assigned" ? 5 : trip.etaMin;
  const kmLeft = leg ? leg.km * (1 - progress) : 0;
  const arrivingNow = status === "assigned" && leg !== null && progress > 0.92;
  const onRideLeg = status === "onTrip" || status === "payment" || status === "rating";
  const mapRoute = onRideLeg ? ride?.coords ?? null : approach?.coords ?? null;

  const visibleSheet = collapsed ? 150 : sheetHeight;

  const share = () => {
    void Share.share({ message: `I'm on a ROVEYA ${title} ride with ${captain.name} (${captain.vehicleNo}) from ${trip.pickup.name} to ${trip.drop.name}. Trip ${trip.id}.` }).catch(() => undefined);
  };

  const pay = async () => {
    if (trip.payment === "online" && trip.serverId) {
      try {
        const result = await api<{ payment?: { checkoutUrl?: string } }>(`/rides/${trip.serverId}/pay`);
        if (result.payment?.checkoutUrl) await Linking.openURL(result.payment.checkoutUrl);
      } catch (error) {
        setPayNote(error instanceof Error ? error.message : "Online payment could not be started.");
        return;
      }
    }
    store.patchTrip({ status: "rating" });
  };

  const submit = () => {
    if (!simulated && stars) void api(`/rides/${trip.serverId}/rate`, { body: { stars, tags } }).catch(() => undefined);
    store.finishTrip(stars || 5);
    onDone();
  };

  const chip =
    status === "assigned" ? (arrivingNow ? "Arriving now" : `Arriving in ${minutesLeft} min`) :
    status === "arrived" ? "Captain at pickup" :
    status === "onTrip" ? `Drop in ${minutesLeft} min` :
    status === "payment" ? "Reached drop" :
    "Ride complete";

  const captainCard = (
    <View style={styles.captain}>
      <Avatar source={captain.photo} size={50} name={captain.name} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.captainName} numberOfLines={1}>{captain.name}</Text>
        <View style={styles.ratingRow}>
          <Ionicons name="star" size={11} color={colors.gold} />
          <Text style={styles.ratingText}>{captain.rating.toFixed(2)} · {captain.trips.toLocaleString("en-IN")} {captain.trips === 1 ? "trip" : "trips"}</Text>
        </View>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Plate value={captain.vehicleNo} />
        <Text style={styles.vehicleName}>{captain.vehicleName}</Text>
      </View>
    </View>
  );

  const actions = (
      <View style={styles.actions}>
        <Action icon="call" label="Call" onPress={() => void Linking.openURL(DESK_PHONE)} />
        <Action icon="share-social" label="Share trip" onPress={share} />
        <Action icon="shield-checkmark" label="Safety" onPress={onSafety} />
      </View>
  );

  const otpCard = (
    <View style={styles.otp}>
      <View style={{ flex: 1 }}>
        <Text style={styles.otpLabel}>SHARE OTP TO START</Text>
        <Text style={styles.otpHint}>{first} enters this to begin the ride</Text>
      </View>
      <View style={styles.digits}>
        {trip.otp.split("").map((digit, index) => (
          <View key={`${digit}-${index}`} style={styles.digit}>
            <Text style={styles.digitText}>{digit}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  let sheet: React.ReactNode = null;
  if (status === "assigned") {
    sheet = (
      <>
        <View style={styles.head}>
          <Text style={styles.kicker}>CAPTAIN ON THE WAY</Text>
          <View style={styles.otpChip}>
            <Text style={styles.otpChipLabel}>OTP</Text>
            <Text style={styles.otpChipCode}>{trip.otp}</Text>
          </View>
        </View>
        <View style={{ gap: 3 }}>
          <Text style={styles.title}>
            {arrivingNow ? "Arriving now" : <>Arriving in <Text style={{ color: colors.gold }}>{minutesLeft} min</Text></>}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>{first} is {kmText(kmLeft)} away · coming to {trip.pickup.name}</Text>
        </View>
        <Progress value={progress} />
        {captainCard}
        {actions}
      </>
    );
  } else if (status === "arrived") {
    const left = Math.max(0, FREE_WAIT_SECONDS - waited);
    sheet = (
      <>
        <View style={styles.head}>
          <Text style={styles.kicker}>CAPTAIN HAS ARRIVED</Text>
          <Text style={styles.meta}>Free wait {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</Text>
        </View>
        <View style={{ gap: 3 }}>
          <Text style={styles.title}>{first} is at your pickup</Text>
          <Text style={styles.sub} numberOfLines={1}>Look for {captain.vehicleName} · {captain.vehicleNo}</Text>
        </View>
        {otpCard}
        {captainCard}
        {actions}
      </>
    );
  } else if (status === "onTrip") {
    sheet = (
      <>
        <View style={styles.head}>
          <Text style={styles.kicker}>ON THE WAY TO DROP</Text>
          <Text style={styles.meta}>{kmText(kmLeft)} left</Text>
        </View>
        <View style={{ gap: 3 }}>
          <Text style={styles.title}>
            Reaching in <Text style={{ color: colors.gold }}>{minutesLeft} min</Text>
          </Text>
          <Text style={styles.sub} numberOfLines={1}>Drop at {trip.drop.name} · by {clockAfter(minutesLeft)}</Text>
        </View>
        <Progress value={progress} />
        {captainCard}
        {actions}
      </>
    );
  } else if (status === "payment") {
    const minutes = ride?.minutes ?? trip.etaMin;
    sheet = (
      <>
        <View style={styles.head}>
          <Text style={styles.kicker}>YOU HAVE ARRIVED</Text>
          <Text style={styles.meta}>{trip.id}</Text>
        </View>
        <View style={{ gap: 3 }}>
          <Text style={styles.title}>
            Pay <Text style={{ color: colors.gold }}>{inr(trip.fare)}</Text> to {first}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>Dropped at {trip.drop.name}</Text>
        </View>
        <View style={styles.receipt}>
          <Line label={`${title} fare`} value={inr(trip.fare)} />
          <Line label="Distance" value={kmText(ride?.km ?? trip.distanceKm)} />
          <Line label="Ride time" value={`${minutes} min`} />
          <View style={styles.receiptRule} />
          <Line label="Total" value={inr(trip.fare)} strong />
        </View>
        <View style={styles.methods}>
          <Method
            icon={trip.payment === "upi" ? "phone-portrait" : "cash"}
            label={trip.payment === "online" ? "Online" : trip.payment === "upi" ? "UPI" : "Cash"}
            sub={trip.payment === "online" ? "UPI, card, or net banking" : trip.payment === "upi" ? `Pay ${first} by UPI` : `Pay ${first} in cash`}
            on
            onPress={() => undefined}
          />
        </View>
      </>
    );
  } else if (status === "rating") {
    const pool = stars && stars <= 3 ? fixTags : goodTags;
    sheet = (
      <>
        <View style={styles.head}>
          <Text style={styles.kicker}>RIDE COMPLETE</Text>
          <Text style={styles.meta}>Paid {inr(trip.fare)} · {trip.payment === "online" ? "Online" : trip.payment === "upi" ? "UPI" : "Cash"}</Text>
        </View>
        <View style={styles.rateHead}>
          <Avatar source={captain.photo} size={52} name={captain.name} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>How was your ride?</Text>
            <Text style={styles.sub}>Rate {captain.name}</Text>
          </View>
        </View>
        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((value) => (
            <Pressable key={value} hitSlop={6} onPress={() => { setStars(value); setTags([]); }} accessibilityLabel={`${value} star`}>
              <Ionicons name={value <= stars ? "star" : "star-outline"} size={36} color={value <= stars ? colors.gold : colors.faint} />
            </Pressable>
          ))}
        </View>
        {stars ? (
          <View style={styles.tags}>
            {pool.map((tag) => {
              const on = tags.includes(tag);
              return (
                <Pressable key={tag} onPress={() => setTags((list) => (on ? list.filter((item) => item !== tag) : [...list, tag]))} style={[styles.tag, on && styles.tagOn]}>
                  <Text style={[styles.tagText, on && { color: colors.night }]}>{tag}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </>
    );
  }

  let footer: React.ReactNode = null;
  if ((status === "assigned" || status === "arrived") && cancelling) {
    footer = (
      <>
        <Text style={styles.askTitle}>Why do you want to cancel?</Text>
        <Text style={styles.footSub}>{status === "arrived" ? `The captain has arrived. Cancelling costs ${inr(trip.vehicle === "auto" ? 30 : 20)}.` : "Cancelling before the captain arrives is free."}</Text>
        <View style={styles.tags}>
          {cancelReasons.map((reason) => (
            <Pressable key={reason} onPress={onCancel} style={({ pressed }) => [styles.tag, pressed && { borderColor: colors.gold }]}>
              <Text style={styles.tagText}>{reason}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => setCancelling(false)} style={styles.primary}>
          <Text style={styles.primaryText}>Keep my ride</Text>
        </Pressable>
      </>
    );
  } else if (status === "assigned" || status === "arrived") {
    footer = (
      <View style={styles.footRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.footFare}>{inr(trip.fare)}</Text>
          <Text style={styles.footSub}>{trip.payment === "online" ? "Online" : trip.payment === "upi" ? "UPI" : "Cash"} · {title}</Text>
        </View>
        <Pressable onPress={() => setCancelling(true)} style={({ pressed }) => [styles.ghost, pressed && { backgroundColor: colors.plum }]}>
          <Text style={styles.ghostText}>Cancel ride</Text>
        </Pressable>
      </View>
    );
  } else if (status === "onTrip") {
    footer = (
      <View style={styles.footRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.footFare}>{inr(trip.fare)}</Text>
          <Text style={styles.footSub}>{trip.payment === "online" ? "Pay online after the ride" : trip.payment === "upi" ? "Pay by UPI at drop" : "Pay in cash at drop"}</Text>
        </View>
        <Pressable onPress={share} style={({ pressed }) => [styles.ghost, pressed && { backgroundColor: colors.plum }]}>
          <Ionicons name="share-social" size={15} color={colors.cream} />
          <Text style={styles.ghostText}>Share live trip</Text>
        </Pressable>
      </View>
    );
  } else if (status === "payment") {
    footer = (
      <>
        <Pressable onPress={() => void pay()} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.9 }]}>
          <Text style={styles.primaryText}>{trip.payment === "online" ? `Pay ${inr(trip.fare)} online` : trip.payment === "upi" ? `Paid ${inr(trip.fare)} by UPI` : `Paid ${inr(trip.fare)} in cash`}</Text>
        </Pressable>
        {payNote ? <Text style={styles.footSub}>{payNote}</Text> : null}
      </>
    );
  } else if (status === "rating") {
    footer = (
      <Pressable onPress={submit} style={({ pressed }) => [styles.primary, !stars && styles.primaryQuiet, pressed && { opacity: 0.9 }]}>
        <Text style={[styles.primaryText, !stars && { color: colors.cream }]}>{stars ? "Submit rating" : "Done"}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.mapArea}>
        <RouteMap
          pickup={trip.pickup}
          drop={trip.drop}
          pickupLabel={trip.pickup.name}
          dropLabel={trip.drop.name}
          pickupEta={status === "assigned" ? (arrivingNow ? "Now" : `${minutesLeft} min`) : status === "arrived" ? "Here" : undefined}
          dropEta={status === "onTrip" ? `${minutesLeft} min` : status === "payment" || status === "rating" ? "Reached" : undefined}
          route={mapRoute}
          remaining={leg ? (here.remaining as Coord[] | null) : null}
          captains={[pin]}
          padTop={Math.max(insets.top, 12) + 70}
          padBottom={visibleSheet + 30}
          recenter={recenter}
          mode="live"
          showDrop={onRideLeg}
          showPickupLabel={!onRideLeg}
          onEdit={() => undefined}
        />

        <View style={[styles.top, { paddingTop: Math.max(insets.top, 12) + 6 }]} pointerEvents="box-none">
          <View style={styles.chip}>
            <View style={styles.liveDot} />
            <Text style={styles.chipText}>{chip}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Safety" hitSlop={10} onPress={onSafety} style={({ pressed }) => [styles.circle, pressed && { backgroundColor: colors.plum }]}>
            <Ionicons name="shield-checkmark" size={18} color={colors.gold} />
          </Pressable>
        </View>

        {cancelling ? null : (
          <Pressable accessibilityLabel="Recenter map" onPress={() => setRecenter((value) => value + 1)} style={[styles.recenter, { bottom: visibleSheet + 14 }]}>
            <Ionicons name="locate" size={20} color={colors.gold} />
          </Pressable>
        )}

        <DragSheet peek={150} onSnap={setCollapsed} onHeight={setSheetHeight}>
          {sheet}
        </DragSheet>
      </View>

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.round(Math.min(1, Math.max(0.03, value)) * 100)}%` }]} />
    </View>
  );
}

function Action({ icon, label, tone, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; tone?: "alert"; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, tone === "alert" && styles.actionAlert, pressed && { backgroundColor: colors.plum }]}>
      <Ionicons name={icon} size={16} color={tone === "alert" ? "#F08A84" : colors.gold} />
      <Text style={[styles.actionText, tone === "alert" && { color: "#F08A84" }]}>{label}</Text>
    </Pressable>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, strong && styles.lineStrong]}>{label}</Text>
      <Text style={[styles.lineValue, strong && styles.lineStrongValue]}>{value}</Text>
    </View>
  );
}

function Method({ icon, label, sub, on, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; sub: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.method, on && styles.methodOn]}>
      <View style={[styles.methodIcon, on && { backgroundColor: colors.gold }]}>
        <Ionicons name={icon} size={15} color={on ? colors.night : colors.gold} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.methodLabel} numberOfLines={1}>{label}</Text>
        <Text style={styles.methodSub} numberOfLines={1}>{sub}</Text>
      </View>
      <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={18} color={on ? colors.gold : colors.faint} />
    </Pressable>
  );
}

const shadow = { shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 };

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  mapArea: { flex: 1, overflow: "hidden" },
  top: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chip: { flexDirection: "row", alignItems: "center", gap: 8, height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, ...shadow },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold },
  chipText: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 13.5 },
  circle: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell, alignItems: "center", justifyContent: "center", ...shadow },
  recenter: { position: "absolute", right: 14, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", ...shadow },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  kicker: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 10, letterSpacing: 2.4 },
  meta: { color: colors.faint, fontFamily: type.label, fontSize: 12 },
  title: { color: colors.cream, fontFamily: type.display, fontSize: 21, letterSpacing: -0.3 },
  sub: { color: colors.muted, fontFamily: type.body, fontSize: 13, overflow: "hidden" },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.hairline, overflow: "hidden" },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.gold },
  captain: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 18, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.hairline },
  captainName: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15.5, overflow: "hidden" },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  ratingText: { color: colors.muted, fontFamily: type.label, fontSize: 12 },
  vehicleName: { color: colors.faint, fontFamily: type.label, fontSize: 11.5 },
  otp: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.gold, backgroundColor: "rgba(214,160,0,0.08)" },
  otpLabel: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 10, letterSpacing: 1.8 },
  otpHint: { color: colors.muted, fontFamily: type.body, fontSize: 12, marginTop: 2 },
  digits: { flexDirection: "row", gap: 6 },
  digit: { width: 40, height: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.night, alignItems: "center", justifyContent: "center" },
  digitText: { color: colors.cream, fontFamily: type.bold, fontSize: 22 },
  actions: { flexDirection: "row", gap: 8 },
  action: { flex: 1, height: 42, borderRadius: 21, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  actionAlert: { borderColor: "rgba(240,138,132,0.5)" },
  actionText: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 13 },
  otpChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: colors.gold, backgroundColor: "rgba(214,160,0,0.1)" },
  otpChipLabel: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 10, letterSpacing: 1.4 },
  otpChipCode: { color: colors.cream, fontFamily: type.bold, fontSize: 15, letterSpacing: 2.5 },
  receipt: { padding: 14, borderRadius: 18, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.hairline, gap: 8 },
  receiptRule: { height: 1, backgroundColor: colors.hairline, marginVertical: 2 },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  lineLabel: { color: colors.muted, fontFamily: type.label, fontSize: 13.5 },
  lineValue: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 13.5 },
  lineStrong: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15 },
  lineStrongValue: { color: colors.gold, fontFamily: type.bold, fontSize: 17 },
  methods: { gap: 8 },
  method: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, borderWidth: 1.5, borderColor: colors.hairline },
  methodOn: { borderColor: colors.gold, backgroundColor: colors.night },
  methodIcon: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  methodLabel: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 14.5 },
  methodSub: { color: colors.faint, fontFamily: type.label, fontSize: 12 },
  note: { color: colors.goldBright, fontFamily: type.label, fontSize: 12.5 },
  rateHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  stars: { flexDirection: "row", justifyContent: "center", gap: 10, paddingVertical: 4 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night },
  tagOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  tagText: { color: colors.cream, fontFamily: type.label, fontSize: 13 },
  reward: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: "rgba(214,160,0,0.08)", borderWidth: 1, borderColor: "rgba(214,160,0,0.35)" },
  rewardText: { flex: 1, color: colors.cream, fontFamily: type.label, fontSize: 12.5 },
  footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, backgroundColor: colors.sheet, borderTopWidth: 1, borderTopColor: colors.hairline, gap: 10 },
  footRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  footFare: { color: colors.cream, fontFamily: type.bold, fontSize: 18 },
  footSub: { color: colors.faint, fontFamily: type.label, fontSize: 12 },
  ghost: { height: 48, paddingHorizontal: 20, borderRadius: 24, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  ghostText: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 14.5 },
  askTitle: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15 },
  primary: { height: 52, borderRadius: 26, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  primaryQuiet: { backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  primaryText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 16 },
});
