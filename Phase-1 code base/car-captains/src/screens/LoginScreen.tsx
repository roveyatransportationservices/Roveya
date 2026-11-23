import { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Icon, Logo, Wordmark } from "../components/kit";
import { service } from "../service";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { Glyph } from "../types";

const perks: { icon: Glyph; text: string }[] = [
  { icon: "mc:car-seat", text: "Sell every empty seat on trips you already drive" },
  { icon: "mc:calendar-sync-outline", text: "Daily, weekly or monthly payouts, your choice" },
  { icon: "mc:account-check-outline", text: "Verified travellers and a 5 AM to 11 PM desk" },
];

export function LoginScreen() {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [byEmail, setByEmail] = useState(false);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(30);
  const otpInput = useRef<TextInput>(null);
  const validPhone = /^[6-9]\d{9}$/.test(phone);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  useEffect(() => {
    if (step !== "otp" || seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [step, seconds]);

  const send = async () => {
    if (byEmail ? !validEmail : !validPhone) return setError(byEmail ? "Enter a valid email address." : "Enter a 10-digit mobile number starting with 6, 7, 8, or 9.");
    setError("");
    setBusy(true);
    try {
      await service.sendCode(phone, byEmail ? email.trim() : undefined);
      setOtp("");
      setSeconds(30);
      setStep("otp");
      setTimeout(() => otpInput.current?.focus(), 200);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value: string) => {
    setOtp(value);
    if (value.length < 6) return;
    setBusy(true);
    setError("");
    try {
      store.signedIn(await service.verify(phone, value, byEmail ? email.trim() : undefined));
    } catch (failure) {
      setError((failure as Error).message);
      setOtp("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.hero}>
        <Image source={require("../../assets/banner-cab.jpg")} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <LinearGradient colors={["rgba(18,6,13,0.55)", "rgba(18,6,13,0.4)", colors.night]} style={StyleSheet.absoluteFill} />
        <View style={[styles.brand, { paddingTop: Math.max(insets.top, 14) + 8 }]}>
          <Logo size={38} />
          <Wordmark size={16} kicker="Captain · Car seats" />
        </View>
        <View style={styles.heroText}>
          <Text style={styles.heroTitle}>Drive your route.{"\n"}Fill every seat.</Text>
        </View>
      </View>

      <ScrollView style={styles.sheet} contentContainerStyle={{ padding: 20, paddingBottom: Math.max(insets.bottom, 18) + 10 }} keyboardShouldPersistTaps="handled">
        {step === "phone" ? (
          <>
            <Text style={styles.title}>Log in or join as a captain</Text>
            <Text style={styles.lead}>{byEmail ? "Use your email. You can add the mobile number on your licence later, on this same account." : "Use the mobile number you want travellers and the ROVEYA desk to reach you on."}</Text>
            {byEmail ? (
              <TextInput value={email} onChangeText={(text) => { setEmail(text.trim()); setError(""); }} autoCapitalize="none" keyboardType="email-address" placeholder="you@email.com" placeholderTextColor={colors.faint} selectionColor={colors.gold} style={styles.phoneInput} autoFocus />
            ) : (
            <View style={[styles.phoneBox, error ? { borderColor: colors.danger } : null]}>
              <Text style={styles.prefix}>+91</Text>
              <View style={styles.divider} />
              <TextInput
                value={phone}
                onChangeText={(text) => {
                  setPhone(text.replace(/\D/g, "").slice(0, 10));
                  setError("");
                }}
                placeholder="Mobile number"
                placeholderTextColor={colors.faint}
                keyboardType="number-pad"
                maxLength={10}
                selectionColor={colors.gold}
                style={styles.phoneInput}
                autoFocus
              />
            </View>
            )}
            <Pressable onPress={() => { setByEmail((value) => !value); setError(""); }}>
              <Text style={styles.preview}>{byEmail ? "Use mobile number instead" : "Use email instead"}</Text>
            </Pressable>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button label={busy ? "Sending OTP…" : "Get OTP"} onPress={() => void send()} disabled={byEmail ? !validEmail : !validPhone} loading={busy} style={{ marginTop: 18 }} />
            <View style={styles.perks}>
              {perks.map((perk) => (
                <View key={perk.text} style={styles.perk}>
                  <View style={styles.perkIcon}>
                    <Icon name={perk.icon} size={18} />
                  </View>
                  <Text style={styles.perkText}>{perk.text}</Text>
                </View>
              ))}
            </View>
            {service.live ? null : <Text style={styles.preview}>Sign-in needs a connection so the code can be sent.</Text>}
          </>
        ) : (
          <>
            <Pressable onPress={() => setStep("phone")} style={styles.backRow} hitSlop={8}>
              <Ionicons name="arrow-back" size={16} color={colors.gold} />
              <Text style={styles.backText}>{byEmail ? "Change email" : "Change number"}</Text>
            </Pressable>
            <Text style={styles.title}>Enter the 6-digit code</Text>
            <Text style={styles.lead}>{byEmail ? `Enter the code for ${email.trim()}.` : `Code for +91 ${phone.slice(0, 5)} ${phone.slice(5)}.`}</Text>
            <View style={styles.otpRow}>
              {[0, 1, 2, 3, 4, 5].map((position) => (
                <View key={position} style={[styles.otpBox, otp.length === position && styles.otpBoxOn, error ? { borderColor: colors.danger } : null]}>
                  <Text style={styles.otpDigit}>{otp[position] ?? ""}</Text>
                </View>
              ))}
              <TextInput
                ref={otpInput}
                accessibilityLabel="Verification code"
                value={otp}
                onChangeText={(text) => void verify(text.replace(/\D/g, "").slice(0, 6))}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={4}
                caretHidden
                editable={!busy}
                style={styles.hidden}
                autoFocus
              />
            </View>
            {busy ? (
              <View style={styles.checking}>
                <ActivityIndicator size="small" color={colors.gold} />
                <Text style={[styles.hint, { marginTop: 0 }]}>Verifying code…</Text>
              </View>
            ) : error ? (
              <Text style={styles.error}>{error}</Text>
            ) : null}
            <Pressable disabled={seconds > 0 || busy} onPress={() => void send()} style={{ marginTop: 18 }}>
              <Text style={[styles.resend, seconds > 0 && { color: colors.faint }]}>{seconds > 0 ? `Resend code in 0:${String(seconds).padStart(2, "0")}` : "Resend code"}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  hero: { height: 270, justifyContent: "space-between" },
  brand: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20 },
  heroText: { paddingHorizontal: 20, paddingBottom: 34 },
  heroTitle: { color: colors.cream, fontFamily: type.semibold, fontSize: 28, lineHeight: 34 },
  sheet: { flex: 1, marginTop: -18, borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: colors.inkwell, borderTopWidth: 1, borderColor: colors.line },
  title: { color: colors.cream, fontFamily: type.semibold, fontSize: 21, lineHeight: 27 },
  lead: { marginTop: 6, color: colors.muted, fontFamily: type.regular, fontSize: 13.5, lineHeight: 20 },
  phoneBox: { marginTop: 20, flexDirection: "row", alignItems: "center", height: 54, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, paddingHorizontal: 14 },
  prefix: { color: colors.cream, fontFamily: type.semibold, fontSize: 16 },
  divider: { width: 1, height: 24, backgroundColor: colors.line, marginHorizontal: 12 },
  phoneInput: { flex: 1, height: 52, color: colors.cream, fontFamily: type.medium, fontSize: 16, letterSpacing: 1 },
  error: { marginTop: 10, color: colors.danger, fontFamily: type.regular, fontSize: 12.5, lineHeight: 18 },
  hint: { marginTop: 10, color: colors.faint, fontFamily: type.regular, fontSize: 12.5 },
  checking: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  perks: { marginTop: 24, gap: 12 },
  perk: { flexDirection: "row", alignItems: "center", gap: 12 },
  perkIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line },
  perkText: { flex: 1, color: colors.cream, fontFamily: type.regular, fontSize: 13.5, lineHeight: 19 },
  preview: { marginTop: 22, textAlign: "center", color: colors.faint, fontFamily: type.regular, fontSize: 12 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 14 },
  backText: { color: colors.gold, fontFamily: type.medium, fontSize: 13 },
  otpRow: { flexDirection: "row", gap: 12, marginTop: 22 },
  otpBox: { flex: 1, height: 58, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, alignItems: "center", justifyContent: "center" },
  otpBoxOn: { borderColor: colors.gold },
  otpDigit: { color: colors.cream, fontFamily: type.semibold, fontSize: 24 },
  hidden: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.02, color: "transparent", fontSize: 1 },
  resend: { color: colors.gold, fontFamily: type.medium, fontSize: 13.5 },
});
