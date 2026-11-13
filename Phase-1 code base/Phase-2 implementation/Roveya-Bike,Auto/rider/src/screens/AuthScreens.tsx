import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { HeroCarousel } from "../components/HeroCarousel";
import { Keypad, SignInSheet } from "../components/SignInSheet";
import { ApiError, live, sendCode, verifyCode } from "../backend";
import { DEMO_LOGIN_CODE } from "../data";
import { captainFromServer, type ServerCaptain } from "../remote";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { CaptainStack } from "../navigation";

export function WelcomeScreen({ navigation }: NativeStackScreenProps<CaptainStack, "Welcome">) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const known = store.captain;
  return (
    <View style={[styles.welcome, { paddingTop: Math.max(insets.top, 12) + 4, paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
      <HeroCarousel />
      <View style={styles.actions}>
        <Text style={styles.welcomeTitle}>Welcome, Captain</Text>
        {known ? (
          <Pressable accessibilityRole="button" style={styles.account} onPress={() => (live ? navigation.navigate("Phone", { mode: "login" }) : store.signIn(known.phone))}>
            <View style={styles.accountAvatar}>
              <Ionicons name="person" size={20} color={colors.night} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.accountName} numberOfLines={1}>{known.name.toUpperCase()}</Text>
              <Text style={styles.accountPhone}>{known.phone} · {known.captainId}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.night} />
          </Pressable>
        ) : null}
        <View style={styles.pair}>
          <Pressable accessibilityRole="button" style={[styles.half, !known && styles.halfGold]} onPress={() => navigation.navigate("Phone", { mode: "login" })}>
            <Ionicons name="log-in-outline" size={18} color={known ? colors.gold : colors.night} />
            <Text style={[styles.halfText, !known && { color: colors.night }]}>Log in</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.half} onPress={() => navigation.navigate("Phone", { mode: "register" })}>
            <Ionicons name="person-add-outline" size={18} color={colors.gold} />
            <Text style={styles.halfText}>Register</Text>
          </Pressable>
        </View>
        <Text style={styles.newLine}>{known ? "Tap your account, or log in with another number." : "New to ROVEYA? Register in about 10 minutes."}</Text>
        <Text style={styles.legal}>
          By continuing, you confirm that you are 18 years of age and agree to the{" "}
          <Text accessibilityRole="link" style={styles.link} onPress={() => navigation.navigate("Terms")}>
            Captain terms and privacy policy
          </Text>
          .
        </Text>
      </View>
    </View>
  );
}

