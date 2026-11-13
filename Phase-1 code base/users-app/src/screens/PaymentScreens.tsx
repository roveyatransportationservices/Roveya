import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button, Card, Header, Icon, Line, inr } from "../components/kit";
import { cityById } from "../data";
import { dayLabel } from "../dates";
import { draftTotals, useStore } from "../store";
import { colors, type } from "../theme";
import type { Glyph } from "../types";
import type { UserStack } from "../navigation";

type Method = { id: string; label: string; sub: string; icon: Glyph; group: "UPI" | "Cards" | "Net banking" | "Wallet" };

const methods: Method[] = [
  { id: "gpay", label: "Google Pay", sub: "UPI", icon: "mc:google", group: "UPI" },
  { id: "phonepe", label: "PhonePe", sub: "UPI", icon: "mc:cellphone-text", group: "UPI" },
  { id: "paytm", label: "Paytm", sub: "UPI", icon: "mc:wallet-outline", group: "UPI" },
  { id: "upi", label: "Any UPI ID", sub: "name@bank", icon: "mc:at", group: "UPI" },
  { id: "card", label: "Credit or debit card", sub: "Visa, Mastercard, RuPay", icon: "mc:credit-card-outline", group: "Cards" },
  { id: "bank", label: "Net banking", sub: "SBI, HDFC, ICICI, Axis and more", icon: "mc:bank-outline", group: "Net banking" },
  { id: "cash", label: "ROVEYA Cash", sub: "Instant, no OTP", icon: "mc:wallet-giftcard", group: "Wallet" },
];

