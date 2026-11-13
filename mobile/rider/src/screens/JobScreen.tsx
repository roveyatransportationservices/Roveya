import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { BackHandler, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { DragSheet } from "../components/DragSheet";
import { Line, Stars } from "../components/PageShell";
import { RouteMap, type CaptainPin } from "../components/RouteMap";
import { Keypad } from "../components/SignInSheet";
import { FlowCta, FlowGhost } from "../components/StepShell";
import { SwipeButton } from "../components/SwipeButton";
import { api, live } from "../backend";
import { DEMO_RIDE_OTP, DESK_PHONE, home, vehicleTitle } from "../data";
import { distanceKm, inr } from "../geo";
import { alongPath } from "../path";
import { roadRoute } from "../routing";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { CaptainStack } from "../navigation";

type Coord = [number, number];
type Leg = { coords: Coord[]; minutes: number; km: number };

// Demo pacing: one minute of ETA plays out in this many real seconds.
const PACE = { pickup: 3, ride: 2.5 };
const FREE_WAIT = 180;

const cancelReasons = ["Passenger asked me to cancel", "Passenger not reachable", "Passenger not at pickup", "Pickup is too far", "Vehicle problem"];
const goodTags = ["Polite", "Ready at pickup", "Clear directions", "Paid on time"];
const fixTags = ["Kept me waiting", "Wrong pickup pin", "Rude behaviour", "Asked to change route"];

function straight(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }): Coord[] {
  return [[from.longitude, from.latitude], [to.longitude, to.latitude]];
}