export function PhoneScreen({ route, navigation }: NativeStackScreenProps<CaptainStack, "Phone">) {
  const store = useStore();
  const mode = route.params?.mode ?? "login";
  const registered = Boolean(store.captain);
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const getCode = async () => {
    setSendError("");
    if (live) {
      setSending(true);
      try {
        await sendCode(phone);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 0) {
          setSendError(error instanceof Error ? error.message : "Could not send the code.");
          return;
        }
      } finally {
        setSending(false);
      }
    }
    navigation.navigate("Otp", { phone, mode });
  };
  const valid = /^[6-9]\d{9}$/.test(phone);
  const wrong = phone.length > 0 && !/^[6-9]/.test(phone);
  const slots = Array.from({ length: 10 }, (_, at) => phone[at]);

  const press = (key: string) => {
    if (key === "back") setPhone((value) => value.slice(0, -1));
    else if (key) setPhone((value) => (value.length < 10 ? value + key : value));
  };

  return (
    <SignInSheet kicker={mode === "login" ? "CAPTAIN LOG IN" : "CAPTAIN REGISTRATION"} title={mode === "login" ? "Welcome back, Captain" : "Become a ROVEYA captain"} showBack={navigation.canGoBack()} onBack={() => (navigation.canGoBack() ? navigation.goBack() : undefined)} onKey={press}>
      <Text style={styles.sheetLine}>{mode === "login" ? "Enter the number you registered with." : "Use the number linked to your driving licence."}</Text>
      <View style={[styles.display, wrong && styles.displayWrong]}>
        <View style={styles.cc}>
          <Text style={styles.ccText}>+91</Text>
        </View>
        <View style={styles.slots}>
          {slots.map((digit, at) => (
            <View key={at} style={[styles.slot, at === 5 && { marginLeft: 8 }]}>
              <Text style={[styles.slotText, !digit && styles.slotEmpty]}>{digit ?? "·"}</Text>
              {at === phone.length ? <View style={styles.caret} /> : null}
            </View>
          ))}
        </View>
        {valid ? <Ionicons name="checkmark-circle" size={20} color={colors.gold} /> : null}
      </View>
      <Text style={[styles.displayNote, wrong && { color: colors.goldBright }]}>
        {wrong ? "Indian mobile numbers start with 6, 7, 8, or 9." : "We text a 4-digit code to confirm it is you."}
      </Text>
      <Keypad onKey={press} onClear={() => setPhone("")} />
      <Pressable
        accessibilityRole="button"
        disabled={!valid || sending}
        onPress={() => void getCode()}
        style={({ pressed }) => [styles.getCode, (!valid || sending) && styles.getCodeOff, pressed && valid && { opacity: 0.9 }]}
      >
        {sending ? <ActivityIndicator size="small" color={colors.night} /> : null}
        <Text style={styles.getCodeText}>{sending ? "Sending" : "Get code"}</Text>
        {sending ? null : <Ionicons name="arrow-forward" size={18} color={colors.night} />}
      </Pressable>
      {sendError ? <Text style={[styles.displayNote, { color: colors.goldBright, textAlign: "center" }]}>{sendError}</Text> : null}
      {registered ? (
        <Text style={styles.sheetLegal}>This number is already registered. Log in to open your captain account.</Text>
      ) : mode === "login" ? (
        <Pressable accessibilityRole="button" onPress={() => navigation.navigate("Phone", { mode: "register" })} style={styles.switchMode}>
          <Text style={styles.sheetLegal}>New captain? <Text style={styles.link}>Register with this number</Text></Text>
        </Pressable>
      ) : (
        <Pressable accessibilityRole="button" onPress={() => navigation.navigate("Phone", { mode: "login" })} style={styles.switchMode}>
          <Text style={styles.sheetLegal}>Already a captain? <Text style={styles.link}>Log in</Text></Text>
        </Pressable>
      )}
      <Text style={styles.sheetLegal}>
        Demo code {DEMO_LOGIN_CODE} ·{" "}
        <Text accessibilityRole="link" style={styles.link} onPress={() => navigation.navigate("Terms")}>
          Captain terms
        </Text>
      </Text>
    </SignInSheet>
  );
}

const resendAfter = 30;

