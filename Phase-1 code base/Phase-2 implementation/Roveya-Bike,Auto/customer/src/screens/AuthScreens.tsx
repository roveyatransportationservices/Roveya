import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { HeroCarousel } from "../components/HeroCarousel";
import { Keypad, SignInSheet } from "../components/SignInSheet";
import { api, live, sendCode, verifyCode } from "../backend";
import { otpDestination } from "../otpDestination";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { CustomerStack } from "../navigation";

export function PhoneScreen({ navigation }: NativeStackScreenProps<CustomerStack, "Phone">) {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [byEmail, setByEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const getCode = async () => {
    setSendError("");
    if (live) {
      setSending(true);
      try {
        await sendCode(phone, byEmail ? email.trim() : undefined);
      } catch (error) {
        setSendError(error instanceof Error ? error.message : "Could not send the code.");
        return;
      } finally {
        setSending(false);
      }
    }
    navigation.navigate("Otp", { phone: byEmail ? "" : phone, email: byEmail ? email.trim() : undefined });
  };
  const valid = byEmail ? validEmail : /^[6-9]\d{9}$/.test(phone);
  const wrong = phone.length > 0 && !/^[6-9]/.test(phone);
  const slots = Array.from({ length: 10 }, (_, at) => phone[at]);

  const press = (key: string) => {
    if (key === "back") setPhone((value) => value.slice(0, -1));
    else if (key) setPhone((value) => (value.length < 10 ? value + key : value));
  };

  return (
    <SignInSheet kicker="SIGN IN" title={byEmail ? "What is your email?" : "What is your number?"} showBack={navigation.canGoBack()} onBack={() => navigation.goBack()} onKey={byEmail ? () => undefined : press}>
      <Text style={styles.sheetLine}>{byEmail ? "We email a 6-digit code. It expires in 5 minutes." : "We text a 6-digit code to confirm this number. It expires in 5 minutes."}</Text>
      {byEmail ? (
        <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@email.com" placeholderTextColor={colors.faint} selectionColor={colors.gold} style={styles.emailInput} />
      ) : null}

      {byEmail ? null : (
        <>
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
            {wrong ? "Indian mobile numbers start with 6, 7, 8, or 9." : "Shared with your captain only during a ride."}
          </Text>
        </>
      )}

      {byEmail ? null : <Keypad onKey={press} onClear={() => setPhone("")} />}

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
      <Pressable onPress={() => { setByEmail((value) => !value); setSendError(""); }} style={{ marginTop: 8 }}>
        <Text style={[styles.link, { textAlign: "center" }]}>{byEmail ? "Use mobile number instead" : "Use email instead"}</Text>
      </Pressable>
      <Text style={styles.sheetLegal}>
        <Text accessibilityRole="link" style={styles.link} onPress={() => navigation.navigate("Terms", { tab: "terms" })}>
          Terms
        </Text>{" "}
        ·{" "}
        <Text accessibilityRole="link" style={styles.link} onPress={() => navigation.navigate("Terms", { tab: "privacy" })}>
          Privacy
        </Text>
      </Text>
    </SignInSheet>
  );
}

const resendAfter = 30;

export function OtpScreen({ route, navigation }: NativeStackScreenProps<CustomerStack, "Otp">) {
  const store = useStore();
  const phone = route.params.phone;
  const email = route.params.email;
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [checking, setChecking] = useState(false);
  const [seconds, setSeconds] = useState(resendAfter);
  const [resending, setResending] = useState(false);
  const complete = code.length === 6;

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  const verify = (value: string) => {
    if (checking) return;
    if (live) {
      setChecking(true);
      verifyCode<{ name: string } | null>(phone, value, email)
        .then((result) => {
          const name = result.profile?.name ?? "";
          if (name && name !== "ROVEYA rider") store.signIn({ phone, name });
          else {
            setChecking(false);
            navigation.navigate("Name", { phone });
          }
        })
        .catch((failure: unknown) => {
          setChecking(false);
          setError(failure instanceof Error ? failure.message : "That code does not match. Try again.");
          setTimeout(() => setCode(""), 650);
        });
      return;
    }
    setError("Sign-in needs a connection. The code is sent to your phone or email.");
    setCode("");
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
      if (value.length >= 6) return value;
      const next = value + key;
      if (next.length === 6) setTimeout(() => verify(next), 120);
      return next;
    });
  };

  const resend = () => {
    if (resending) return;
    if (!live) {
      setError("Sign-in needs a connection. The code is sent to your phone or email.");
      return;
    }
    setResending(true);
    setCode("");
    setError("");
    void sendCode(phone, email).then(() => {
      setSeconds(resendAfter);
      setNote("A new code is on its way.");
    }).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : "The code could not be sent.")).finally(() => setResending(false));
  };

  return (
    <SignInSheet kicker="VERIFY" title="Enter the code" onBack={() => navigation.goBack()} onKey={press}>
      <View style={styles.sentRow}>
        <Text style={styles.sheetLine}>
          Sent to <Text style={styles.sentNumber}>{otpDestination(phone, email) || "your email"}</Text>
        </Text>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => navigation.goBack()}>
          <Text style={styles.changeLink}>Change</Text>
        </Pressable>
      </View>

      <View style={styles.codeRow}>
        {[0, 1, 2, 3, 4, 5].map((at) => {
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
        {error || note || (checking ? "Checking the code…" : "Check your messages for the 6-digit code.")}
      </Text>

      <Keypad onKey={press} onClear={() => setCode("")} />

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
      <View style={styles.resendRow}>
        {seconds > 0 ? (
          <Text style={styles.sheetLegal}>
            Resend code in <Text style={styles.resendTime}>0:{String(seconds).padStart(2, "0")}</Text>
          </Text>
        ) : (
          <Text style={styles.sheetLegal}>
            Did not get it?{" "}
            <Text accessibilityRole="button" style={styles.link} onPress={resending ? undefined : resend}>
              {resending ? "Sending" : "Resend code"}
            </Text>
          </Text>
        )}
      </View>
    </SignInSheet>
  );
}

export function NameScreen({ route, navigation }: NativeStackScreenProps<CustomerStack, "Name">) {
  const store = useStore();
  const [name, setName] = useState("");
  const [focused, setFocused] = useState(false);
  const phone = route.params.phone;
  const valid = name.trim().length >= 2;
  const start = () => {
    if (!valid) return;
    if (live) void api("/rider/me", { method: "PATCH", body: { name: name.trim() } }).catch(() => undefined);
    store.signIn({ phone, name: name.trim() });
  };

  return (
    <SignInSheet kicker="ALMOST THERE" title="What should captains call you?" onBack={() => navigation.goBack()} onKey={() => undefined}>
      <Text style={styles.sheetLine}>
        Signed in as <Text style={styles.sentNumber}>+91 {phone.slice(0, 5)} {phone.slice(5)}</Text>
      </Text>

      <View style={[styles.display, styles.nameField, focused && { borderColor: colors.gold }]}>
        <View style={styles.nameIcon}>
          <Ionicons name="person" size={16} color={colors.gold} />
        </View>
        <TextInput
          autoFocus
          value={name}
          onChangeText={(text) => setName(text.replace(/[^\p{L}\s.'-]/gu, "").slice(0, 40))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={start}
          placeholder="Your full name"
          placeholderTextColor={colors.faint}
          selectionColor={colors.gold}
          autoCapitalize="words"
          autoComplete="name"
          returnKeyType="done"
          style={styles.nameInput}
        />
        {valid ? <Ionicons name="checkmark-circle" size={20} color={colors.gold} /> : null}
      </View>
      <Text style={styles.displayNote}>Your captain sees this name on every ride.</Text>

      <Pressable accessibilityRole="button" disabled={!valid} onPress={start} style={({ pressed }) => [styles.getCode, styles.startBtn, !valid && styles.getCodeOff, pressed && valid && { opacity: 0.9 }]}>
        <Text style={styles.getCodeText}>Start riding</Text>
        <Ionicons name="arrow-forward" size={18} color={colors.night} />
      </Pressable>
      <Text style={styles.sheetLegal}>
        You can change it later in Profile · <Text accessibilityRole="link" style={styles.link} onPress={() => navigation.navigate("Terms", { tab: "privacy" })}>Privacy</Text>
      </Text>
    </SignInSheet>
  );
}

export function WelcomeScreen({ navigation }: NativeStackScreenProps<CustomerStack, "Welcome">) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const known = store.known;
  return (
    <View style={[styles.welcome, { paddingTop: Math.max(insets.top, 12) + 4, paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
      <HeroCarousel />

      <View style={styles.actions}>
        <Text style={styles.welcomeTitle}>Welcome to ROVEYA</Text>
        {known ? (
          <>
            <Pressable accessibilityRole="button" style={styles.account} onPress={() => (live ? navigation.navigate("Phone") : store.signIn(known))}>
              <View style={styles.accountAvatar}>
                <Ionicons name="person" size={20} color={colors.night} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.accountName} numberOfLines={1}>{known.name.toUpperCase()}</Text>
                <Text style={styles.accountPhone}>{known.phone}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.night} />
            </Pressable>
            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>OR</Text>
              <View style={styles.orLine} />
            </View>
            <Pressable accessibilityRole="button" style={styles.other} onPress={() => navigation.navigate("Phone")}>
              <Text style={styles.otherText}>Sign in with other account</Text>
            </Pressable>
          </>
        ) : (
          <Pressable accessibilityRole="button" style={styles.account} onPress={() => navigation.navigate("Phone")}>
            <View style={styles.accountAvatar}>
              <Ionicons name="call" size={18} color={colors.night} />
            </View>
            <Text style={[styles.accountName, { flex: 1 }]}>Sign in with mobile number</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.night} />
          </Pressable>
        )}
        <Text style={styles.legal}>
          By continuing, you confirm that you are 18 years of age and agree to the{" "}
          <Text accessibilityRole="link" style={styles.link} onPress={() => navigation.navigate("Terms", { tab: "terms" })}>
            Terms and conditions
          </Text>{" "}
          and{" "}
          <Text accessibilityRole="link" style={styles.link} onPress={() => navigation.navigate("Terms", { tab: "privacy" })}>
            Privacy Policy
          </Text>
          .
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  welcome: { flex: 1, backgroundColor: colors.night, paddingHorizontal: 16 },
  actions: { paddingTop: 20, gap: 14 },
  welcomeTitle: { textAlign: "center", color: colors.cream, fontFamily: type.bold, fontSize: 20 },
  account: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.gold, borderRadius: 40, paddingVertical: 10, paddingLeft: 10, paddingRight: 18, minHeight: 64 },
  accountAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.cream, alignItems: "center", justifyContent: "center" },
  accountName: { color: colors.night, fontFamily: type.bold, fontSize: 16, letterSpacing: 0.3 },
  accountPhone: { color: colors.plum, fontFamily: type.medium, fontSize: 14, marginTop: 2 },
  orRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  orLine: { flex: 1, borderBottomWidth: 1, borderStyle: "dashed", borderColor: colors.line },
  orText: { color: colors.faint, fontFamily: type.medium, fontSize: 13 },
  other: { minHeight: 52, borderRadius: 40, borderWidth: 1, borderColor: "rgba(214,160,0,0.45)", alignItems: "center", justifyContent: "center" },
  otherText: { color: colors.cream, fontFamily: type.semibold, fontSize: 15 },
  legal: { textAlign: "center", color: colors.faint, fontSize: 12, lineHeight: 18, marginTop: 2 },
  link: { color: colors.gold, fontFamily: type.medium },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: 12 },
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
  emailInput: { marginTop: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, color: colors.cream, fontFamily: type.body, fontSize: 16 },
  nameField: { marginTop: 14, paddingVertical: 6 },
  nameIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.mist, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  nameInput: { flex: 1, height: 44, color: colors.cream, fontFamily: type.labelStrong, fontSize: 18, paddingVertical: 0 },
  startBtn: { marginTop: 18 },
});