export function PaymentScreen({ navigation }: NativeStackScreenProps<UserStack, "Payment">) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const draft = store.draft;
  const [method, setMethod] = useState("gpay");
  const [upiId, setUpiId] = useState("");
  const holdUntil = draft?.holdUntil;
  const left = () => (holdUntil ? Math.max(0, Math.round((Date.parse(holdUntil) - Date.now()) / 1000)) : 600);
  const [seconds, setSeconds] = useState(left);
  const [paying, setPaying] = useState(false);
  const [failure, setFailure] = useState("");

  useEffect(() => {
    setSeconds(left());
    const timer = setInterval(() => setSeconds((value) => (holdUntil ? left() : Math.max(0, value - 1))), 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdUntil]);

  if (!draft) return null;
  const totals = draftTotals(draft, store.cash);
  const chosen = methods.find((item) => item.id === method)!;
  const cashShort = method === "cash" && store.cash < totals.total;
  const upiBad = !store.live && method === "upi" && !/^[\w.-]{2,}@[a-z]{2,}$/i.test(upiId.trim());

  const pay = async () => {
    setPaying(true);
    setFailure("");
    try {
      if (!store.live) await new Promise((resolve) => setTimeout(resolve, 1600));
      const booking = await store.checkout(method === "cash" ? "wallet" : "online", `${chosen.group} · ${chosen.label}`);
      if (booking) navigation.reset({ index: 1, routes: [{ name: "Tabs" }, { name: "Confirmed", params: { pnr: booking.pnr } }] });
    } catch (error) {
      setFailure((error as Error).message);
    } finally {
      setPaying(false);
    }
  };

  const groups = ["UPI", "Cards", "Net banking", "Wallet"] as const;

  return (
    <View style={styles.screen}>
      <Header title="Payment" subtitle={`${cityById(draft.trip.fromId).name} → ${cityById(draft.trip.toId).name} · ${dayLabel(draft.trip.date)}`} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        <LinearGradient colors={[colors.burgundy, colors.cherry]} style={styles.amount}>
          <Text style={styles.amountLabel}>Amount to pay</Text>
          <Text style={styles.amountValue}>{inr(totals.total)}</Text>
          <View style={styles.timer}>
            <Ionicons name="time-outline" size={14} color={colors.gold} />
            <Text style={styles.timerText}>Seats held for {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</Text>
          </View>
        </LinearGradient>

        {groups.map((group) => (
          <View key={group}>
            <Text style={styles.section}>{group.toUpperCase()}</Text>
            <View style={styles.list}>
              {methods
                .filter((item) => item.group === group)
                .map((item, index, all) => {
                  const on = item.id === method;
                  return (
                    <View key={item.id}>
                      <Pressable onPress={() => setMethod(item.id)} style={[styles.row, index < all.length - 1 && !on && styles.rowLine]}>
                        <View style={styles.icon}>
                          <Icon name={item.icon} size={19} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.name}>{item.label}</Text>
                          <Text style={styles.sub}>{item.id === "cash" ? `Balance ${inr(store.cash)}` : item.sub}</Text>
                        </View>
                        <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                      </Pressable>
                      {on && item.id === "upi" ? (
                        <TextInput value={upiId} onChangeText={setUpiId} autoCapitalize="none" placeholder="yourname@okbank" placeholderTextColor={colors.faint} selectionColor={colors.gold} style={styles.upi} />
                      ) : null}
                    </View>
                  );
                })}
            </View>
          </View>
        ))}

        <View style={styles.safe}>
          <Ionicons name="lock-closed-outline" size={15} color={colors.gold} />
          <Text style={styles.safeText}>Payments are processed securely by Razorpay. ROVEYA never stores your card or UPI PIN.</Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {cashShort ? <Text style={styles.error}>ROVEYA Cash is short for this booking. Pick another way to pay.</Text> : null}
        {failure ? <Text style={styles.error}>{failure}</Text> : null}
        {seconds === 0 ? <Text style={styles.error}>Your seats were released. Go back and pick them again.</Text> : null}
        <Button label={paying ? "Confirming your seats…" : `Pay with ${chosen.label}`} trailing={inr(totals.total)} loading={paying} disabled={cashShort || upiBad || seconds === 0} onPress={() => void pay()} />
      </View>

      {paying ? (
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <ActivityIndicator size="large" color={colors.gold} />
            <Text style={styles.overlayTitle}>Processing payment</Text>
            <Text style={styles.overlayText}>{store.live && method !== "cash" ? "Finish paying on the Razorpay page. Your seats confirm here as soon as the payment goes through." : `Confirming your seats with ${draft.trip.operator}. Please don't close the app.`}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function ConfirmedScreen({ route, navigation }: NativeStackScreenProps<UserStack, "Confirmed">) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const booking = store.bookings.find((item) => item.pnr === route.params.pnr);
  if (!booking) return null;
  const { trip } = booking;
  return (
    <View style={[styles.screen, { paddingTop: Math.max(insets.top, 16) + 10 }]}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        <View style={styles.doneRing}>
          <View style={styles.doneDisc}>
            <Ionicons name="checkmark" size={36} color={colors.night} />
          </View>
        </View>
        <Text style={styles.doneTitle}>Your seats are booked</Text>
        <Text style={styles.doneLead}>The ticket is on its way by SMS{store.user ? ` to +91 ${store.user.phone}` : ""}. Show it, or your PNR, at boarding.</Text>

        <Card style={{ marginTop: 22 }}>
          <View style={styles.pnrRow}>
            <Text style={styles.pnrLabel}>PNR</Text>
            <Text style={styles.pnr}>{booking.pnr}</Text>
          </View>
          <View style={styles.rule} />
          <Text style={styles.routeText}>{cityById(trip.fromId).name} → {cityById(trip.toId).name}</Text>
          <Text style={styles.sub}>{dayLabel(trip.date)} · {trip.operator} · {trip.car}</Text>
          <View style={styles.rule} />
          <Line label="Boarding" value={`${booking.boarding.time} · ${booking.boarding.name}`} />
          <Line label="Drop" value={`${booking.drop.time} · ${booking.drop.name}`} />
          <Line label="Seats" value={booking.seats.map((seat) => seat.label).join(", ")} />
          <Line label="Travellers" value={booking.travellers.map((item) => item.name.split(" ")[0]).join(", ")} />
          <Line label="Paid" value={`${inr(booking.total)} · ${booking.paidWith}`} strong />
        </Card>

        <View style={styles.safe}>
          <Ionicons name="person-circle-outline" size={18} color={colors.gold} />
          <Text style={styles.safeText}>Your captain's name, photo, phone, and car number arrive by SMS and in Bookings 2 hours before departure.</Text>
        </View>

        <Button label="View ticket" icon="ticket-outline" onPress={() => navigation.replace("Ticket", { pnr: booking.pnr })} style={{ marginTop: 20 }} />
        <Button label="Back to home" tone="ghost" onPress={() => navigation.navigate("Tabs", { screen: "Home" })} style={{ marginTop: 10 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  amount: { borderRadius: 22, padding: 18, borderWidth: 1, borderColor: colors.line },
  amountLabel: { color: colors.muted, fontFamily: type.regular, fontSize: 13 },
  amountValue: { marginTop: 4, color: colors.cream, fontFamily: type.bold, fontSize: 32 },
  timer: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: "rgba(18,6,13,0.4)" },
  timerText: { color: colors.cream, fontFamily: type.medium, fontSize: 12 },
  section: { marginTop: 20, marginBottom: 10, color: colors.gold, fontFamily: type.semibold, fontSize: 11, letterSpacing: 2 },
  list: { borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  name: { color: colors.cream, fontFamily: type.semibold, fontSize: 14.5 },
  sub: { marginTop: 2, color: colors.faint, fontFamily: type.regular, fontSize: 12 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.faint, alignItems: "center", justifyContent: "center" },
  radioOn: { borderColor: colors.gold },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.gold },
  upi: { marginHorizontal: 14, marginBottom: 14, height: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.night, paddingHorizontal: 14, color: colors.cream, fontFamily: type.medium, fontSize: 14.5 },
  safe: { flexDirection: "row", gap: 8, marginTop: 18, padding: 12, borderRadius: 14, backgroundColor: "rgba(214,160,0,0.08)", borderWidth: 1, borderColor: colors.line },
  safeText: { flex: 1, color: colors.muted, fontFamily: type.regular, fontSize: 12.5, lineHeight: 18 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, gap: 8, backgroundColor: colors.inkwell, borderTopWidth: 1, borderTopColor: colors.line },
  error: { color: colors.danger, fontFamily: type.regular, fontSize: 12, textAlign: "center" },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(18,6,13,0.85)", alignItems: "center", justifyContent: "center", gap: 14 },
  overlayCard: { width: "80%", alignItems: "center", gap: 10, padding: 24, borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  overlayTitle: { marginTop: 4, color: colors.cream, fontFamily: type.semibold, fontSize: 16 },
  overlayText: { color: colors.muted, fontFamily: type.regular, fontSize: 13, lineHeight: 19, textAlign: "center" },
  doneRing: { alignSelf: "center", width: 104, height: 104, borderRadius: 52, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  doneDisc: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  doneTitle: { marginTop: 18, textAlign: "center", color: colors.cream, fontFamily: type.semibold, fontSize: 24 },
  doneLead: { marginTop: 6, textAlign: "center", color: colors.muted, fontFamily: type.regular, fontSize: 13.5, lineHeight: 20 },
  pnrRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pnrLabel: { color: colors.faint, fontFamily: type.semibold, fontSize: 11, letterSpacing: 2 },
  pnr: { color: colors.gold, fontFamily: type.bold, fontSize: 20, letterSpacing: 2 },
  rule: { height: 1, backgroundColor: colors.hairline, marginVertical: 12 },
  routeText: { color: colors.cream, fontFamily: type.semibold, fontSize: 17 },
});
