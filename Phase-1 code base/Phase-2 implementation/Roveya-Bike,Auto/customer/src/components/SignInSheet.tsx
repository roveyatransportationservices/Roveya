import { useEffect, useRef, useState, type ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Animated, Image, PanResponder, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, type } from "../theme";

const riders = [
  { image: require("../../assets/cust-bike-student.jpg"), label: "BIKE", title: "Bike", line: "Quick rides through city traffic.", ratio: 1, lift: -0.1 },
  { image: require("../../assets/cust-auto-couple.jpg"), label: "AUTO", title: "Auto", line: "Doorstep pickups for the daily run.", ratio: 1, lift: -0.14 },
  { image: require("../../assets/cust-pool-group.jpg"), label: "TAXIPOOL", title: "Taxipool", line: "A seat of your own, city to city.", ratio: 0.75, lift: -0.12 },
] as const;

const promises = [
  { icon: "pricetag-outline", title: "Fare before you ride", line: "The price is shown up front." },
  { icon: "shield-checkmark-outline", title: "Verified captains", line: "Every captain is checked by ROVEYA." },
  { icon: "share-social-outline", title: "Share your trip", line: "Send the ride to someone you trust." },
  { icon: "wallet-outline", title: "Cash or online", line: "Pay the way you like." },
] as const;

const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

function RiderTile({ index, style, reveal }: { index: number; style: object; reveal: Animated.Value }) {
  const rider = riders[index];
  const [box, setBox] = useState({ width: 0, height: 0 });
  const imageHeight = Math.max(box.height, box.width / rider.ratio);
  return (
    <View style={[styles.tile, style]} onLayout={(event) => setBox(event.nativeEvent.layout)}>
      {box.width ? (
        <Image source={rider.image} style={[styles.tileImage, { width: box.width, height: imageHeight, top: Math.min(0, Math.max(box.height - imageHeight, imageHeight * rider.lift)) }]} resizeMode="cover" />
      ) : null}
      <View style={styles.tileChip}>
        <Text style={styles.tileChipText}>{rider.label}</Text>
      </View>
      <Animated.View pointerEvents="none" style={[styles.tileCaption, { opacity: reveal }]}>
        <LinearGradient colors={["rgba(18,6,13,0)", "rgba(18,6,13,0.92)"]} style={styles.fillAbs} />
        <Text style={styles.tileTitle}>{rider.title}</Text>
        <Text style={styles.tileLine}>{rider.line}</Text>
      </Animated.View>
    </View>
  );
}

export function Keypad({ onKey, onClear }: { onKey: (key: string) => void; onClear: () => void }) {
  return (
    <View style={styles.keypad}>
      {keys.map((key, at) => (
        <Pressable
          key={at}
          accessibilityRole={key ? "button" : undefined}
          accessibilityLabel={key === "back" ? "Delete" : key || undefined}
          disabled={!key}
          onPress={() => onKey(key)}
          onLongPress={key === "back" ? onClear : undefined}
          style={({ pressed }) => [styles.key, pressed && key ? styles.keyOn : null]}
        >
          {key === "back" ? <Ionicons name="backspace-outline" size={22} color={colors.cream} /> : <Text style={styles.keyText}>{key}</Text>}
        </Pressable>
      ))}
    </View>
  );
}

