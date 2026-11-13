import { useState, type ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import Constants from "expo-constants";
import { CarSeats } from "../components/CarSeats";
import { Field } from "../components/Form";
import { Button, Icon, PageTitle } from "../components/kit";
import { REQUIRED_DOCS } from "../docs";
import { LAYOUTS, SEAT_TEMPLATES, isCaptainChair, layoutInfo, validateSeats, type LayoutKind } from "../rules";
import { leaveHost } from "../host";
import { service, templateSeats } from "../service";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { Glyph, SeatCell } from "../types";
import type { CaptainStack, CaptainTabs } from "../navigation";

type Props = CompositeScreenProps<BottomTabScreenProps<CaptainTabs, "Account">, NativeStackScreenProps<CaptainStack>>;

const DESK = "+919000000001";

function Group({ children }: { children: ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

function Row({ icon, label, sub, onPress, last, tone }: { icon: Glyph; label: string; sub?: string; onPress: () => void; last?: boolean; tone?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.mist }]}>
      <View style={styles.rowIcon}>
        <Icon name={icon} size={19} color={tone ?? colors.gold} />
      </View>
      <View style={[styles.rowBody, !last && styles.rowLine]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowLabel, tone ? { color: tone } : null]}>{label}</Text>
          {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.faint} />
      </View>
    </Pressable>
  );
}

export function AccountScreen({ navigation }: Props) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const profile = store.profile!;
  const { captain, car, plan } = profile;
  const docsDone = REQUIRED_DOCS.filter((kind) => profile.documents.some((doc) => doc.kind === kind)).length;

  return (
    <View style={styles.screen}>
      <View style={[styles.head, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{captain.name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headTitle}>{captain.name}</Text>
          <Text style={styles.headSub}>
            {captain.captain_code} · +91 {captain.phone} · {Number(captain.rating).toFixed(1)} ★
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130, gap: 12 }} showsVerticalScrollIndicator={false}>
        {car ? (
          <View style={styles.carCard}>
            <View style={styles.carIcon}>
              <Icon name="mc:car-side" size={24} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.carTitle}>{car.makeModel}</Text>
              <Text style={styles.rowSub}>
                {car.plate} · {layoutInfo(car.layout).title} · {car.seatCount} for travellers · {car.ac ? "AC" : "Non-AC"}
              </Text>
            </View>
            <View style={[styles.badge, car.status === "active" ? styles.badgeOn : car.status === "rejected" ? styles.badgeOff : null]}>
              <Text style={styles.badgeText}>{car.status === "active" ? "Live" : car.status === "rejected" ? "Fix needed" : "In review"}</Text>
            </View>
          </View>
        ) : null}
        {car?.reviewNote ? <Text style={styles.note}>{car.reviewNote}</Text> : null}

        <Group>
          <Row icon="mc:car-seat" label="Seat layout and seat names" sub={car ? `${layoutInfo(car.layout).title} · ${car.seats.map((seat) => seat.label).join(", ")}` : undefined} onPress={() => navigation.navigate("SeatEditor")} />
          <Row icon="mc:file-document-multiple-outline" label="Documents" sub={`${docsDone} of ${REQUIRED_DOCS.length} required added`} onPress={() => navigation.navigate("Documents")} />
          <Row icon="mc:calendar-sync-outline" label="Payout cycle" sub={plan ? `${plan.cycle[0].toUpperCase()}${plan.cycle.slice(1)}${plan.pendingCycle ? `, switching to ${plan.pendingCycle}` : ""}` : undefined} onPress={() => navigation.navigate("PayoutPlan")} last />
        </Group>

        <Group>
          <Row icon="mc:bank-outline" label="Bank account" sub={`•• ${captain.bank_last4} · change through the captain desk`} onPress={() => void Linking.openURL(`tel:${DESK}`)} />
          <Row icon="mc:phone-alert-outline" label="Emergency contact" sub={captain.emergency_name ? `${captain.emergency_name} · ${captain.emergency_phone}` : undefined} onPress={() => void Linking.openURL(`tel:${DESK}`)} last />
        </Group>

        <Group>
          <Row icon="mc:swap-horizontal" label="Change vehicle" sub="Call the desk to move this account to Bike, Auto, or Carpool" onPress={() => void Linking.openURL(`tel:${DESK}`)} />
          <Row icon="mc:headset" label="Call the captain desk" sub="+91 90000 00001" onPress={() => void Linking.openURL(`tel:${DESK}`)} />
          <Row icon="mc:email-outline" label="Email the desk" sub="captains@roveya.com" onPress={() => void Linking.openURL("mailto:captains@roveya.com")} />
          <Row icon="mc:shield-alert-outline" label="24×7 safety line" sub="For anything unsafe on a trip" tone={colors.danger} onPress={() => void Linking.openURL(`tel:${DESK}`)} />
          <Row icon="mc:alarm-light-outline" label="Emergency · 112" tone={colors.danger} onPress={() => void Linking.openURL("tel:112")} last />
        </Group>

        <Button label="Log out" icon="log-out-outline" tone="ghost" onPress={() => void store.signOut()} style={{ marginTop: 6 }} />
        <Text style={styles.version}>
          ROVEYA Captain · v{Constants.expoConfig?.version ?? "1.0.0"}
          {service.live ? "" : " · preview"}
        </Text>
      </ScrollView>
    </View>
  );
}