export function OtpScreen({ route, navigation }: NativeStackScreenProps<CaptainStack, "Otp">) {
  const store = useStore();
  const { phone, mode } = route.params;
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [checking, setChecking] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [seconds, setSeconds] = useState(resendAfter);
  const complete = code.length === 4;

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  const verify = (value: string) => {
    if (checking) return;
    if (live) {
      setChecking(true);
      verifyCode<ServerCaptain | null>(phone, value)
        .then((result) => {
          if (result.profile) {
            store.register(captainFromServer(result.profile));
            return;
          }
          setChecking(false);
          if (mode === "register") navigation.navigate("Register", { phone });
          else setUnknown(true);
        })
        .catch((failure: unknown) => {
          if (failure instanceof ApiError && failure.status === 0) {
            if (value !== DEMO_LOGIN_CODE) {
              setChecking(false);
              setError("That code does not match. Try again.");
              setTimeout(() => setCode(""), 650);
              return;
            }
            if (store.signIn(phone) === "existing") return;
            setChecking(false);
            if (mode === "register") navigation.navigate("Register", { phone });
            else setUnknown(true);
            return;
          }
          setChecking(false);
          setError(failure instanceof Error ? failure.message : "That code does not match. Try again.");
          setTimeout(() => setCode(""), 650);
        });
      return;
    }
    if (value !== DEMO_LOGIN_CODE) {
      setError("That code does not match. Try again.");
      setTimeout(() => setCode(""), 650);
      return;
    }
    setChecking(true);
    setTimeout(() => {
      if (store.signIn(phone) === "existing") return;
      setChecking(false);
      if (mode === "register") navigation.navigate("Register", { phone });
      else setUnknown(true);
    }, 500);
  };

  const press = (key: string) => {
    if (checking) return;
    setError("");
    setNote("");
    if (key === "back") {
      setCode((value) => value.slice(0, -1));
      return;
    }
    if (!key) return;
    setCode((value) => {
      if (value.length >= 4) return value;
      const next = value + key;
      if (next.length === 4) setTimeout(() => verify(next), 120);
      return next;
    });
  };

  const resend = () => {
    setSeconds(resendAfter);
    setCode("");
    setError("");
    setNote("A new code is on its way.");
  };

  return (
    <SignInSheet kicker="VERIFY" title="Enter the code" onBack={() => navigation.goBack()} onKey={press}>
      <View style={styles.sentRow}>
        <Text style={styles.sheetLine}>
          Sent to <Text style={styles.sentNumber}>+91 {phone.slice(0, 5)} {phone.slice(5)}</Text>
        </Text>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => navigation.goBack()}>
          <Text style={styles.changeLink}>Change</Text>
        </Pressable>
      </View>
      <View style={styles.codeRow}>
        {[0, 1, 2, 3].map((at) => {
          const digit = code[at];
          const current = at === code.length && !checking;
          return (
            <View key={at} style={[styles.codeBox, current && styles.codeBoxOn, digit && styles.codeBoxFilled, error ? styles.codeBoxWrong : null]}>
              <Text style={styles.codeText}>{digit ?? ""}</Text>
              {current ? <View style={styles.codeCaret} /> : null}
            </View>
          );
        })}
      </View>
      <Text style={[styles.displayNote, styles.codeNote, error ? { color: colors.goldBright } : null]}>
        {error || note || (checking ? "Checking the code…" : unknown ? "Number verified." : "Check your messages for the 4-digit code.")}
      </Text>
      {unknown ? (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>No captain account on this number yet</Text>
          <Text style={styles.noticeLine}>Register now with +91 {phone.slice(0, 5)} {phone.slice(5)}, or log in with the number you joined with.</Text>
          <Pressable accessibilityRole="button" onPress={() => navigation.navigate("Register", { phone })} style={({ pressed }) => [styles.getCode, { marginTop: 4 }, pressed && { opacity: 0.9 }]}>
            <Text style={styles.getCodeText}>Register with this number</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.night} />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => navigation.goBack()}>
            <Text style={[styles.link, { textAlign: "center", paddingVertical: 6 }]}>Use another number</Text>
          </Pressable>
        </View>
      ) : null}
      {unknown ? null : <Keypad onKey={press} onClear={() => setCode("")} />}
      {unknown ? null : (
        <Pressable
          accessibilityRole="button"
          disabled={!complete || checking}
          onPress={() => verify(code)}
          style={({ pressed }) => [styles.getCode, (!complete || checking) && styles.getCodeOff, pressed && complete && { opacity: 0.9 }]}
        >
          {checking ? <ActivityIndicator size="small" color={colors.night} /> : null}
          <Text style={styles.getCodeText}>{checking ? "Verifying" : "Verify"}</Text>
          {checking ? null : <Ionicons name="checkmark" size={18} color={colors.night} />}
        </Pressable>
      )}
      <View style={[styles.resendRow, unknown && { display: "none" }]}>
        {seconds > 0 ? (
          <Text style={styles.sheetLegal}>
            Resend code in <Text style={styles.resendTime}>0:{String(seconds).padStart(2, "0")}</Text> · Demo code {DEMO_LOGIN_CODE}
          </Text>
        ) : (
          <Text style={styles.sheetLegal}>
            Did not get it?{" "}
            <Text accessibilityRole="button" style={styles.link} onPress={resend}>
              Resend code
            </Text>{" "}
            · Demo code {DEMO_LOGIN_CODE}
          </Text>
        )}
      </View>
    </SignInSheet>
  );
}