export function SignInSheet({
  kicker,
  title,
  onBack,
  onKey,
  showBack = true,
  children,
}: {
  kicker: string;
  title: string;
  onBack: () => void;
  onKey: (key: string) => void;
  showBack?: boolean;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(true);
  const [sheetHeight, setSheetHeight] = useState(0);
  const drop = useRef(new Animated.Value(0)).current;
  const bar = 104 + Math.max(insets.bottom, 12);
  const travel = Math.max(1, sheetHeight - bar);

  const openRef = useRef(open);
  openRef.current = open;
  const travelRef = useRef(travel);
  travelRef.current = travel;
  const keyRef = useRef(onKey);
  keyRef.current = onKey;

  const settle = (next: boolean) => {
    setOpen(next);
    Animated.spring(drop, { toValue: next ? 0 : 1, useNativeDriver: false, speed: 14, bounciness: 4 }).start();
  };

  const grabbed = useRef(0);
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => {
        drop.stopAnimation((value) => {
          grabbed.current = value;
        });
      },
      onPanResponderMove: (_, gesture) => {
        drop.setValue(Math.min(1, Math.max(0, grabbed.current + gesture.dy / travelRef.current)));
      },
      onPanResponderRelease: (_, gesture) => {
        const at = grabbed.current + gesture.dy / travelRef.current;
        if (gesture.vy > 0.6) settle(false);
        else if (gesture.vy < -0.6) settle(true);
        else settle(at < 0.5);
      },
      onPanResponderTerminate: () => settle(openRef.current),
    }),
  ).current;

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (/^\d$/.test(event.key)) {
        if (!openRef.current) settle(true);
        keyRef.current(event.key);
      } else if (event.key === "Backspace") keyRef.current("back");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const sheetShift = drop.interpolate({ inputRange: [0, 1], outputRange: [0, travel] });
  const bodyFade = drop.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0], extrapolate: "clamp" });

  return (
    <View style={styles.screen}>
      <View style={[styles.collage, { paddingTop: Math.max(insets.top, 12) + 4 }]}>
        <View style={styles.collageGrid}>
          <View style={styles.collageCol}>
            <RiderTile index={0} style={{ flex: 1 }} reveal={drop} />
            <RiderTile index={1} style={{ flex: 1 }} reveal={drop} />
          </View>
          <View style={styles.collageCol}>
            <RiderTile index={2} style={{ flex: 1 }} reveal={drop} />
          </View>
        </View>
        <LinearGradient pointerEvents="none" colors={["rgba(18,6,13,0.75)", "rgba(18,6,13,0)"]} locations={[0, 1]} style={[styles.collageTopFade, { height: Math.max(insets.top, 12) + 52 }]} />
        <View style={[styles.collageBar, { top: Math.max(insets.top, 12) + 12 }]}>
          {showBack ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={onBack} style={({ pressed }) => [styles.backCircle, pressed && { backgroundColor: colors.plum }]}>
              <Ionicons name="arrow-back" size={18} color={colors.cream} />
            </Pressable>
          ) : (
            <View style={styles.backCircle} />
          )}
        </View>
      </View>

      <Animated.View style={[styles.promises, { opacity: drop, transform: [{ translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }]}>
        <Text style={styles.promisesKicker}>WHY RIDERS CHOOSE ROVEYA</Text>
        <View style={styles.promisesGrid}>
          {promises.map((item) => (
            <View key={item.title} style={styles.promise}>
              <View style={styles.promiseIcon}>
                <Ionicons name={item.icon} size={16} color={colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.promiseTitle}>{item.title}</Text>
                <Text style={styles.promiseLine}>{item.line}</Text>
              </View>
            </View>
          ))}
        </View>
      </Animated.View>
      <View style={{ height: bar }} />

      <Animated.View
        onLayout={(event) => setSheetHeight(event.nativeEvent.layout.height)}
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 6, transform: [{ translateY: sheetShift }] }]}
        {...pan.panHandlers}
      >
        <View>
          <View style={styles.sheetGrip}>
            <View style={styles.sheetHandle} />
          </View>
          <Pressable onPress={() => (open ? null : settle(true))}>
            <Text style={styles.sheetKicker}>{kicker}</Text>
            <Text style={styles.sheetTitle}>{title}</Text>
          </Pressable>
        </View>
        <Animated.View style={{ opacity: bodyFade }} pointerEvents={open ? "auto" : "none"}>
          {children}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  fillAbs: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  collage: { flex: 1, minHeight: 230, paddingHorizontal: 10 },
  collageGrid: { flex: 1, flexDirection: "row", gap: 8 },
  collageCol: { flex: 1, gap: 8 },
  tile: { borderRadius: 20, overflow: "hidden", backgroundColor: colors.paper },
  tileImage: { position: "absolute", left: 0 },
  tileChip: { position: "absolute", top: 10, right: 10, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, backgroundColor: "rgba(18,6,13,0.72)", borderWidth: 1, borderColor: colors.line },
  tileChipText: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 9, letterSpacing: 1.6 },
  tileCaption: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingTop: 34, paddingBottom: 12 },
  tileTitle: { color: colors.cream, fontFamily: type.display, fontSize: 16, lineHeight: 20 },
  tileLine: { marginTop: 2, color: colors.muted, fontFamily: type.body, fontSize: 11.5, lineHeight: 15 },
  collageTopFade: { position: "absolute", top: 0, left: 0, right: 0 },
  collageBar: { position: "absolute", left: 18, right: 18, flexDirection: "row", alignItems: "center", gap: 12 },
  backCircle: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: "rgba(28,10,20,0.75)", alignItems: "center", justifyContent: "center" },
  promises: { paddingHorizontal: 18, paddingTop: 14 },
  promisesKicker: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 9.5, letterSpacing: 2.2, marginBottom: 10 },
  promisesGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  promise: { width: "48.5%", flexDirection: "row", alignItems: "flex-start", gap: 9 },
  promiseIcon: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell, alignItems: "center", justifyContent: "center" },
  promiseTitle: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 12.5 },
  promiseLine: { marginTop: 1, color: colors.faint, fontFamily: type.body, fontSize: 11, lineHeight: 14 },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: colors.inkwell, borderTopLeftRadius: 32, borderTopRightRadius: 32, borderTopWidth: 1, borderColor: colors.line, paddingHorizontal: 22, shadowColor: "#000000", shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: -6 }, elevation: 18 },
  sheetGrip: { alignItems: "center", paddingTop: 10, paddingBottom: 8 },
  sheetHandle: { width: 44, height: 4, borderRadius: 2, backgroundColor: "rgba(214,160,0,0.45)" },
  sheetKicker: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 9.5, letterSpacing: 2.2 },
  sheetTitle: { marginTop: 6, color: colors.cream, fontFamily: type.display, fontSize: 24, lineHeight: 29, letterSpacing: -0.4 },
  keypad: { marginTop: 6, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 2 },
  key: { width: "31.5%", height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  keyOn: { backgroundColor: colors.plum },
  keyText: { color: colors.cream, fontFamily: type.label, fontSize: 23 },
});
