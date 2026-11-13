import { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button, Logo } from "../components/kit";
import { DEMO_OTP } from "../data";
import { confirmCode, requestCode } from "../remote";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { UserStack } from "../navigation";

type Step = "phone" | "otp" | "name";

const promos = [
  { top: "Login & get", big: "₹200 OFF", bottom: "on your 1st seat" },
  { top: "Use code", big: "ROVEYAFIRST", bottom: "at checkout" },
];

export function LoginScreen({ route, navigation }: NativeStackScreenProps<UserStack, "Login">) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [referral, setReferral] = useState(false);
  const [code, setCode] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(30);
  const [promo, setPromo] = useState(0);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const otpInput = useRef<TextInput>(null);
  const validPhone = /^[6-9]\d{9}$/.test(phone);

  useEffect(() => {
    const timer = setInterval(() => setPromo((value) => (value + 1) % promos.length), 2600);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (step !== "otp" || seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [step, seconds]);

  const close = () => (navigation.canGoBack() ? navigation.goBack() : navigation.reset({ index: 0, routes: [{ name: "Tabs" }] }));

  const sendOtp = async () => {
    if (!validPhone) {
      setError("Enter a 10-digit mobile number starting with 6, 7, 8, or 9.");
      return;
    }
    setError("");
    setOtp("");
    setSending(true);
    try {
      await requestCode(phone);
      setSeconds(30);
      setStep("otp");
      setTimeout(() => otpInput.current?.focus(), 200);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setSending(false);
    }
  };

  const verify = async (value: string) => {
    setOtp(value);
    if (value.length < 4) return;
    setChecking(true);
    try {
      const rider = await confirmCode(phone, value);
      setError("");
      store.signIn(rider.phone, rider.name);
      if (rider.name) {
        setName(rider.name);
        finish(rider.name);
      } else setStep("name");
    } catch (failure) {
      setError((failure as Error).message);
      setOtp("");
    } finally {
      setChecking(false);
    }
  };

  const finish = (known?: string) => {
    if (known) {
      if (route.params?.next) navigation.replace(route.params.next);
      else close();
      return;
    }
    if (name.trim().length >= 2) store.setName(name.trim());
    if (route.params?.next) navigation.replace(route.params.next);
    else close();
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <LinearGradient colors={[colors.burgundy, colors.cherry, colors.night]} style={[styles.hero, { paddingTop: Math.max(insets.top, 14) + 8 }]}>
        <View style={styles.heroTop}>
          <Logo size={36} />
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={close} style={styles.close}>
            <Ionicons name="close" size={18} color={colors.cream} />
          </Pressable>
        </View>
        <View style={styles.ticket}>
          <View style={styles.ticketNotchLeft} />
          <View style={styles.ticketNotchRight} />
          <Text style={styles.ticketTop}>{promos[promo].top}</Text>
          <Text style={styles.ticketBig} numberOfLines={1} adjustsFontSizeToFit>{promos[promo].big}</Text>
          <Text style={styles.ticketBottom}>{promos[promo].bottom}</Text>
        </View>
        <View style={styles.promoDots}>
          {promos.map((item, position) => (
            <View key={item.big} style={[styles.promoDot, position === promo && styles.promoDotOn]} />
          ))}
        </View>
      </LinearGradient>

      <ScrollView style={styles.sheet} contentContainerStyle={{ padding: 20, paddingBottom: Math.max(insets.bottom, 18) + 10 }} keyboardShouldPersistTaps="handled">
        {step === "phone" ? (
          <>
            <Text style={styles.title}>Log in to ROVEYA</Text>
            <Text style={styles.lead}>Book seats, track your car, and manage trips with your mobile number.</Text>
            <View style={[styles.phoneBox, error ? { borderColor: colors.danger } : null]}>
              <Text style={styles.prefix}>+91</Text>
              <View style={styles.divider} />
              <TextInput
                value={phone}
                onChangeText={(text) => {
                  setPhone(text.replace(/\D/g, "").slice(0, 10));
                  setError("");
                }}
                placeholder="Enter mobile number"
                placeholderTextColor={colors.faint}
                keyboardType="number-pad"
                maxLength={10}
                selectionColor={colors.gold}
                style={styles.phoneInput}
                autoFocus
              />
            </View>
            <Pressable onPress={() => setReferral((value) => !value)} style={styles.check}>
              <View style={[styles.box, referral && styles.boxOn]}>{referral ? <Ionicons name="checkmark" size={14} color={colors.night} /> : null}</View>
              <Text style={styles.checkText}>Have a referral code?</Text>
            </Pressable>
            {referral ? (
              <TextInput value={code} onChangeText={(text) => setCode(text.toUpperCase().slice(0, 12))} placeholder="Referral code" placeholderTextColor={colors.faint} autoCapitalize="characters" selectionColor={colors.gold} style={styles.input} />
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button label={sending ? "Sending OTP…" : "Login with OTP"} onPress={() => void sendOtp()} disabled={!validPhone} loading={sending} style={{ marginTop: 18 }} />
            <View style={styles.or}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>Sign in with</Text>
              <View style={styles.orLine} />
            </View>
            <View style={styles.socials}>
              <Pressable accessibilityLabel="Continue with Apple" onPress={() => setError("Apple and Google sign-in arrive with the live app. Use your mobile number for now.")} style={styles.social}>
                <Ionicons name="logo-apple" size={22} color={colors.cream} />
              </Pressable>
              <Pressable accessibilityLabel="Continue with Google" onPress={() => setError("Apple and Google sign-in arrive with the live app. Use your mobile number for now.")} style={styles.social}>
                <Ionicons name="logo-google" size={20} color={colors.gold} />
              </Pressable>
            </View>
            <Text style={styles.terms}>
              By logging in, you agree to our <Text style={styles.link}>Terms</Text> and <Text style={styles.link}>Privacy Policy</Text>.
            </Text>
          </>
        ) : step === "otp" ? (
          <>
            <Pressable onPress={() => setStep("phone")} style={styles.backRow} hitSlop={8}>
              <Ionicons name="arrow-back" size={16} color={colors.gold} />
              <Text style={styles.backText}>Change number</Text>
            </Pressable>
            <Text style={styles.title}>Enter the 4-digit code</Text>
            <Text style={styles.lead}>Sent by SMS to +91 {phone.slice(0, 5)} {phone.slice(5)}</Text>
            <View style={styles.otpRow}>
              {[0, 1, 2, 3].map((position) => (
                <View key={position} style={[styles.otpBox, otp.length === position && styles.otpBoxOn, error ? { borderColor: colors.danger } : null]}>
                  <Text style={styles.otpDigit}>{otp[position] ?? ""}</Text>
                </View>
              ))}
              <TextInput
                ref={otpInput}
                accessibilityLabel="Verification code"
                value={otp}
                onChangeText={(text) => void verify(text.replace(/\D/g, "").slice(0, 4))}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={4}
                caretHidden
                style={styles.hidden}
                autoFocus
              />
            </View>
            {checking ? (
              <View style={styles.checking}>
                <ActivityIndicator size="small" color={colors.gold} />
                <Text style={[styles.hint, { marginTop: 0 }]}>Verifying code…</Text>
              </View>
            ) : error ? (
              <Text style={styles.error}>{error}</Text>
            ) : (
              store.live ? null : <Text style={styles.hint}>Preview code: {DEMO_OTP}</Text>
            )}
            <Pressable disabled={seconds > 0 || sending} onPress={() => void sendOtp()} style={{ marginTop: 18 }}>
              <Text style={[styles.resend, seconds > 0 && { color: colors.faint }]}>{seconds > 0 ? `Resend code in 0:${String(seconds).padStart(2, "0")}` : "Resend code"}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.welcomeRing}>
              <Ionicons name="checkmark" size={28} color={colors.night} />
            </View>
            <Text style={styles.title}>You are in. What should we call you?</Text>
            <Text style={styles.lead}>Your name goes on your tickets. You can change it later in Account.</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={colors.faint} autoCapitalize="words" selectionColor={colors.gold} style={styles.input} autoFocus />
            <Button label={name.trim().length >= 2 ? "Continue" : "Skip for now"} onPress={() => finish()} style={{ marginTop: 18 }} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  hero: { paddingHorizontal: 20, paddingBottom: 28 },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  close: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(18,6,13,0.5)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line },
  ticket: { marginTop: 22, alignSelf: "center", width: "86%", borderRadius: 18, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.gold, backgroundColor: "rgba(18,6,13,0.45)", paddingVertical: 18, paddingHorizontal: 18, alignItems: "center" },
  ticketNotchLeft: { position: "absolute", left: -12, top: "50%", width: 22, height: 22, borderRadius: 11, backgroundColor: colors.cherry },
  ticketNotchRight: { position: "absolute", right: -12, top: "50%", width: 22, height: 22, borderRadius: 11, backgroundColor: colors.cherry },
  ticketTop: { color: colors.cream, fontFamily: type.medium, fontSize: 15 },
  ticketBig: { marginTop: 4, color: colors.gold, fontFamily: type.bold, fontSize: 38, letterSpacing: 1 },
  ticketBottom: { marginTop: 2, color: colors.cream, fontFamily: type.medium, fontSize: 14 },
  promoDots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 14 },
  promoDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(246,241,220,0.3)" },
  promoDotOn: { width: 18, backgroundColor: colors.gold },
  sheet: { flex: 1, marginTop: -16, borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: colors.inkwell, borderTopWidth: 1, borderColor: colors.line },
  title: { color: colors.cream, fontFamily: type.semibold, fontSize: 21, lineHeight: 27 },
  lead: { marginTop: 6, color: colors.muted, fontFamily: type.regular, fontSize: 13.5, lineHeight: 20 },
  phoneBox: { marginTop: 20, flexDirection: "row", alignItems: "center", height: 56, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, paddingHorizontal: 14 },
  prefix: { color: colors.cream, fontFamily: type.semibold, fontSize: 16 },
  divider: { width: 1, height: 24, backgroundColor: colors.line, marginHorizontal: 12 },
  phoneInput: { flex: 1, height: 54, color: colors.cream, fontFamily: type.medium, fontSize: 17, letterSpacing: 1 },
  check: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.faint, alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  checkText: { color: colors.cream, fontFamily: type.regular, fontSize: 14 },
  input: { marginTop: 12, height: 52, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, paddingHorizontal: 14, color: colors.cream, fontFamily: type.medium, fontSize: 15 },
  error: { marginTop: 10, color: colors.danger, fontFamily: type.regular, fontSize: 12.5, lineHeight: 18 },
  hint: { marginTop: 10, color: colors.faint, fontFamily: type.regular, fontSize: 12.5 },
  checking: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  or: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 26 },
  orLine: { flex: 1, height: 1, backgroundColor: colors.hairline },
  orText: { color: colors.faint, fontFamily: type.regular, fontSize: 12.5 },
  socials: { flexDirection: "row", justifyContent: "center", gap: 16, marginTop: 16 },
  social: { width: 54, height: 54, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, alignItems: "center", justifyContent: "center" },
  terms: { marginTop: 24, textAlign: "center", color: colors.faint, fontFamily: type.regular, fontSize: 12, lineHeight: 18 },
  link: { color: colors.gold },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 14 },
  backText: { color: colors.gold, fontFamily: type.medium, fontSize: 13 },
  otpRow: { flexDirection: "row", gap: 12, marginTop: 22 },
  otpBox: { flex: 1, height: 60, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, alignItems: "center", justifyContent: "center" },
  otpBoxOn: { borderColor: colors.gold },
  otpDigit: { color: colors.cream, fontFamily: type.semibold, fontSize: 24 },
  hidden: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.02, color: "transparent", fontSize: 1 },
  resend: { color: colors.gold, fontFamily: type.medium, fontSize: 13.5 },
  welcomeRing: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center", marginBottom: 16 },
});
