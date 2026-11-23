import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { BannerCarousel } from "../components/BannerCarousel";
import { Group, ListRow, Pill, SectionTitle, page } from "../components/PageShell";
import { art, slide } from "../banners";
import { FlowCta } from "../components/StepShell";
import { TabPage } from "../components/TabPage";
import { inr } from "../geo";
import { dailyTargets, inPeak, LONG_PICKUP_BONUS, LONG_PICKUP_KM, nextTarget, PEAK_BONUS, peakWindows, startOfDay, startOfWeek, weeklyTargets } from "../orders";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { CaptainStack, CaptainTabs } from "../navigation";

type Props = CompositeScreenProps<BottomTabScreenProps<CaptainTabs, "Incentives">, NativeStackScreenProps<CaptainStack>>;

function hourLabel(hour: number) {
  return `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`;
}

export function IncentivesScreen({ navigation }: Props) {
  const store = useStore();
  const doneToday = store.trips.filter((trip) => trip.status === "Completed" && trip.at >= startOfDay()).length;
  const doneWeek = store.trips.filter((trip) => trip.status === "Completed" && trip.at >= startOfWeek()).length;
  const daily = nextTarget(dailyTargets, doneToday);
  const weekly = nextTarget(weeklyTargets, doneWeek);
  const peak = inPeak();
  const bonusToday = store.trips.filter((trip) => trip.at >= startOfDay()).reduce((sum, trip) => sum + trip.bonus, 0);

  return (
    <TabPage kicker="INCENTIVES" title="Earn more today">
      <BannerCarousel
        style={{ marginBottom: 14 }}
        slides={[
          slide(art.ride, "RUSH HOUR", "No extra rush-hour pay. The passenger price stays the same."),
          slide(art.cab, "YOUR PLAN", "One completed trip uses the day fee. Later trips that day are free."),
          slide(art.earn, "LONG PICKUP", "No extra pay for a long pickup. The passenger price stays the same."),
        ]}
      />
      <LinearGradient colors={[colors.burgundy, colors.plum, colors.inkwell]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={page.heroCard}>
        <View style={styles.heroTop}>
          <Text style={page.kicker}>TODAY'S TARGET</Text>
          <Pill label={daily ? `${daily.orders - doneToday} to go` : "All done"} tone="solid" />
        </View>
        <Text style={styles.big}>{daily ? `${inr(daily.reward)} bonus` : "Targets complete"}</Text>
        <Text style={page.lead}>{daily ? `Complete ${daily.orders} rides today · ${doneToday} done so far` : `You finished every daily target · ${doneToday} rides`}</Text>
        <Milestones targets={dailyTargets} done={doneToday} />
        <Text style={styles.foot}>Bonuses already earned today: {inr(bonusToday)}</Text>
      </LinearGradient>

      <SectionTitle>THIS WEEK</SectionTitle>
      <View style={page.card}>
        <View style={styles.rowTop}>
          <View style={{ flex: 1 }}>
            <Text style={page.name}>{weekly ? `${weekly.orders} rides · ${inr(weekly.reward)}` : "Weekly targets complete"}</Text>
            <Text style={page.small}>Monday to Sunday · {doneWeek} done</Text>
          </View>
          <Ionicons name="calendar" size={20} color={colors.gold} />
        </View>
        <Milestones targets={weeklyTargets} done={doneWeek} dark />
      </View>

      <SectionTitle>BONUS ON EVERY RIDE</SectionTitle>
      <Group>
        {peakWindows.map((window, index) => {
          const live = peak?.label === window.label;
          return (
            <ListRow
              key={window.label}
              icon={index === 0 ? "sunny-outline" : "moon-outline"}
              label={`${window.label} · +${inr(PEAK_BONUS)} a ride`}
              sub={`${hourLabel(window.from)} to ${hourLabel(window.to)} daily`}
              chevron={false}
              right={<Pill label={live ? "Live now" : "Later"} tone={live ? "solid" : "muted"} />}
            />
          );
        })}
        <ListRow icon="navigate-outline" label={`Long pickup · +${inr(LONG_PICKUP_BONUS)}`} sub={`When the pickup is more than ${LONG_PICKUP_KM} km away`} chevron={false} right={<Pill label="Always on" />} />
        <ListRow icon="rainy-outline" label="Rain bonus" sub="Switches on in heavy rain in your city" last chevron={false} right={<Pill label="Not raining" tone="muted" />} />
      </Group>

      <View style={page.note}>
        <Ionicons name="wallet-outline" size={16} color={colors.gold} />
        <Text style={page.noteText}>Rush-hour and long-pickup bonuses are off. Target bonuses stay off until the desk turns them on.</Text>
      </View>

      <View style={{ marginTop: 16 }}>
        <FlowCta label={store.online ? "Back to duty" : "Go on duty"} icon="speedometer" onPress={() => navigation.navigate("Duty")} />
      </View>
    </TabPage>
  );
}

function Milestones({ targets, done, dark }: { targets: { orders: number; reward: number }[]; done: number; dark?: boolean }) {
  const top = targets[targets.length - 1].orders;
  return (
    <View style={styles.track}>
      <View style={[styles.rail, dark && { backgroundColor: colors.night }]}>
        <View style={[styles.railFill, { width: `${Math.min(100, (done / top) * 100)}%` }]} />
      </View>
      <View style={styles.marks}>
        {targets.map((target) => {
          const hit = done >= target.orders;
          return (
            <View key={target.orders} style={[styles.mark, { left: `${(target.orders / top) * 100}%` }]}>
              <View style={[styles.markDot, hit && styles.markDotHit, dark && !hit && { backgroundColor: colors.night }]}>
                {hit ? <Ionicons name="checkmark" size={11} color={colors.night} /> : <Text style={styles.markNum}>{target.orders}</Text>}
              </View>
              <Text style={[styles.markReward, hit && { color: colors.gold }]}>{inr(target.reward)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  big: { marginTop: 8, color: colors.cream, fontFamily: type.labelStrong, fontSize: 32, lineHeight: 38 },
  foot: { marginTop: 44, color: colors.faint, fontFamily: type.body, fontSize: 12 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  track: { marginTop: 18, marginRight: 14, marginBottom: 30 },
  rail: { height: 6, borderRadius: 3, backgroundColor: "rgba(18,6,13,0.5)", overflow: "hidden" },
  railFill: { height: 6, borderRadius: 3, backgroundColor: colors.gold },
  marks: { position: "absolute", left: 0, right: 0, top: -9 },
  mark: { position: "absolute", alignItems: "center", width: 48, marginLeft: -24 },
  markDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.gold, backgroundColor: colors.plum, alignItems: "center", justifyContent: "center" },
  markDotHit: { backgroundColor: colors.gold },
  markNum: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 10.5 },
  markReward: { marginTop: 4, color: colors.muted, fontFamily: type.labelStrong, fontSize: 11 },
});
