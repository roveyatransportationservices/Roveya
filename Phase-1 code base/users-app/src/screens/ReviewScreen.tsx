import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button, Card, Header, Icon, Line, inr } from "../components/kit";
import { cityById, durationLabel } from "../data";
import { dayLabel } from "../dates";
import { SECURE_FEE, draftTotals, useStore } from "../store";
import { colors, type } from "../theme";
import type { Gender, Traveller } from "../types";
import type { UserStack } from "../navigation";

export function ReviewScreen({ navigation }: NativeStackScreenProps<UserStack, "Review">) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const draft = store.draft;
  const [tried, setTried] = useState(false);
  const [holding, setHolding] = useState(false);
  const [holdError, setHoldError] = useState("");
  if (!draft || !draft.boarding || !draft.drop) return null;
  const { trip } = draft;
  const totals = draftTotals(draft, store.cash);

  const setTraveller = (seatId: string, patch: Partial<Traveller>) =>
    store.patchDraft({ travellers: draft.travellers.map((item) => (item.seatId === seatId ? { ...item, ...patch } : item)) });

  const travellerOk = (item: Traveller) => item.name.trim().length >= 2 && Number(item.age) >= 1 && Number(item.age) <= 99 && item.gender !== null;
  const phoneOk = /^[6-9]\d{9}$/.test(draft.phone);
  const emailOk = !draft.email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(draft.email.trim());
  const ready = phoneOk && emailOk && draft.travellers.every(travellerOk);

  const pay = async () => {
    setTried(true);
    if (!ready) return;
    setHolding(true);
    setHoldError("");
    try {
      if (store.live) await store.hold();
      else await new Promise((resolve) => setTimeout(resolve, 800));
      navigation.navigate("Payment");
    } catch (failure) {
      setHoldError((failure as Error).message);
    } finally {
      setHolding(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Header title="Review and pay" subtitle={`${trip.operator} · ${trip.car}`} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 150 }} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={styles.kicker}>{dayLabel(trip.date).toUpperCase()}</Text>
          <View style={styles.journey}>
            <View style={{ flex: 1 }}>
              <Text style={styles.time}>{draft.boarding.time}</Text>
              <Text style={styles.city}>{cityById(trip.fromId).name}</Text>
              <Text style={styles.point} numberOfLines={2}>{draft.boarding.name}</Text>
            </View>
            <View style={styles.mid}>
              <Icon name="mc:car-side" size={20} />
              <Text style={styles.midText}>{durationLabel(trip.durationMin)}</Text>
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <Text style={styles.time}>{draft.drop.time}</Text>
              <Text style={styles.city}>{cityById(trip.toId).name}</Text>
              <Text style={[styles.point, { textAlign: "right" }]} numberOfLines={2}>{draft.drop.name}</Text>
            </View>
          </View>
          <View style={styles.rule} />
          <Text style={styles.meta}>
            Seats {draft.seats.map((seat) => seat.label).join(", ")} · {trip.carClass} · AC
          </Text>
          <Pressable onPress={() => navigation.navigate("Points")} hitSlop={6}>
            <Text style={styles.change}>Change boarding or drop</Text>
          </Pressable>
        </Card>

        <Text style={styles.section}>CONTACT DETAILS</Text>
        <Card style={{ gap: 12 }}>
          <Text style={styles.small}>Your ticket and the captain's details are sent here.</Text>
          <View style={[styles.inputRow, tried && !phoneOk && styles.inputBad]}>
            <Text style={styles.prefix}>+91</Text>
            <TextInput value={draft.phone} onChangeText={(text) => store.patchDraft({ phone: text.replace(/\D/g, "").slice(0, 10) })} keyboardType="number-pad" placeholder="Mobile number" placeholderTextColor={colors.faint} selectionColor={colors.gold} style={styles.input} />
          </View>
          <View style={[styles.inputRow, !emailOk && styles.inputBad]}>
            <Ionicons name="mail-outline" size={16} color={colors.gold} />
            <TextInput value={draft.email} onChangeText={(text) => store.patchDraft({ email: text })} keyboardType="email-address" autoCapitalize="none" placeholder="Email (optional)" placeholderTextColor={colors.faint} selectionColor={colors.gold} style={styles.input} />
          </View>
        </Card>

        <Text style={styles.section}>TRAVELLER DETAILS</Text>
        {draft.travellers.map((traveller, index) => {
          const seat = draft.seats.find((item) => item.id === traveller.seatId)!;
          const lockedFemale = seat.state === "female";
          const bad = tried && !travellerOk(traveller);
          return (
            <Card key={traveller.seatId} style={[{ gap: 12, marginBottom: 10 }, bad && { borderColor: colors.danger }]}>
              <View style={styles.travellerHead}>
                <Text style={styles.travellerTitle}>Traveller {index + 1}</Text>
                <Text style={styles.seatBadge}>Seat {seat.label} · {inr(seat.price)}</Text>
              </View>
              {index === 0 && store.user?.name && !traveller.name ? (
                <Pressable onPress={() => setTraveller(traveller.seatId, { name: store.user!.name })}>
                  <Text style={styles.change}>Use my name, {store.user.name}</Text>
                </Pressable>
              ) : null}
              <TextInput value={traveller.name} onChangeText={(text) => setTraveller(traveller.seatId, { name: text })} placeholder="Full name as on ID" placeholderTextColor={colors.faint} autoCapitalize="words" selectionColor={colors.gold} style={styles.field} />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TextInput value={traveller.age} onChangeText={(text) => setTraveller(traveller.seatId, { age: text.replace(/\D/g, "").slice(0, 2) })} keyboardType="number-pad" placeholder="Age" placeholderTextColor={colors.faint} selectionColor={colors.gold} style={[styles.field, { width: 90 }]} />
                {(["Male", "Female"] as Gender[]).map((gender) => {
                  const on = traveller.gender === gender;
                  const blocked = lockedFemale && gender === "Male";
                  return (
                    <Pressable key={gender} disabled={blocked} onPress={() => setTraveller(traveller.seatId, { gender })} style={[styles.gender, on && styles.genderOn, blocked && { opacity: 0.35 }]}>
                      <Icon name={gender === "Male" ? "mc:human-male" : "mc:human-female"} size={18} color={on ? colors.night : gender === "Female" ? colors.rose : colors.sky} />
                      <Text style={[styles.genderText, on && { color: colors.night }]}>{gender}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {lockedFemale ? <Text style={styles.small}>This seat is in the Women Zone, so the traveller must be a woman.</Text> : null}
            </Card>
          );
        })}

        <Pressable onPress={() => store.patchDraft({ secured: !draft.secured })} style={[styles.secure, draft.secured && { borderColor: colors.gold }]}>
          <View style={[styles.check, draft.secured && styles.checkOn]}>{draft.secured ? <Ionicons name="checkmark" size={14} color={colors.night} /> : null}</View>
          <View style={{ flex: 1 }}>
            <Text style={styles.secureTitle}>Secure your trip · {inr(SECURE_FEE)} per seat</Text>
            <Text style={styles.small}>Cancelling at least 6 hours before departure refunds the amount you paid, except this fee. Without it, the time bands apply.</Text>
          </View>
          <Ionicons name="shield-checkmark" size={22} color={colors.gold} />
        </Pressable>

        <Text style={styles.section}>FARE DETAILS</Text>
        <Card>
          <Line label={`Seat fare · ${draft.seats.length} seat${draft.seats.length > 1 ? "s" : ""}`} value={inr(totals.fare)} />
          <Line label="Booking fee" value={inr(totals.bookingFee ?? 0)} />
          <Line label="GST on booking fee (18%)" value={inr(totals.gst)} />
          {draft.secured ? <Line label="Trip security" value={inr(totals.secure)} /> : null}
          <View style={styles.rule} />
          <Line label="Total to pay" value={inr(totals.total)} strong />
        </Card>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {tried && !ready ? <Text style={styles.footerError}>Fill in the mobile number and every traveller's name, age, and gender.</Text> : null}
        {holdError ? <Text style={styles.footerError}>{holdError}</Text> : null}
        <Button label={holding ? "Holding your seats…" : "Proceed to pay"} trailing={inr(totals.total)} loading={holding} onPress={() => void pay()} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  kicker: { color: colors.gold, fontFamily: type.semibold, fontSize: 11, letterSpacing: 2 },
  journey: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 10 },
  time: { color: colors.cream, fontFamily: type.semibold, fontSize: 20 },
  city: { marginTop: 2, color: colors.cream, fontFamily: type.medium, fontSize: 13.5 },
  point: { marginTop: 2, color: colors.faint, fontFamily: type.regular, fontSize: 12 },
  mid: { alignItems: "center", paddingTop: 6, gap: 4 },
  midText: { color: colors.muted, fontFamily: type.medium, fontSize: 11.5 },
  rule: { height: 1, backgroundColor: colors.hairline, marginVertical: 12 },
  meta: { color: colors.muted, fontFamily: type.regular, fontSize: 13 },
  change: { marginTop: 8, color: colors.gold, fontFamily: type.medium, fontSize: 13 },
  section: { marginTop: 22, marginBottom: 10, color: colors.gold, fontFamily: type.semibold, fontSize: 11, letterSpacing: 2 },
  small: { color: colors.muted, fontFamily: type.regular, fontSize: 12.5, lineHeight: 18 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10, height: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, paddingHorizontal: 14 },
  inputBad: { borderColor: colors.danger },
  prefix: { color: colors.cream, fontFamily: type.semibold, fontSize: 15 },
  input: { flex: 1, height: 46, color: colors.cream, fontFamily: type.medium, fontSize: 15 },
  travellerHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  travellerTitle: { color: colors.cream, fontFamily: type.semibold, fontSize: 15 },
  seatBadge: { color: colors.gold, fontFamily: type.medium, fontSize: 12.5 },
  field: { height: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, paddingHorizontal: 14, color: colors.cream, fontFamily: type.medium, fontSize: 15 },
  gender: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  genderOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  genderText: { color: colors.cream, fontFamily: type.medium, fontSize: 14 },
  secure: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell },
  secureTitle: { color: colors.cream, fontFamily: type.semibold, fontSize: 14, marginBottom: 3 },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.faint, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  couponRow: { flexDirection: "row", alignItems: "center", gap: 10, height: 50, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: colors.gold, backgroundColor: colors.night, paddingHorizontal: 14 },
  applyText: { color: colors.gold, fontFamily: type.bold, fontSize: 13, letterSpacing: 1 },
  offer: { width: 168, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night },
  offerOn: { borderColor: colors.gold, backgroundColor: colors.mist },
  offerCode: { color: colors.gold, fontFamily: type.bold, fontSize: 12.5, letterSpacing: 1 },
  offerTitle: { marginTop: 3, color: colors.muted, fontFamily: type.regular, fontSize: 12 },
  cashRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  cashText: { color: colors.cream, fontFamily: type.medium, fontSize: 13.5 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, gap: 8, backgroundColor: colors.inkwell, borderTopWidth: 1, borderTopColor: colors.line },
  footerError: { color: colors.danger, fontFamily: type.regular, fontSize: 12, textAlign: "center" },
});