const styles = StyleSheet.create({
  welcome: { flex: 1, backgroundColor: colors.night, paddingHorizontal: 16 },
  actions: { paddingTop: 20, gap: 14 },
  welcomeTitle: { textAlign: "center", color: colors.cream, fontFamily: type.bold, fontSize: 20 },
  account: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.gold, borderRadius: 40, paddingVertical: 10, paddingLeft: 10, paddingRight: 18, minHeight: 64 },
  accountAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.cream, alignItems: "center", justifyContent: "center" },
  accountName: { color: colors.night, fontFamily: type.bold, fontSize: 16, letterSpacing: 0.3 },
  accountPhone: { color: colors.plum, fontFamily: type.medium, fontSize: 13, marginTop: 2 },
  orRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  orLine: { flex: 1, borderBottomWidth: 1, borderStyle: "dashed", borderColor: colors.line },
  orText: { color: colors.faint, fontFamily: type.medium, fontSize: 13 },
  other: { minHeight: 52, borderRadius: 40, borderWidth: 1, borderColor: "rgba(214,160,0,0.45)", alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  otherText: { color: colors.cream, fontFamily: type.semibold, fontSize: 15 },
  newLine: { textAlign: "center", color: colors.muted, fontFamily: type.body, fontSize: 13 },
  pair: { flexDirection: "row", gap: 10 },
  half: { flex: 1, minHeight: 54, borderRadius: 40, borderWidth: 1, borderColor: "rgba(214,160,0,0.45)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  halfGold: { backgroundColor: colors.gold, borderColor: colors.gold },
  halfText: { color: colors.cream, fontFamily: type.semibold, fontSize: 15.5 },
  notice: { marginTop: 12, padding: 14, borderRadius: 18, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.goldBright, gap: 10 },
  noticeTitle: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15 },
  noticeLine: { color: colors.muted, fontFamily: type.body, fontSize: 13, lineHeight: 18 },
  legal: { textAlign: "center", color: colors.faint, fontSize: 12, lineHeight: 18, marginTop: 2 },
  link: { color: colors.gold, fontFamily: type.medium },
  sheetLine: { marginTop: 6, color: colors.muted, fontFamily: type.body, fontSize: 13.5 },
  sentRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sentNumber: { color: colors.cream, fontFamily: type.labelStrong },
  changeLink: { marginTop: 6, color: colors.gold, fontFamily: type.labelStrong, fontSize: 13, textDecorationLine: "underline" },
  codeRow: { marginTop: 14, flexDirection: "row", justifyContent: "space-between", gap: 10 },
  codeBox: { flex: 1, height: 60, borderRadius: 16, backgroundColor: colors.night, borderWidth: 1, borderColor: "rgba(214,160,0,0.25)", alignItems: "center", justifyContent: "center" },
  codeBoxOn: { borderColor: colors.gold },
  codeBoxFilled: { borderColor: "rgba(214,160,0,0.55)", backgroundColor: colors.mist },
  codeBoxWrong: { borderColor: colors.goldBright },
  codeText: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 26 },
  codeCaret: { position: "absolute", bottom: 12, width: 16, height: 2, borderRadius: 1, backgroundColor: colors.gold },
  codeNote: { textAlign: "center", paddingLeft: 0 },
  resendRow: { alignItems: "center" },
  resendTime: { color: colors.gold, fontFamily: type.labelStrong },
  display: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.night, borderWidth: 1, borderColor: "rgba(214,160,0,0.35)" },
  displayWrong: { borderColor: colors.goldBright },
  cc: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.mist, borderWidth: 1, borderColor: colors.line },
  ccText: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 15 },
  slots: { flex: 1, flexDirection: "row", alignItems: "center" },
  slot: { width: 17, alignItems: "center" },
  slotText: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 22 },
  slotEmpty: { color: colors.faint },
  caret: { position: "absolute", bottom: -2, width: 12, height: 2, borderRadius: 1, backgroundColor: colors.gold },
  displayNote: { marginTop: 8, color: colors.faint, fontFamily: type.body, fontSize: 12, paddingLeft: 4 },
  getCode: { marginTop: 8, minHeight: 52, borderRadius: 18, backgroundColor: colors.gold, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  getCodeOff: { opacity: 0.35 },
  getCodeText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 16, letterSpacing: 0.6 },
  sheetLegal: { marginTop: 10, textAlign: "center", color: colors.faint, fontFamily: type.body, fontSize: 11.5 },
  switchMode: { marginTop: 4 },
});
