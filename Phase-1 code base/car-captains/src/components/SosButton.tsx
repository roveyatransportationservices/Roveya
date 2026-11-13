import { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Animated, Easing, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { SAFETY_DESK, call, markSafe, raiseSos, sosStatus, type SosState } from "../safety";
import { colors, type } from "../theme";
import { Button, Sheet } from "./kit";

const HOLD_MS = 2500;

// Hold to send: a long press so a pocket tap never raises a false alarm.
export function SosButton({ context, compact }: { context: { tripId?: string; bookingId?: string }; compact?: boolean }) {
  const progress = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);
  const [sending, setSending] = useState(false);
  const [state, setState] = useState<SosState | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  const release = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
    Animated.timing(progress, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  };

  const press = () => {
    setHolding(true);
    setError("");
    Animated.timing(progress, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false }).start();
    timer.current = setTimeout(async () => {
      release();
      setOpen(true);
      setSending(true);
      try {
        setState(await raiseSos(context));
      } catch (failure) {
        setError(`${(failure as Error).message} Call 112 or the ROVEYA safety desk now.`);
      } finally {
        setSending(false);
      }
    }, HOLD_MS);
  };

  useEffect(() => {
    if (!open || !state) return;
    const poll = setInterval(() => {
      sosStatus(state.incident.id)
        .then(setState)
        .catch(() => undefined);
    }, 5000);
    return () => clearInterval(poll);
  }, [open, state?.incident.id]);

  useEffect(() => () => release(), []);

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  const acknowledged = state?.incident.status === "acknowledged" || Boolean(state?.incident.acknowledgedAt);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Hold for SOS"
        onPressIn={press}
        onPressOut={release}
        style={[styles.button, compact && styles.compact]}
      >
        <Animated.View style={[styles.fill, { width }]} />
        <Ionicons name="alert-circle" size={compact ? 18 : 22} color={colors.cream} />
        <Text style={styles.label}>{holding ? "Keep holding…" : compact ? "SOS" : "Hold for SOS"}</Text>
      </Pressable>

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title={sending ? "Sending your SOS…" : error ? "Get help now" : acknowledged ? "The safety desk is on it" : "Help is on the way"}
        footer={
          <View style={{ gap: 10 }}>
            <View style={styles.row}>
              <Button label="Call 112" icon="call" tone="burgundy" onPress={() => call("112")} style={{ flex: 1 }} />
              <Button label="Safety desk" icon="headset" onPress={() => call(state?.deskPhone ?? SAFETY_DESK)} style={{ flex: 1 }} />
            </View>
            {state && !acknowledged ? (
              <Pressable
                onPress={() => {
                  void markSafe(state.incident.id).then(setState).catch(() => undefined);
                  setOpen(false);
                }}
                hitSlop={8}
              >
                <Text style={styles.safe}>I am safe now</Text>
              </Pressable>
            ) : null}
          </View>
        }
      >
        {sending ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.danger} />
            <Text style={styles.lead}>Sharing your location with the ROVEYA safety desk and your emergency contacts.</Text>
          </View>
        ) : error ? (
          <Text style={[styles.lead, { color: colors.danger }]}>{error}</Text>
        ) : state ? (
          <View style={{ gap: 10 }}>
            <Step done text={`Alert ${state.incident.code} reached the ROVEYA safety desk`} />
            <Step done={state.incident.contactsNotified > 0} text={state.incident.contactsTotal ? `${state.incident.contactsNotified} of ${state.incident.contactsTotal} emergency contacts got an SMS with your live location` : "Add emergency contacts so they get your location next time"} />
            <Step done={acknowledged} text={acknowledged ? `${state.agent ?? "A safety agent"} is handling it and will call you now` : "A safety agent will call you within 60 seconds"} />
            {state.shareUrl ? (
              <Pressable onPress={() => void Share.share({ message: `I need help. Live location of my ROVEYA trip: ${state.shareUrl}` })} style={styles.share}>
                <Ionicons name="share-social-outline" size={16} color={colors.gold} />
                <Text style={styles.shareText}>Share live location with someone else</Text>
              </Pressable>
            ) : null}
            <Text style={styles.small}>If you are in danger, call 112 now. Keep your phone with you.</Text>
          </View>
        ) : null}
      </Sheet>
    </>
  );
}

function Step({ done, text }: { done: boolean; text: string }) {
  return (
    <View style={styles.step}>
      <Ionicons name={done ? "checkmark-circle" : "time-outline"} size={20} color={done ? colors.success : colors.gold} />
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { height: 52, borderRadius: 16, overflow: "hidden", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#8E2A2A", borderWidth: 1, borderColor: colors.danger },
  compact: { height: 40, borderRadius: 14, paddingHorizontal: 14 },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: colors.danger },
  label: { color: colors.cream, fontFamily: type.bold, fontSize: 15, letterSpacing: 0.5 },
  row: { flexDirection: "row", gap: 10 },
  safe: { textAlign: "center", color: colors.gold, fontFamily: type.medium, fontSize: 13.5 },
  center: { alignItems: "center", gap: 14, paddingVertical: 12 },
  lead: { color: colors.muted, fontFamily: type.regular, fontSize: 14, lineHeight: 21, textAlign: "center" },
  step: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  stepText: { flex: 1, color: colors.cream, fontFamily: type.regular, fontSize: 14, lineHeight: 20 },
  share: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.line },
  shareText: { color: colors.gold, fontFamily: type.medium, fontSize: 13 },
  small: { color: colors.faint, fontFamily: type.regular, fontSize: 12, lineHeight: 17 },
});
