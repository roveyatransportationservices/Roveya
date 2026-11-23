import { useState } from "react";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button, Line, inr } from "../components/kit";
import { cancelFaqs, cityById } from "../data";
import { departInstant, formatInrPaise, refundFor } from "../refundPolicy";
import { dayLabel } from "../dates";
import { lookupRemote } from "../remote";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { Booking } from "../types";
import type { UserStack } from "../navigation";

type Step = "find" | "review" | "done";

export function CancelBookingScreen({ navigation }: NativeStackScreenProps<UserStack, "CancelBooking">) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const [pnr, setPnr] = useState("");
  const [phone, setPhone] = useState(store.user?.phone ?? "");
  const [error, setError] = useState("");
  const [step, setStep] = useState<Step>("find");
  const [found, setFound] = useState<Booking | null>(null);
  const [refund, setRefund] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const upcoming = store.user ? store.bookings.filter((booking) => booking.status === "Upcoming") : [];
  const ready = pnr.trim().length >= 6 && /^[6-9]\d{9}$/.test(phone);

  const submit = async () => {
    setWorking(true);
    setError("");
    try {
      if (store.live) {
        if (!store.user) {
          setError("Log in with the mobile number you booked with to cancel online.");
          return;
        }
        lookUp(await lookupRemote(pnr.trim().toUpperCase(), phone));
      } else {
        await new Promise((resolve) => setTimeout(resolve, 900));
        lookUp(store.bookings.find((item) => item.pnr === pnr.trim().toUpperCase() && item.phone === phone));
      }
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const lookUp = (booking: Booking | undefined) => {
    if (!booking) {
      setError("We could not find a booking with this ID and mobile number. Check the ticket in Bookings.");
      return;
    }
    if (booking.status === "Cancelled") {
      setError(`${booking.pnr} is already cancelled. ${inr(booking.refund ?? 0)} goes back to the original payment.`);
      return;
    }
    if (booking.status === "Completed") {
      setError(`${booking.pnr} was a completed trip, so it can no longer be cancelled.`);
      return;
    }
    setError("");
    setFound(booking);
    setStep("review");
  };

  const confirm = async () => {
    if (!found) return;
    setWorking(true);
    setError("");
    try {
      if (!store.live) await new Promise((resolve) => setTimeout(resolve, 1000));
      if (store.live && !store.bookings.some((item) => item.pnr === found.pnr)) await store.reloadBookings();
      setRefund(await store.cancel(found.pnr));
      setStep("done");
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const reset = () => {
    setStep("find");
    setFound(null);
    setPnr("");
  };

  const localAt = found ? departInstant(found.trip.departAt, found.trip.date) : null;
  const local = found && !store.live && localAt && !(found.secured && found.secure == null) ? refundFor(Math.round(found.total * 100), Math.round((found.secure ?? 0) * 100), Boolean(found.secured), localAt) : null;
  const quote = found ? (store.live ? (found.refundQuote ?? null) : (found.refundQuote ?? (local ? { percent: local.percent, amount: local.refundPaise / 100, refundPaise: local.refundPaise, note: `Estimated refund ${formatInrPaise(local.refundPaise)} (${local.percent}% of the refundable amount). The final amount is calculated when you confirm.` } : null))) : null;
  const refundPaise = quote ? (quote.refundPaise ?? Math.round(quote.amount * 100)) : null;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 6 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => (step === "review" ? setStep("find") : navigation.goBack())} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.cream} />
        </Pressable>
        <Text style={styles.title}>Cancel Booking</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {step === "find" ? (
          <>
            <View style={styles.intro}>
              <Text style={styles.heading}>Enter Ticket Details</Text>
              <Text style={styles.sub}>Use the PNR from your ticket in Bookings</Text>
            </View>
            <View style={styles.fields}>
              <View style={[styles.field, styles.fieldLine]}>
                <Ionicons name="ticket-outline" size={22} color={colors.gold} />
                <TextInput
                  value={pnr}
                  onChangeText={(text) => {
                    setPnr(text.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12));
                    setError("");
                  }}
                  placeholder="ROVEYA Booking ID (PNR)"
                  placeholderTextColor={colors.faint}
                  autoCapitalize="characters"
                  selectionColor={colors.gold}
                  style={styles.input}
                />
              </View>
              <View style={styles.field}>
                <Ionicons name="phone-portrait-outline" size={22} color={colors.gold} />
                <TextInput
                  value={phone}
                  onChangeText={(text) => {
                    setPhone(text.replace(/\D/g, "").slice(0, 10));
                    setError("");
                  }}
                  placeholder="Mobile Number"
                  placeholderTextColor={colors.faint}
                  keyboardType="number-pad"
                  selectionColor={colors.gold}
                  style={styles.input}
                />
              </View>
            </View>
            {error ? (
              <View style={styles.error}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            <View style={{ paddingHorizontal: 16, marginTop: 18 }}>
              <Button label={working ? "Finding your booking…" : "Submit"} disabled={!ready} loading={working} onPress={() => void submit()} />
            </View>

            {upcoming.length ? (
              <View style={{ paddingHorizontal: 16, marginTop: 18 }}>
                <Text style={styles.kicker}>YOUR UPCOMING TRIPS</Text>
                {upcoming.map((booking) => (
                  <Pressable
                    key={booking.pnr}
                    onPress={() => {
                      setPnr(booking.pnr);
                      setPhone(booking.phone);
                      setError("");
                    }}
                    style={styles.quick}
                  >
                    <MaterialCommunityIcons name="car-side" size={20} color={colors.gold} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.quickTitle}>{cityById(booking.trip.fromId).name} → {cityById(booking.trip.toId).name}</Text>
                      <Text style={styles.quickSub}>{dayLabel(booking.trip.date)} · {booking.boarding.time} · {booking.pnr}</Text>
                    </View>
                    <Text style={styles.quickUse}>Use</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        {step === "review" && found ? (
          <View style={{ padding: 16, gap: 14 }}>
            <View style={styles.ticket}>
              <View style={styles.ticketTop}>
                <Text style={styles.kicker}>{dayLabel(found.trip.date).toUpperCase()} · PNR {found.pnr}</Text>
                <Text style={styles.route}>{cityById(found.trip.fromId).name} → {cityById(found.trip.toId).name}</Text>
                <Text style={styles.sub}>{found.trip.operator} · {found.trip.car}</Text>
              </View>
              <View style={{ padding: 16 }}>
                <Line label="Boarding" value={`${found.boarding.time} · ${found.boarding.name}`} />
                <Line label="Seats" value={found.seats.map((seat) => seat.label).join(", ")} />
                <Line label="Travellers" value={found.travellers.map((item) => item.name.split(" ")[0] || "Traveller").join(", ")} />
                <Line label="Amount paid" value={inr(found.total)} />
              </View>
            </View>
            <View style={styles.refundCard}>
              <Text style={styles.refundLabel}>{quote ? "Estimated refund" : "Refund estimate"}</Text>
              <Text style={styles.refundValue}>{refundPaise == null ? "Unavailable" : formatInrPaise(refundPaise)}</Text>
              <Text style={styles.refundNote}>{quote?.note ?? found.refundNote ?? "A refund estimate is not available. This screen does not choose an amount. The stored refund is shown after the server cancels the booking."}</Text>
            </View>
            <Button label={working ? "Cancelling…" : refundPaise == null ? "Cancel booking" : `Cancel booking · estimate ${formatInrPaise(refundPaise)}`} tone="burgundy" icon="close-circle-outline" loading={working} onPress={() => void confirm()} />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <Button label="Keep my trip" tone="ghost" onPress={() => navigation.goBack()} />
          </View>
        ) : null}

        {step === "done" && found ? (
          <View style={{ padding: 16, alignItems: "center" }}>
            <View style={styles.doneRing}>
              <Ionicons name="checkmark" size={36} color={colors.night} />
            </View>
            <Text style={styles.doneTitle}>Booking {found.pnr} is cancelled</Text>
            <Text style={styles.doneLine}>The stored refund is {formatInrPaise(Math.round((refund ?? 0) * 100))}. ROVEYA Cash is credited at once. A card or UPI refund goes back to that payment.</Text>
            <Button label="Back to bookings" icon="ticket-outline" onPress={() => navigation.navigate("Tabs", { screen: "Bookings" })} style={{ alignSelf: "stretch", marginTop: 20 }} />
            <Button label="Cancel another booking" tone="ghost" onPress={reset} style={{ alignSelf: "stretch", marginTop: 10 }} />
          </View>
        ) : null}

        <View style={styles.faqCard}>
          <Text style={styles.faqTitle}>Frequently Asked Questions</Text>
          {cancelFaqs.map((faq, index) => {
            const expanded = open === faq.q;
            return (
              <Pressable key={faq.q} onPress={() => setOpen(expanded ? null : faq.q)} style={[styles.faq, index === 0 && { borderTopWidth: 1, borderTopColor: colors.hairline }]}>
                <View style={styles.faqHead}>
                  <Text style={styles.faqQ}>{faq.q}</Text>
                  <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={20} color={colors.gold} />
                </View>
                {expanded ? <Text style={styles.faqA}>{faq.a}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  title: { color: colors.cream, fontFamily: type.semibold, fontSize: 18 },
  intro: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 12 },
  heading: { color: colors.cream, fontFamily: type.semibold, fontSize: 18 },
  sub: { marginTop: 3, color: colors.muted, fontFamily: type.regular, fontSize: 12.5 },
  fields: { backgroundColor: colors.inkwell, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line },
  field: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, height: 58 },
  fieldLine: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  input: { flex: 1, height: 56, color: colors.cream, fontFamily: type.medium, fontSize: 15.5, letterSpacing: 0.5 },
  error: { flexDirection: "row", gap: 8, marginHorizontal: 16, marginTop: 14, padding: 12, borderRadius: 14, backgroundColor: "rgba(232,133,127,0.08)", borderWidth: 1, borderColor: "rgba(232,133,127,0.3)" },
  errorText: { flex: 1, color: colors.cream, fontFamily: type.regular, fontSize: 12.5, lineHeight: 18 },
  kicker: { color: colors.gold, fontFamily: type.semibold, fontSize: 11, letterSpacing: 2, marginBottom: 10 },
  quick: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, marginBottom: 8 },
  quickTitle: { color: colors.cream, fontFamily: type.semibold, fontSize: 14 },
  quickSub: { marginTop: 2, color: colors.faint, fontFamily: type.regular, fontSize: 12 },
  quickUse: { color: colors.gold, fontFamily: type.semibold, fontSize: 13 },
  ticket: { borderRadius: 20, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  ticketTop: { padding: 16, backgroundColor: colors.plum },
  route: { color: colors.cream, fontFamily: type.semibold, fontSize: 19 },
  refundCard: { alignItems: "center", padding: 18, borderRadius: 20, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.gold },
  refundLabel: { color: colors.muted, fontFamily: type.regular, fontSize: 13 },
  refundValue: { marginTop: 4, color: colors.gold, fontFamily: type.bold, fontSize: 32 },
  refundNote: { marginTop: 6, textAlign: "center", color: colors.muted, fontFamily: type.regular, fontSize: 12.5, lineHeight: 18 },
  doneRing: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center", marginTop: 10 },
  doneTitle: { marginTop: 16, textAlign: "center", color: colors.cream, fontFamily: type.semibold, fontSize: 20 },
  doneLine: { marginTop: 6, textAlign: "center", color: colors.muted, fontFamily: type.regular, fontSize: 13.5, lineHeight: 20 },
  faqCard: { marginHorizontal: 12, marginTop: 28, borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
  faqTitle: { color: colors.cream, fontFamily: type.semibold, fontSize: 18, marginBottom: 14 },
  faq: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  faqHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  faqQ: { flex: 1, color: colors.cream, fontFamily: type.regular, fontSize: 14.5, lineHeight: 20 },
  faqA: { marginTop: 8, color: colors.muted, fontFamily: type.regular, fontSize: 13, lineHeight: 19 },
});