function kmText(km: number) {
  return km < 1 ? `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

function mmss(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function JobScreen({ navigation }: NativeStackScreenProps<CaptainStack, "Job">) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const job = store.job;
  const [toPickup, setToPickup] = useState<Leg | null>(null);
  const [ride, setRide] = useState<Leg | null>(null);
  const [prog, setProg] = useState({ leg: "toPickup", p: 0 });
  const [waited, setWaited] = useState(0);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [sheetHeight, setSheetHeight] = useState(360);
  const [collapsed, setCollapsed] = useState(false);
  const [recenter, setRecenter] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const [note, setNote] = useState("");
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!job) return;
    const controller = new AbortController();
    roadRoute(home, job.pickup, controller.signal).then((road) => {
      if (controller.signal.aborted) return;
      setToPickup(road ? { coords: road.coords, minutes: Math.max(2, job.pickupMin), km: road.km } : { coords: straight(home, job.pickup), minutes: job.pickupMin, km: job.pickupKm });
    });
    roadRoute(job.pickup, job.drop, controller.signal).then((road) => {
      if (controller.signal.aborted) return;
      setRide(road ? { coords: road.coords, minutes: Math.max(3, Math.round(road.minutes)), km: road.km } : { coords: straight(job.pickup, job.drop), minutes: job.tripMin, km: job.tripKm });
    });
    return () => controller.abort();
  }, [job?.id]);

  const status = job?.status ?? "rate";
  const leg = status === "toPickup" ? toPickup : status === "onTrip" ? ride : null;
  const p = prog.leg === status ? prog.p : 0;

  useEffect(() => {
    if (!leg) return;
    const step = 1 / (leg.minutes * (status === "toPickup" ? PACE.pickup : PACE.ride));
    const timer = setInterval(() => setProg((current) => ({ leg: status, p: Math.min(1, (current.leg === status ? current.p : 0) + step) })), 1000);
    return () => clearInterval(timer);
  }, [leg, status]);

  useEffect(() => {
    if (status !== "arrived") return;
    setWaited(0);
    const tick = setInterval(() => setWaited((value) => value + 1), 1000);
    return () => clearInterval(tick);
  }, [status]);

  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(""), 3000);
    return () => clearTimeout(timer);
  }, [note]);

  // The passenger can cancel before pickup; the captain's screen follows the server.
  useEffect(() => {
    if (!live || !job?.tripId || job.status === "collect" || job.status === "rate") return;
    const timer = setInterval(() => {
      void api<{ trip: { id: string } | null }>("/captain/trips/current")
        .then((result) => {
          if (result.trip) return;
          store.cancelJob("Passenger cancelled");
          navigation.navigate("Tabs", { screen: "Duty" });
        })
        .catch(() => undefined);
    }, 4000);
    return () => clearInterval(timer);
  }, [job?.tripId, job?.status]);

  if (!job) {
    return (
      <View style={[styles.screen, styles.empty]}>
        <Text style={styles.title}>No ride right now</Text>
        <FlowCta label="Back to duty" onPress={() => navigation.navigate("Tabs", { screen: "Duty" })} />
      </View>
    );
  }

  const leave = () => navigation.navigate("Tabs", { screen: "Duty" });

  const atPickup = toPickup ? alongPath(toPickup.coords, 1) : null;
  const here =
    status === "toPickup" && toPickup ? alongPath(toPickup.coords, p) :
    status === "onTrip" && ride ? alongPath(ride.coords, p) :
    status === "arrived" && atPickup ? atPickup :
    (status === "collect" || status === "rate") && ride ? alongPath(ride.coords, 1) :
    { latitude: home.latitude, longitude: home.longitude, heading: 0, remaining: null };
  const kind = job?.vehicle ?? store.captain?.vehicle ?? "bike";
  const pin: CaptainPin = { id: "me", kind, latitude: here.latitude, longitude: here.longitude, heading: here.heading };
  const minutesLeft = leg ? Math.max(1, Math.ceil(leg.minutes * (1 - p))) : 0;
  const kmLeft = leg ? leg.km * (1 - p) : 0;
  const onRideLeg = status !== "toPickup" && status !== "arrived";
  const mapRoute = onRideLeg ? ride?.coords ?? null : toPickup?.coords ?? null;
  const nearPickup = status === "toPickup" && p > 0.85;
  const nearDrop = status === "onTrip" && p > 0.85;

  const navigate = () => {
    const to = onRideLeg ? job?.drop : job?.pickup;
    if (!to) return;
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${to.latitude},${to.longitude}&travelmode=driving`);
  };

  const call = () => setNote(`Calling ${job?.customer.name} through ROVEYA. Both numbers stay private.`);

  const press = (key: string) => {
    setOtpError("");
    if (key === "back") setOtp((value) => value.slice(0, -1));
    else if (key) setOtp((value) => (value.length < 4 ? value + key : value));
  };

  const remote = async (action: string, body?: unknown) => {
    if (!live || !job?.tripId) return true;
    try {
      await api(`/captain/trips/${job.tripId}/${action}`, { method: "POST", body });
      return true;
    } catch (error) {
      setNote(error instanceof Error ? error.message : "That did not go through. Try again.");
      return false;
    }
  };

  const start = async () => {
    if (!job) return;
    if (live && job.tripId) {
      try {
        await api(`/captain/trips/${job.tripId}/start`, { body: { otp } });
      } catch (error) {
        setOtpError(error instanceof Error ? error.message : "That OTP does not match. Ask the passenger again.");
        setOtp("");
        return;
      }
    } else if (otp !== job.otp) {
      setOtpError("That OTP does not match. Ask the passenger again.");
      setOtp("");
      return;
    }
    store.patchJob({ status: "onTrip", startedAt: Date.now() });
  };

  const arrive = async () => {
    if (await remote("arrived")) store.patchJob({ status: "arrived", arrivedAt: Date.now() });
  };

  const end = async () => {
    if (await remote("complete")) store.patchJob({ status: "collect" });
  };

  const collected = async () => {
    if (job?.payment === "cash" && !(await remote("collect"))) return;
    store.patchJob({ status: "rate" });
  };

  const cancel = async (reason: string) => {
    if (!(await remote("cancel", { reason }))) return;
    store.cancelJob(reason);
    leave();
  };

  const finish = () => {
    if (stars) void remote("rate", { stars, tags });
    store.finishJob(stars || 5);
    leave();
  };

  const chip =
    status === "toPickup" ? (nearPickup ? "Pickup nearby" : `Pickup in ${minutesLeft} min`) :
    status === "arrived" ? `Waiting · ${mmss(waited)}` :
    status === "onTrip" ? (nearDrop ? "Drop nearby" : `Drop in ${minutesLeft} min`) :
    status === "collect" ? "Collect payment" :
    "Rate the passenger";

  const customerRow = job ? (
    <View style={styles.customer}>
      <View style={styles.customerMark}>
        <Text style={styles.customerLetter}>{job.customer.name.charAt(0)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.customerName}>{job.customer.name}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="star" size={11} color={colors.gold} />
          <Text style={styles.meta}>{job.customer.rating.toFixed(1)} · {job.payment === "cash" ? "Cash" : "Paid online"} · {job.id}</Text>
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Call passenger" onPress={call} style={styles.round}>
        <Ionicons name="call" size={17} color={colors.gold} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Navigate" onPress={navigate} style={[styles.round, styles.roundGold]}>
        <Ionicons name="navigate" size={17} color={colors.night} />
      </Pressable>
    </View>
  ) : null;

  const visibleSheet = collapsed ? 140 : sheetHeight;

  return (
    <View style={styles.screen}>
      {job ? (
        <RouteMap
          pickup={job.pickup}
          drop={job.drop}
          pickupLabel={job.pickup.name}
          dropLabel={job.drop.name}
          route={mapRoute}
          captains={[pin]}
          padTop={Math.max(insets.top, 12) + 70}
          padBottom={visibleSheet + 30}
          recenter={recenter}
          mode="live"
          showDrop={onRideLeg}
          showPickupLabel={!onRideLeg}
          pickupEta={status === "toPickup" ? (nearPickup ? "Now" : `${minutesLeft} min`) : status === "arrived" ? "Here" : undefined}
          dropEta={status === "onTrip" ? `${minutesLeft} min` : onRideLeg ? "Reached" : undefined}
          remaining={leg ? here.remaining : null}
          onEdit={() => undefined}
        />
      ) : null}

      <View style={[styles.top, { paddingTop: Math.max(insets.top, 12) + 6 }]} pointerEvents="box-none">
        <View style={styles.chip}>
          <View style={styles.chipDot} />
          <Text style={styles.chipText}>{chip}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="SOS" onPress={() => void Linking.openURL("tel:112")} style={styles.sos}>
          <Text style={styles.sosText}>SOS</Text>
        </Pressable>
      </View>

      {note ? (
        <View style={[styles.toast, { top: Math.max(insets.top, 12) + 62 }]}>
          <Ionicons name="call" size={14} color={colors.gold} />
          <Text style={styles.toastText}>{note}</Text>
        </View>
      ) : null}

      {!cancelling ? (
        <Pressable accessibilityLabel="Recenter map" onPress={() => setRecenter((value) => value + 1)} style={[styles.recenter, { bottom: visibleSheet + 14 }]}>
          <Ionicons name="locate" size={20} color={colors.gold} />
        </Pressable>
      ) : null}

      <DragSheet peek={140} onSnap={setCollapsed} onHeight={setSheetHeight} style={{ paddingBottom: Math.max(insets.bottom, 12) + 4 }}>
        {cancelling ? (
          <>
            <Text style={styles.kicker}>CANCEL RIDE</Text>
            <Text style={styles.title}>Why are you cancelling?</Text>
            <Text style={styles.lead}>Frequent cancellations lower your acceptance rate.</Text>
            <View style={styles.tags}>
              {cancelReasons.map((reason) => (
                <Pressable
                  key={reason}
                  onPress={() => void cancel(reason)}
                  style={({ pressed }) => [styles.tag, pressed && styles.tagOn]}
                >
                  <Text style={styles.tagText}>{reason}</Text>
                </Pressable>
              ))}
            </View>
            <FlowGhost label="Keep the ride" icon="arrow-back" onPress={() => setCancelling(false)} />
          </>
        ) : status === "toPickup" ? (
          <>
            <View style={styles.headRow}>
              <Text style={styles.kicker}>GO TO PICKUP</Text>
              <Text style={styles.side}>{kmText(kmLeft || (job?.pickupKm ?? 0))} away</Text>
            </View>
            <Text style={styles.title} numberOfLines={1}>{job?.pickup.name}</Text>
            <Text style={styles.lead}>{job?.pickup.subtitle} · reach in {minutesLeft || job?.pickupMin} min</Text>
            <Progress value={p} />
            {customerRow}
            <SwipeButton label={nearPickup ? "Swipe when arrived" : "Arrived at pickup"} icon="flag" onDone={() => void arrive()} />
            <Pressable onPress={() => setCancelling(true)}>
              <Text style={styles.link}>Cancel ride</Text>
            </Pressable>
          </>
        ) : status === "arrived" ? (
          <>
            <View style={styles.headRow}>
              <Text style={styles.kicker}>AT PICKUP</Text>
              <Text style={[styles.side, waited > FREE_WAIT && { color: colors.goldBright }]}>{waited > FREE_WAIT ? "Waiting charge on" : `Free wait ${mmss(Math.max(0, FREE_WAIT - waited))}`}</Text>
            </View>
            <Text style={styles.title}>Ask {job?.customer.name} for the ride OTP</Text>
            <View style={styles.otpRow}>
              {[0, 1, 2, 3].map((at) => (
                <View key={at} style={[styles.otpBox, at === otp.length && styles.otpBoxOn, otp[at] ? styles.otpBoxFilled : null, otpError ? styles.otpBoxWrong : null]}>
                  <Text style={styles.otpText}>{otp[at] ?? ""}</Text>
                </View>
              ))}
            </View>
            <Text style={[styles.otpNote, otpError ? { color: colors.goldBright } : null]}>{otpError || (live ? "The passenger sees this code in the ROVEYA app" : `The passenger sees this code in the ROVEYA app · Demo OTP ${DEMO_RIDE_OTP}`)}</Text>
            <Keypad onKey={press} onClear={() => setOtp("")} />
            <FlowCta label="Start ride" icon="play" disabled={otp.length < 4} onPress={() => void start()} />
            <View style={styles.inline}>
              <Pressable onPress={call}>
                <Text style={styles.link}>Call {job?.customer.name}</Text>
              </Pressable>
              <Text style={styles.dot}>·</Text>
              <Pressable onPress={() => setCancelling(true)}>
                <Text style={styles.link}>Cancel ride</Text>
              </Pressable>
            </View>
          </>
        ) : status === "onTrip" ? (
          <>
            <View style={styles.headRow}>
              <Text style={styles.kicker}>ON TRIP</Text>
              <Text style={styles.side}>{kmText(kmLeft)} left</Text>
            </View>
            <Text style={styles.title} numberOfLines={1}>Drop at {job?.drop.name}</Text>
            <Text style={styles.lead}>{job?.drop.subtitle} · {minutesLeft} min to go</Text>
            <Progress value={p} />
            {customerRow}
            <SwipeButton label="Swipe to end ride" icon="stop" tone="burgundy" onDone={() => void end()} />
          </>
        ) : status === "collect" && job ? (
          <>
            <Text style={styles.kicker}>RIDE COMPLETE</Text>
            <Text style={styles.title}>{job.payment === "cash" ? `Collect ${inr(job.collect ?? job.fare)} in cash` : `${inr(job.fare)} paid online`}</Text>
            <Text style={styles.lead}>{job.payment === "cash" ? `From ${job.customer.name} before they leave` : "Added to your ROVEYA wallet"}</Text>
            <View style={styles.receipt}>
              <Line label="Trip fare" value={inr(job.fare)} />
              {job.payment === "cash" && job.collect !== undefined && job.collect < job.fare ? <Line label="Passenger coupon · ROVEYA pays you" value={`+${inr(job.fare - job.collect)}`} /> : null}
              <Line label={`Distance · ${job.tripKm.toFixed(1)} km`} value={vehicleTitle[job.vehicle]} />
              {job.bonus ? <Line label="Ride bonus · to wallet" value={`+${inr(job.bonus)}`} /> : null}
              <View style={styles.rule} />
              <Line label="You earn" value={inr(job.fare + job.bonus)} strong />
            </View>
            <FlowCta label={job.payment === "cash" ? `Cash ${inr(job.collect ?? job.fare)} collected` : "Payment received"} icon="checkmark" onPress={() => void collected()} />
          </>
        ) : job ? (
          <>
            <Text style={styles.kicker}>RATE THE PASSENGER</Text>
            <Text style={styles.title}>How was {job.customer.name}?</Text>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} accessibilityLabel={`${n} star`} hitSlop={6} onPress={() => setStars(n)}>
                  <Ionicons name={n <= stars ? "star" : "star-outline"} size={36} color={n <= stars ? colors.gold : colors.faint} />
                </Pressable>
              ))}
            </View>
            {stars ? (
              <View style={styles.tags}>
                {(stars > 3 ? goodTags : fixTags).map((tag) => {
                  const on = tags.includes(tag);
                  return (
                    <Pressable key={tag} onPress={() => setTags((list) => (on ? list.filter((item) => item !== tag) : [...list, tag]))} style={[styles.tag, on && styles.tagOn]}>
                      <Text style={[styles.tagText, on && { color: colors.night }]}>{tag}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.lead}>Your rating stays private to ROVEYA.</Text>
            )}
            <FlowCta label={stars ? "Submit and go on duty" : "Skip and go on duty"} icon="speedometer" onPress={finish} />
          </>
        ) : null}
      </DragSheet>
    </View>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <View style={styles.progress}>
      <View style={[styles.progressFill, { width: `${Math.round(Math.min(1, value) * 100)}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  empty: { alignItems: "center", justifyContent: "center", padding: 24, gap: 16 },
  top: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, height: 44, borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  chipDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold },
  chipText: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 14.5 },
  sos: { height: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: colors.burgundy, borderWidth: 1, borderColor: colors.goldBright, alignItems: "center", justifyContent: "center" },
  sosText: { color: colors.cream, fontFamily: type.bold, fontSize: 14, letterSpacing: 1.4 },
  toast: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 16, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.gold },
  toastText: { flex: 1, color: colors.cream, fontFamily: type.label, fontSize: 13 },
  recenter: { position: "absolute", right: 16, width: 46, height: 46, borderRadius: 23, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  kicker: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 10, letterSpacing: 2.4 },
  side: { color: colors.muted, fontFamily: type.labelStrong, fontSize: 12 },
  title: { color: colors.cream, fontFamily: type.display, fontSize: 21, lineHeight: 26, letterSpacing: -0.3 },
  lead: { color: colors.muted, fontFamily: type.body, fontSize: 13, lineHeight: 18 },
  progress: { height: 4, borderRadius: 2, backgroundColor: "rgba(246,241,220,0.1)", overflow: "hidden" },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: colors.gold },
  customer: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 18, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.hairline },
  customerMark: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.goldBright, alignItems: "center", justifyContent: "center" },
  customerLetter: { color: colors.night, fontFamily: type.labelStrong, fontSize: 17 },
  customerName: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15.5 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  meta: { color: colors.faint, fontFamily: type.body, fontSize: 12 },
  round: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell, alignItems: "center", justifyContent: "center" },
  roundGold: { backgroundColor: colors.gold, borderColor: colors.gold },
  link: { textAlign: "center", color: colors.gold, fontFamily: type.labelStrong, fontSize: 13.5, paddingVertical: 4 },
  inline: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 },
  dot: { color: colors.faint },
  otpRow: { flexDirection: "row", gap: 10 },
  otpBox: { flex: 1, height: 58, borderRadius: 16, backgroundColor: colors.night, borderWidth: 1, borderColor: "rgba(214,160,0,0.25)", alignItems: "center", justifyContent: "center" },
  otpBoxOn: { borderColor: colors.gold },
  otpBoxFilled: { backgroundColor: colors.mist, borderColor: "rgba(214,160,0,0.55)" },
  otpBoxWrong: { borderColor: colors.goldBright },
  otpText: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 26 },
  otpNote: { textAlign: "center", color: colors.faint, fontFamily: type.body, fontSize: 12 },
  receipt: { padding: 14, borderRadius: 18, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.hairline },
  rule: { height: 1, backgroundColor: colors.hairline, marginVertical: 8 },
  stars: { flexDirection: "row", justifyContent: "center", gap: 10, paddingVertical: 4 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line },
  tagOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  tagText: { color: colors.cream, fontFamily: type.label, fontSize: 13 },
});
