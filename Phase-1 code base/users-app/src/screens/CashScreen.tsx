import { Ionicons } from "@expo/vector-icons";
import { ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { Button, Card, Header, Icon, inr } from "../components/kit";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { Glyph } from "../types";
import type { UserTabs } from "../navigation";

const uses: { icon: Glyph; title: string; line: string }[] = [
  { icon: "mc:car-seat", title: "Pay for seats", line: "Use up to 20% of any booking from ROVEYA Cash" },
  { icon: "mc:lightning-bolt-outline", title: "Instant refunds", line: "Cancellations land here in seconds" },
  { icon: "mc:gift-outline", title: "Cashback and referrals", line: "₹150 for every friend who travels" },
];

export function CashScreen(_: BottomTabScreenProps<UserTabs, "Cash">) {
  const store = useStore();
  const code = store.user ? `ROV${store.user.phone.slice(-4)}${(store.user.name || "R").slice(0, 1).toUpperCase()}` : "LOGIN TO GET A CODE";
  return (
    <View style={styles.screen}>
      <Header title="ROVEYA Cash" subtitle="Your travel wallet" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <LinearGradient colors={[colors.burgundy, colors.cherry, colors.inkwell]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balance}>
          <Text style={styles.balanceLabel}>Available balance</Text>
          <Text style={styles.balanceValue}>{inr(store.cash)}</Text>
          <Text style={styles.balanceLine}>Never expires · usable on every route</Text>
          <Ionicons name="wallet" size={90} color="rgba(214,160,0,0.12)" style={styles.balanceArt} />
        </LinearGradient>

        <View style={styles.uses}>
          {uses.map((use) => (
            <View key={use.title} style={styles.use}>
              <View style={styles.useIcon}>
                <Icon name={use.icon} size={18} />
              </View>
              <Text style={styles.useTitle}>{use.title}</Text>
              <Text style={styles.useLine}>{use.line}</Text>
            </View>
          ))}
        </View>

        <Card style={{ marginTop: 14 }}>
          <Text style={styles.kicker}>REFER AND EARN</Text>
          <Text style={styles.referTitle}>Give ₹250, get ₹150</Text>
          <Text style={styles.referLine}>Friends get 20% off their first seat, up to ₹250. You get ₹150 when they finish their first trip.</Text>
          <View style={styles.codeBox}>
            <Text style={styles.code}>{code}</Text>
          </View>
          <Button label="Share invite" icon="share-social-outline" onPress={() => void Share.share({ message: `Travel city to city in a verified ROVEYA car seat. Sign up with my code ${code} and get 20% off your first seat, up to ₹250.` }).catch(() => undefined)} />
        </Card>

        <Text style={styles.section}>HISTORY</Text>
        <View style={styles.list}>
          {store.cashEntries.map((entry, index) => (
            <View key={entry.id} style={[styles.row, index < store.cashEntries.length - 1 && styles.rowLine]}>
              <View style={[styles.rowIcon, entry.amount < 0 && { borderColor: colors.hairline }]}>
                <Ionicons name={entry.amount > 0 ? "arrow-down" : "arrow-up"} size={15} color={entry.amount > 0 ? colors.success : colors.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{entry.label}</Text>
                <Text style={styles.rowAt}>{entry.at}</Text>
              </View>
              <Text style={[styles.rowAmount, entry.amount > 0 && { color: colors.success }]}>{entry.amount > 0 ? "+" : "−"}{inr(Math.abs(entry.amount))}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  balance: { borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  balanceLabel: { color: colors.muted, fontFamily: type.regular, fontSize: 13 },
  balanceValue: { marginTop: 6, color: colors.cream, fontFamily: type.bold, fontSize: 38 },
  balanceLine: { marginTop: 6, color: colors.gold, fontFamily: type.medium, fontSize: 12.5 },
  balanceArt: { position: "absolute", right: -8, bottom: -14 },
  uses: { flexDirection: "row", gap: 10, marginTop: 14 },
  use: { flex: 1, borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 6 },
  useIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line },
  useTitle: { color: colors.cream, fontFamily: type.semibold, fontSize: 13 },
  useLine: { color: colors.muted, fontFamily: type.regular, fontSize: 11.5, lineHeight: 16 },
  kicker: { color: colors.gold, fontFamily: type.semibold, fontSize: 11, letterSpacing: 2 },
  referTitle: { marginTop: 8, color: colors.cream, fontFamily: type.semibold, fontSize: 20 },
  referLine: { marginTop: 4, color: colors.muted, fontFamily: type.regular, fontSize: 13, lineHeight: 19 },
  codeBox: { marginVertical: 14, alignSelf: "flex-start", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: colors.gold },
  code: { color: colors.gold, fontFamily: type.bold, fontSize: 18, letterSpacing: 3 },
  section: { marginTop: 22, marginBottom: 10, color: colors.gold, fontFamily: type.semibold, fontSize: 11, letterSpacing: 2 },
  list: { borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rowIcon: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: "rgba(127,199,154,0.4)", alignItems: "center", justifyContent: "center" },
  rowLabel: { color: colors.cream, fontFamily: type.medium, fontSize: 13.5 },
  rowAt: { marginTop: 2, color: colors.faint, fontFamily: type.regular, fontSize: 11.5 },
  rowAmount: { color: colors.cream, fontFamily: type.semibold, fontSize: 14 },
});
