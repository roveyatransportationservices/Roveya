import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, live } from "../backend";
import { BannerCarousel } from "../components/BannerCarousel";
import { Field } from "../components/Field";
import { art, slide } from "../banners";
import { Group, Line, ListRow, PageShell, SectionTitle, page } from "../components/PageShell";
import { FlowCta, FlowSum } from "../components/StepShell";
import { TabPage } from "../components/TabPage";
import { payoutOpen } from "../dayPlan";
import { MIN_REDEEM } from "../data";
import { inr } from "../geo";
import { startOfDay } from "../orders";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { CaptainStack, CaptainTabs } from "../navigation";
import type { Txn } from "../types";
import { when } from "./EarningsScreens";

type Props = CompositeScreenProps<BottomTabScreenProps<CaptainTabs, "Wallet">, NativeStackScreenProps<CaptainStack>>;

export function WalletScreen({ navigation }: Props) {
  const store = useStore();
  const captain = store.captain!;
  const cashToday = store.trips.filter((trip) => trip.status === "Completed" && trip.payment === "cash" && trip.at >= startOfDay()).reduce((sum, trip) => sum + trip.fare, 0);
  const redeemed = store.txns.filter((txn) => txn.amount < 0 && txn.label.startsWith("Redeemed")).reduce((sum, txn) => sum - txn.amount, 0);
  useEffect(() => {
    void store.refresh();
  }, []);
  const canRedeem = store.wallet >= MIN_REDEEM;

  return (
    <TabPage kicker="WALLET" title="Captain wallet">
      <BannerCarousel
        style={{ marginBottom: 14 }}
        slides={[
          slide(art.earn, "PAYOUTS", "Redeem from ₹100, straight to your bank"),
          slide(art.cab, "REFER A CAPTAIN", "Invite a friend who drives. Cash rewards are off for now", "Invite", () => navigation.navigate("Refer")),
          slide(art.ride, "ACCIDENT COVER", "Insurance is active on every ride you take", "Learn more", () => navigation.navigate("Insurance")),
        ]}
      />
      <LinearGradient colors={[colors.burgundy, colors.plum, colors.inkwell]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={page.heroCard}>
        <View style={styles.heroTop}>
          <Text style={page.kicker}>AVAILABLE TO REDEEM</Text>
          <Ionicons name="wallet" size={22} color={colors.gold} />
        </View>
        <Text style={styles.balance}>{inr(store.wallet)}</Text>
        <Text style={page.lead}>Prepaid balance for the daily platform fee. Cash and direct UPI ride fares stay with you and are not added here.</Text>
        <Pressable disabled={!canRedeem} onPress={() => navigation.navigate("Redeem")} style={({ pressed }) => [styles.redeem, !canRedeem && { opacity: 0.45 }, pressed && { opacity: 0.9 }]}>
          <Ionicons name="arrow-up-circle" size={18} color={colors.night} />
          <Text style={styles.redeemText}>{canRedeem ? "Redeem to bank" : `Redeem from ${inr(MIN_REDEEM)}`}</Text>
        </Pressable>
        <Text style={[page.small, { marginTop: 10 }]}>
          Staging field test: the daily platform fee is waived. You can go online with ₹0 wallet. Bike ₹10 / Auto ₹12 fees stay off until production.
        </Text>
        <Text style={[page.small, { marginTop: 8 }]}>Wallet recharge stays off in this staging build.</Text>
        <View style={styles.heroStats}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroStat}>{inr(cashToday)}</Text>
            <Text style={page.small}>Cash / UPI rides today (with you)</Text>
          </View>
          <View style={styles.heroLine} />
          <View style={{ flex: 1, paddingLeft: 14 }}>
            <Text style={styles.heroStat}>{inr(redeemed)}</Text>
            <Text style={page.small}>Redeemed so far</Text>
          </View>
        </View>
      </LinearGradient>

      <SectionTitle>PAYOUT ACCOUNT</SectionTitle>
      <Group>
        <ListRow icon="business-outline" label={`Bank account ••${captain.bankLast4}`} sub={`${captain.bankHolder} · ${captain.ifsc}`} onPress={() => navigation.navigate("Bank")} />
        <ListRow icon="calendar-outline" label="Redeem on Monday and Thursday" sub={`Minimum ${inr(MIN_REDEEM)} · reaches your bank within 24 hours`} last chevron={false} />
      </Group>

      <SectionTitle>TRANSACTIONS</SectionTitle>
      {store.txns.length ? (
        <Group>
          {store.txns.map((txn, index) => (
            <TxnRow key={txn.id} txn={txn} last={index === store.txns.length - 1} />
          ))}
        </Group>
      ) : (
        <View style={[page.card, { flexDirection: "row", gap: 12, alignItems: "center" }]}>
          <Ionicons name="receipt-outline" size={20} color={colors.gold} />
          <Text style={[page.small, { flex: 1 }]}>Online rides and incentives show up here.</Text>
        </View>
      )}
    </TabPage>
  );
}

function TxnRow({ txn, last }: { txn: Txn; last: boolean }) {
  const credit = txn.amount > 0;
  const icon: keyof typeof Ionicons.glyphMap = txn.label.startsWith("Redeemed") ? "arrow-up" : txn.label.includes("incentive") || txn.label.includes("bonus") ? "trophy-outline" : txn.label.startsWith("Ride") ? "bicycle-outline" : "gift-outline";
  return (
    <View style={[styles.txn, !last && styles.txnLine]}>
      <View style={[styles.txnIcon, credit && styles.txnIconIn]}>
        <Ionicons name={icon} size={16} color={credit ? colors.night : colors.gold} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={page.name} numberOfLines={1}>{txn.label}</Text>
        <Text style={page.small}>{when(txn.at)}</Text>
      </View>
      <Text style={[styles.txnAmount, credit && { color: colors.gold }]}>
        {credit ? "+" : "−"}
        {inr(Math.abs(txn.amount))}
      </Text>
    </View>
  );
}

