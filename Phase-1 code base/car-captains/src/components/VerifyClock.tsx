import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "./kit";
import { colors, type } from "../theme";

// Same colours and thresholds as the ROVEYA support desk, so the captain and the desk see one clock.
const TONE = { green: "#7FC79A", orange: "#F0A04B", red: "#E8857F" } as const;

function clockState(startedAt: number, dueAt: number, now: number) {
  const total = Math.max(1, dueAt - startedAt);
  const left = dueAt - now;
  const tone: keyof typeof TONE = left <= 0 ? "red" : (now - startedAt) / total < 1 / 3 ? "green" : left > 10 * 60000 ? "orange" : "red";
  return { left, tone, used: Math.min(1, Math.max(0, (now - startedAt) / total)) };
}

function mmss(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function VerifyClock({ startedAt, dueAt, minutes }: { startedAt: number; dueAt: number; minutes: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const { left, tone, used } = clockState(startedAt, dueAt, now);
  const color = TONE[tone];
  const line = left <= 0 ? "Taking a little longer than usual. The desk is on it, no need to register again." : tone === "green" ? "Your check has started. Keep the app open." : tone === "orange" ? "A desk executive is going through your documents and car." : "Almost done. You will be told the moment you are approved.";
  return (
    <View style={[styles.box, { borderColor: `${color}66` }]}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: `${color}22` }]}>
          <Icon name="mc:timer-sand" size={20} color={color} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>Verified within {minutes} minutes</Text>
          <Text style={styles.line}>{line}</Text>
        </View>
        <Text style={[styles.time, { color }]}>{left <= 0 ? "Soon" : mmss(left)}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${used * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 14, borderWidth: 1, backgroundColor: colors.mist, padding: 12, marginTop: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  title: { color: colors.cream, fontFamily: type.semibold, fontSize: 14 },
  line: { color: colors.muted, fontFamily: type.regular, fontSize: 12, marginTop: 2 },
  time: { fontFamily: type.bold, fontSize: 22, fontVariant: ["tabular-nums"] },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.hairline, marginTop: 12, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
});
