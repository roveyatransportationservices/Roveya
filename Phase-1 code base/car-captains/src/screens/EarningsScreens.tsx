import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CYCLES, CycleOptions } from "../components/Cycles";
import { Button, Chip, Header, Icon, PageTitle, Sheet, Skeleton, SkeletonCard } from "../components/kit";
import { inr, shortDate } from "../format";
import { useLive } from "../hooks";
import { service } from "../service";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { Cycle } from "../types";
import type { CaptainStack, CaptainTabs } from "../navigation";

type Props = CompositeScreenProps<BottomTabScreenProps<CaptainTabs, "Earnings">, NativeStackScreenProps<CaptainStack>>;

const RANGES: { key: "today" | "week" | "month"; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
];

const cycleName = (cycle: Cycle) => CYCLES.find((item) => item.cycle === cycle)?.title ?? cycle;

export function EarningsScreen({ navigation }: Props) {
  const [range, setRange] = useState<"today" | "week" | "month">("week");
  const payouts = useLive(() => service.payouts());
  const earnings = useLive(() => service.earnings(range));
  const { reload } = earnings;

  useEffect(() => {
    void reload();
  }, [range, reload]);

  const plan = payouts.data?.plan;

  return (
    <View style={styles.screen}>
      <Header title="Earnings" subtitle="You keep the seat fare. Passengers pay the booking fee." />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 14 }}
        refreshControl={
          <RefreshControl
            refreshing={payouts.refreshing}
            onRefresh={() => {
              void payouts.reload(true);
              void earnings.reload();
            }}
            tintColor={colors.gold}
            colors={[colors.gold]}
          />
        }
      >
        {payouts.data ? (
          <LinearGradient colors={[colors.burgundy, colors.cherry, colors.inkwell]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balance}>
            <Text style={styles.balanceLabel}>In your wallet</Text>
            <Text style={styles.balanceValue}>{inr(payouts.data.balance)}</Text>
            <Text style={styles.balanceLine}>
              {plan ? `${cycleName(plan.cycle)} settlement on ${shortDate(plan.periodEnd)} to bank ••${payouts.data.bankLast4}` : "Pick a payout cycle to get paid"}
            </Text>
            <View style={styles.art} pointerEvents="none">
              <Icon name="mc:wallet-outline" size={90} color="rgba(214,160,0,0.12)" />
            </View>
          </LinearGradient>
        ) : (
          <Skeleton height={150} radius={24} />
        )}

        {plan ? (
          <Pressable onPress={() => navigation.navigate("PayoutPlan")} style={({ pressed }) => [styles.plan, pressed && { borderColor: colors.gold }]}>
            <View style={styles.planIcon}>
              <Icon name={CYCLES.find((item) => item.cycle === plan.cycle)?.icon ?? "mc:calendar-week"} size={20} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.planTitle}>{cycleName(plan.cycle)} payouts</Text>
              <Text style={styles.planLine}>
                {plan.pendingCycle ? `Switching to ${cycleName(plan.pendingCycle).toLowerCase()} after ${shortDate(plan.periodEnd)}` : `Current cycle ${shortDate(plan.periodStart)} – ${shortDate(plan.periodEnd)}`}
              </Text>
            </View>
            <Text style={styles.change}>Change</Text>
          </Pressable>
        ) : null}

        <View style={styles.ranges}>
          {RANGES.map((item) => (
            <Chip key={item.key} label={item.label} on={range === item.key} onPress={() => setRange(item.key)} />
          ))}
        </View>
        {earnings.data && earnings.data.range === range ? (
          <View style={styles.card}>
            <Text style={styles.earned}>{inr(earnings.data.earned)}</Text>
            <Text style={styles.small}>
              Earned {RANGES.find((item) => item.key === range)?.label.toLowerCase()} · {earnings.data.completed} trips completed{earnings.data.cancelled ? ` · ${earnings.data.cancelled} cancelled` : ""}
            </Text>
            <View style={styles.entries}>
              {earnings.data.entries.length ? (
                earnings.data.entries.map((entry) => (
                  <View key={entry.id} style={styles.entry}>
                    <View style={[styles.entryIcon, entry.amount < 0 && { borderColor: colors.hairline }]}>
                      <Ionicons name={entry.amount > 0 ? "arrow-down" : "arrow-up"} size={14} color={entry.amount > 0 ? colors.success : colors.muted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.entryLabel}>{entry.note ?? entry.kind}</Text>
                      <Text style={styles.small}>{shortDate(entry.at)}</Text>
                    </View>
                    <Text style={[styles.entryAmount, entry.amount > 0 && { color: colors.success }]}>
                      {entry.amount > 0 ? "+" : "−"}
                      {inr(Math.abs(entry.amount))}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.small}>Complete a trip and the seat fares show up here.</Text>
              )}
            </View>
          </View>
        ) : (
          <SkeletonCard lines={4} />
        )}

        <Text style={styles.section}>SETTLEMENTS</Text>
        <View style={styles.card}>
          {payouts.data?.payouts.length ? (
            payouts.data.payouts.map((payout) => (
              <View key={payout.id} style={styles.entry}>
                <View style={styles.entryIcon}>
                  <Icon name="mc:bank-transfer" size={16} color={payout.status === "paid" ? colors.success : colors.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.entryLabel}>
                    {payout.cycle ? `${cycleName(payout.cycle)} settlement` : "Payout"}
                    {payout.periodStart && payout.periodEnd ? ` · ${shortDate(payout.periodStart)} – ${shortDate(payout.periodEnd)}` : ""}
                  </Text>
                  <Text style={styles.small}>{payout.status === "paid" ? `Paid · ${payout.reference ?? ""}` : payout.status === "rejected" ? "Returned to wallet" : "Processing, usually same day"}</Text>
                </View>
                <Text style={styles.entryAmount}>{inr(payout.amount)}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.small}>Your first settlement appears here at the end of your {plan ? cycleName(plan.cycle).toLowerCase() : ""} cycle.</Text>
          )}
        </View>
        {payouts.error || earnings.error ? <Text style={styles.error}>{payouts.error || earnings.error}</Text> : null}
      </ScrollView>
    </View>
  );
}