export function RedeemScreen({ navigation }: NativeStackScreenProps<CaptainStack, "Redeem">) {
  const store = useStore();
  const captain = store.captain!;
  const [amount, setAmount] = useState(String(Math.floor(store.wallet)));
  const [sent, setSent] = useState<number | null>(null);
  const value = Number(amount || 0);
  const openDay = payoutOpen();
  const valid = openDay && value >= MIN_REDEEM && value <= store.wallet;
  const quick = [MIN_REDEEM, 200, 500].filter((option) => option <= store.wallet);
  const [error, setError] = useState("");

  const redeem = async () => {
    setError("");
    if (!payoutOpen()) {
      setError("Redeem opens on Monday and Thursday.");
      return;
    }
    if (live) {
      try {
        await api("/captain/payouts", { body: { amount: value } });
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "We could not start the transfer.");
        return;
      }
    }
    if (store.redeem(value)) setSent(value);
  };

  if (sent !== null) {
    return (
      <PageShell kicker="WALLET" title="Redeem" onBack={() => navigation.goBack()} footer={<FlowCta label="Back to wallet" icon="wallet" onPress={() => navigation.goBack()} />}>
        <View style={styles.done}>
          <View style={styles.doneRing}>
            <View style={styles.doneDisc}>
              <Ionicons name="checkmark" size={34} color={colors.night} />
            </View>
          </View>
          <Text style={[page.kicker, { marginTop: 16 }]}>TRANSFER STARTED</Text>
          <Text style={[page.title, { marginTop: 6, textAlign: "center" }]}>{inr(sent)} is on its way</Text>
          <Text style={[page.lead, { textAlign: "center", marginTop: 6 }]}>To bank account ••{captain.bankLast4}. It reaches within 24 hours.</Text>
        </View>
      </PageShell>
    );
  }

  return (
    <PageShell
      kicker="WALLET"
      title="Redeem to bank"
      onBack={() => navigation.goBack()}
      footer={
        <>
          <FlowSum value={valid ? inr(value) : "—"} sub="To bank" />
          <FlowCta label={valid ? `Redeem ${inr(value)}` : `Enter ${inr(MIN_REDEEM)} to ${inr(store.wallet)}`} icon="arrow-up" disabled={!valid} onPress={() => void redeem()} />
        </>
      }
    >
      <View style={page.card}>
        <Text style={page.kicker}>WALLET BALANCE</Text>
        <Text style={styles.balanceSmall}>{inr(store.wallet)}</Text>
        <View style={page.rule} />
        <Field label="Amount to redeem" prefix="₹" value={amount} onChangeText={(text) => setAmount(text.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" error={amount && !valid ? `Choose between ${inr(MIN_REDEEM)} and ${inr(store.wallet)}.` : undefined} />
        <View style={styles.quick}>
          {quick.map((option) => (
            <Pressable key={option} onPress={() => setAmount(String(option))} style={[styles.quickChip, value === option && styles.quickOn]}>
              <Text style={[styles.quickText, value === option && { color: colors.night }]}>{inr(option)}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setAmount(String(Math.floor(store.wallet)))} style={[styles.quickChip, value === Math.floor(store.wallet) && styles.quickOn]}>
            <Text style={[styles.quickText, value === Math.floor(store.wallet) && { color: colors.night }]}>All</Text>
          </Pressable>
        </View>
      </View>
      <SectionTitle>SENDING TO</SectionTitle>
      <View style={page.card}>
        <Line label="Account" value={`••${captain.bankLast4}`} />
        <Line label="Name" value={captain.bankHolder} />
        <Line label="IFSC" value={captain.ifsc} />
        <Line label="Arrives" value="Within 24 hours" />
      </View>
      <View style={page.note}>
        <Ionicons name="lock-closed-outline" size={16} color={colors.gold} />
        <Text style={page.noteText}>{error || (live ? "The ROVEYA desk sends the transfer and shares the bank reference." : "Test mode transfer. No bank is charged.")}</Text>
      </View>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  balance: { marginTop: 8, color: colors.cream, fontFamily: type.labelStrong, fontSize: 40, lineHeight: 46 },
  balanceSmall: { marginTop: 6, color: colors.cream, fontFamily: type.labelStrong, fontSize: 30, lineHeight: 36 },
  redeem: { marginTop: 16, height: 48, borderRadius: 16, backgroundColor: colors.gold, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  redeemText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 15 },
  heroStats: { marginTop: 14, flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 18, backgroundColor: "rgba(18,6,13,0.45)", borderWidth: 1, borderColor: colors.hairline },
  heroStat: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15 },
  heroLine: { width: 1, height: 30, backgroundColor: colors.line },
  txn: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  txnLine: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  txnIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  txnIconIn: { backgroundColor: colors.gold, borderColor: colors.gold },
  txnAmount: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15 },
  quick: { marginTop: 12, flexDirection: "row", gap: 8, flexWrap: "wrap" },
  quickChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 16, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line },
  quickOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  quickText: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 13.5 },
  done: { alignItems: "center", paddingVertical: 30 },
  doneRing: { width: 104, height: 104, borderRadius: 52, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  doneDisc: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
});