export function SeatEditorScreen({ navigation }: NativeStackScreenProps<CaptainStack, "SeatEditor">) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const car = store.profile?.car;
  const [layout, setLayout] = useState<LayoutKind>(car?.layout ?? "seat4");
  const [seats, setSeats] = useState<SeatCell[]>(car?.seats.map((seat) => ({ ...seat })) ?? []);
  const [selected, setSelected] = useState<string | null>(car?.seats[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  if (!car) return null;
  const problem = validateSeats(layout, seats);
  const seat = seats.find((item) => item.id === selected);
  const layoutChanged = layout !== car.layout;
  const changed = layoutChanged || seats.some((item, index) => item.label.trim() !== car.seats[index]?.label);

  const pickLayout = (kind: LayoutKind) => {
    setLayout(kind);
    setSeats(kind === car.layout ? car.seats.map((item) => ({ ...item })) : templateSeats(kind));
    setSelected("F1");
    setMessage("");
  };

  const save = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const clean = seats.map((item) => ({ ...item, label: item.label.trim() }));
      if (layoutChanged) await service.changeLayout(layout, clean);
      else await service.updateSeats(clean);
      await store.refresh();
      setMessage(layoutChanged ? "Saved. ROVEYA checks your car photos against the new layout; you can publish again once it is approved. Trips already published keep their seats." : "Saved. New trips show these seat names in the ROVEYA app.");
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <PageTitle title="Seats" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.lead}>Pick the layout that matches {car.makeModel}, then tap a seat to rename it. Travellers book from exactly this map.</Text>
        <View style={{ gap: 8 }}>
          {LAYOUTS.map((item) => {
            const on = layout === item.kind;
            return (
              <Pressable key={item.kind} onPress={() => pickLayout(item.kind)} style={[styles.layout, on && styles.layoutOn]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.layoutTitle, on && { color: colors.night }]}>
                    {item.title}
                    {item.kind === car.layout ? " · current" : ""}
                  </Text>
                  <Text style={[styles.layoutLine, on && { color: "rgba(18,6,13,0.7)" }]}>
                    {item.line} · like {item.examples}
                  </Text>
                </View>
                <Text style={[styles.layoutSeats, on && { color: colors.night }]}>{SEAT_TEMPLATES[item.kind].length}</Text>
              </Pressable>
            );
          })}
        </View>
        {layoutChanged ? (
          <View style={styles.tip}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.gold} />
            <Text style={styles.tipText}>Changing the layout sends your car for a quick check by ROVEYA before your next trip. Trips already published keep their seats.</Text>
          </View>
        ) : null}
        <CarSeats cells={seats} edit layout={layout} selected={selected} onPress={(cell) => setSelected(cell.id)} />
        {seat ? (
          <View style={styles.editor}>
            <Field
              label={`Seat ${seat.id} · ${seat.row === 0 ? "front" : seat.row === 1 ? "middle row" : "back row"} · ${isCaptainChair(layout, seat.row) ? "captain seat" : seat.window ? "window" : "middle"}`}
              value={seat.label}
              onChangeText={(text) => setSeats((list) => list.map((item) => (item.id === seat.id ? { ...item, label: text.slice(0, 12) } : item)))}
              autoCapitalize="characters"
              maxLength={12}
              error={problem ?? undefined}
            />
          </View>
        ) : null}
        <View style={styles.tip}>
          <Ionicons name="information-circle-outline" size={16} color={colors.gold} />
          <Text style={styles.tipText}>Trips you already published keep their seats and names, so tickets never change.</Text>
        </View>
        {message ? <Text style={styles.success}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Button label={layoutChanged ? "Save new layout" : "Save seat names"} loading={busy} disabled={!changed || Boolean(problem)} onPress={() => void save()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  head: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingBottom: 16, backgroundColor: colors.inkwell, borderBottomWidth: 1, borderBottomColor: colors.line },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.plum, borderWidth: 1, borderColor: colors.gold, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.gold, fontFamily: type.bold, fontSize: 20 },
  headTitle: { color: colors.cream, fontFamily: type.semibold, fontSize: 18 },
  headSub: { marginTop: 2, color: colors.muted, fontFamily: type.regular, fontSize: 12.5 },
  carCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 20, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  carIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line },
  carTitle: { color: colors.cream, fontFamily: type.semibold, fontSize: 16 },
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, backgroundColor: "rgba(214,160,0,0.12)" },
  badgeOn: { backgroundColor: "rgba(127,199,154,0.15)" },
  badgeOff: { backgroundColor: "rgba(232,133,127,0.15)" },
  badgeText: { color: colors.cream, fontFamily: type.semibold, fontSize: 11 },
  note: { color: colors.danger, fontFamily: type.regular, fontSize: 12.5, lineHeight: 18 },
  group: { borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 14 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line },
  rowBody: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, paddingRight: 14 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rowLabel: { color: colors.cream, fontFamily: type.medium, fontSize: 15 },
  rowSub: { marginTop: 2, color: colors.faint, fontFamily: type.regular, fontSize: 12.5 },
  version: { marginTop: 8, textAlign: "center", color: colors.faint, fontFamily: type.regular, fontSize: 11.5 },
  lead: { color: colors.muted, fontFamily: type.regular, fontSize: 13.5, lineHeight: 20 },
  layout: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell },
  layoutOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  layoutTitle: { color: colors.cream, fontFamily: type.semibold, fontSize: 14.5 },
  layoutLine: { marginTop: 2, color: colors.faint, fontFamily: type.regular, fontSize: 11.5 },
  layoutSeats: { color: colors.gold, fontFamily: type.bold, fontSize: 18 },
  editor: { padding: 14, borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  tip: { flexDirection: "row", gap: 8, padding: 12, borderRadius: 14, backgroundColor: "rgba(214,160,0,0.08)", borderWidth: 1, borderColor: colors.line },
  tipText: { flex: 1, color: colors.muted, fontFamily: type.regular, fontSize: 12.5, lineHeight: 18 },
  success: { color: colors.success, fontFamily: type.medium, fontSize: 13 },
  error: { color: colors.danger, fontFamily: type.regular, fontSize: 12.5 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.inkwell, borderTopWidth: 1, borderTopColor: colors.line },
});