export function PayoutPlanScreen({ navigation }: NativeStackScreenProps<CaptainStack, "PayoutPlan">) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const payouts = useLive(() => service.payouts());
  const plan = payouts.data?.plan ?? store.profile?.plan ?? null;
  const [choice, setChoice] = useState<Cycle | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selected = choice ?? plan?.pendingCycle ?? plan?.cycle ?? "weekly";

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await service.choosePlan(selected);
      setMessage(result.message);
      setConfirm(false);
      void payouts.reload();
      void store.refresh();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <PageTitle title="Payout cycle" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140, gap: 14 }}>
        {plan ? (
          <View style={styles.card}>
            <Text style={styles.planTitle}>You are on {cycleName(plan.cycle).toLowerCase()} payouts</Text>
            <Text style={styles.small}>
              This cycle runs {shortDate(plan.periodStart)} to {shortDate(plan.periodEnd)}. Everything in your wallet at the end goes to your bank that day.
            </Text>
            {plan.pendingCycle ? (
              <View style={styles.pending}>
                <Ionicons name="time-outline" size={15} color={colors.gold} />
                <Text style={styles.pendingText}>
                  {cycleName(plan.pendingCycle)} payouts start after {shortDate(plan.periodEnd)}.
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
        <CycleOptions value={selected} onChange={setChoice} current={plan?.cycle} />
        <View style={styles.pending}>
          <Ionicons name="lock-closed-outline" size={15} color={colors.gold} />
          <Text style={styles.pendingText}>A running cycle cannot be broken. Your change starts the moment the current cycle settles. Wallet balances under ₹100 roll into the next cycle.</Text>
        </View>
        {message ? <Text style={styles.success}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Button label={selected === (plan?.pendingCycle ?? plan?.cycle) ? "This is your plan" : `Switch to ${cycleName(selected).toLowerCase()}`} disabled={!plan || selected === (plan.pendingCycle ?? plan.cycle)} onPress={() => setConfirm(true)} />
      </View>
      <Sheet visible={confirm} onClose={() => setConfirm(false)} title={`Switch to ${cycleName(selected).toLowerCase()}?`} footer={<Button label="Confirm switch" loading={busy} onPress={() => void save()} />}>
        <Text style={styles.lead}>
          Your {plan ? cycleName(plan.cycle).toLowerCase() : ""} cycle still settles on {plan ? shortDate(plan.periodEnd) : ""}. {cycleName(selected)} payouts begin right after
          {selected === "monthly" ? ", and a monthly cycle stays locked for the full month once it starts." : "."}
        </Text>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  balance: { borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  balanceLabel: { color: colors.muted, fontFamily: type.regular, fontSize: 13 },
  balanceValue: { marginTop: 6, color: colors.cream, fontFamily: type.bold, fontSize: 36 },
  balanceLine: { marginTop: 6, color: colors.gold, fontFamily: type.medium, fontSize: 12.5, maxWidth: "80%" },
  art: { position: "absolute", right: -8, bottom: -14 },
  plan: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  planIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line },
  planTitle: { color: colors.cream, fontFamily: type.semibold, fontSize: 15 },
  planLine: { marginTop: 2, color: colors.muted, fontFamily: type.regular, fontSize: 12 },
  change: { color: colors.gold, fontFamily: type.semibold, fontSize: 13 },
  ranges: { flexDirection: "row", gap: 8 },
  card: { padding: 16, borderRadius: 20, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, gap: 8 },
  earned: { color: colors.gold, fontFamily: type.bold, fontSize: 28 },
  small: { color: colors.faint, fontFamily: type.regular, fontSize: 12, lineHeight: 17 },
  entries: { marginTop: 6, gap: 12 },
  entry: { flexDirection: "row", alignItems: "center", gap: 12 },
  entryIcon: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: "rgba(127,199,154,0.4)", alignItems: "center", justifyContent: "center" },
  entryLabel: { color: colors.cream, fontFamily: type.medium, fontSize: 13.5 },
  entryAmount: { color: colors.cream, fontFamily: type.semibold, fontSize: 14 },
  section: { marginTop: 4, color: colors.gold, fontFamily: type.semibold, fontSize: 11, letterSpacing: 2 },
  error: { color: colors.danger, fontFamily: type.regular, fontSize: 12.5 },
  success: { color: colors.success, fontFamily: type.medium, fontSize: 13, lineHeight: 19 },
  pending: { flexDirection: "row", gap: 8, padding: 12, borderRadius: 14, backgroundColor: "rgba(214,160,0,0.08)", borderWidth: 1, borderColor: colors.line },
  pendingText: { flex: 1, color: colors.muted, fontFamily: type.regular, fontSize: 12.5, lineHeight: 18 },
  lead: { color: colors.muted, fontFamily: type.regular, fontSize: 14, lineHeight: 21 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.inkwell, borderTopWidth: 1, borderTopColor: colors.line },
});
