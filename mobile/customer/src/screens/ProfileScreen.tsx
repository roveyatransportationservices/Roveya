import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { DESK_PHONE } from "../components/StepShell";
import { inr } from "../geo";
import { REDEEM_COINS, REDEEM_VALUE } from "../lounge";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { CustomerStack, CustomerTabs } from "../navigation";

type Props = CompositeScreenProps<BottomTabScreenProps<CustomerTabs, "Account">, NativeStackScreenProps<CustomerStack>>;
type Icon = keyof typeof Ionicons.glyphMap;
type Row = { icon: Icon; label: string; sub?: string; badge?: string; onPress: () => void };

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function spaced(phone: string) {
  return phone.length === 10 ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` : `+91 ${phone}`;
}

export function ProfileScreen({ navigation }: Props) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const [confirmOut, setConfirmOut] = useState(false);
  const name = store.session?.name?.trim() || "ROVEYA rider";
  const phone = store.session?.phone ?? "";
  const completed = store.rides.filter((ride) => ride.status === "Completed").length;
  const freshCards = store.cards.filter((card) => !card.scratched).length;
  const coinValue = Math.floor(store.coins / REDEEM_COINS) * REDEEM_VALUE;

  useEffect(() => {
    if (!confirmOut) return;
    const timer = setTimeout(() => setConfirmOut(false), 3500);
    return () => clearTimeout(timer);
  }, [confirmOut]);

  const detail = (title: string, body: string) => navigation.navigate("Detail", { title, body });

  const sections: { title: string; rows: Row[] }[] = [
    {
      title: "BOOKINGS",
      rows: [
        { icon: "time-outline", label: "My rides", sub: "Bike, auto, and cab trips", badge: String(store.rides.length), onPress: () => navigation.navigate("Activity") },
        {
          icon: "people-outline",
          label: "Taxipool bookings",
          sub: "City to city seats",
          badge: store.poolBookings.length ? String(store.poolBookings.length) : undefined,
          onPress: () => navigation.navigate("PoolTrips"),
        },
        {
          icon: "cube-outline",
          label: "Parcels",
          sub: "Sent and received",
          badge: store.parcels.length ? String(store.parcels.length) : undefined,
          onPress: () => navigation.navigate("Parcels"),
        },
      ],
    },
    {
      title: "PAYMENTS & REWARDS",
      rows: [
        { icon: "wallet-outline", label: "Wallet", sub: "Balance and top-ups", badge: inr(store.wallet), onPress: () => navigation.navigate("Wallet") },
        { icon: "gift-outline", label: "Scratch cards and coins", sub: `${store.coins} coins`, badge: freshCards ? `${freshCards} new` : undefined, onPress: () => navigation.navigate("Lounge", { section: "rewards" }) },
        { icon: "person-add-outline", label: "Refer a friend", sub: "You both get ₹50", onPress: () => navigation.navigate("Lounge", { section: "rewards" }) },
      ],
    },
    {
      title: "ACCOUNT",
      rows: [
        { icon: "person-circle-outline", label: "Personal details", sub: store.session?.email ?? "Name, phone, and email", onPress: () => navigation.navigate("Personal") },
        {
          icon: "bookmark-outline",
          label: "Saved places",
          sub: `Home · ${store.home?.name ?? "Add"}   Work · ${store.work?.name ?? "Add"}`,
          onPress: () => navigation.navigate("Places"),
        },
        { icon: "notifications-outline", label: "Notifications", sub: "Trip updates and offers", onPress: () => navigation.navigate("Notifications") },
        { icon: "language-outline", label: "Language", sub: "English", onPress: () => navigation.navigate("Language") },
      ],
    },
    {
      title: "SUPPORT & SAFETY",
      rows: [
        { icon: "help-buoy-outline", label: "Help", sub: "Fares, lost items, and refunds", onPress: () => navigation.navigate("Support") },
        { icon: "shield-checkmark-outline", label: "Safety", sub: store.contacts.length ? `${store.contacts.length} trusted contact${store.contacts.length > 1 ? "s" : ""}` : "SOS and trusted contacts", onPress: () => navigation.navigate("Safety") },
        {
          icon: "document-text-outline",
          label: "Claims",
          sub: "Raise a fare or lost item claim",
          badge: store.claims.length ? String(store.claims.length) : undefined,
          onPress: () => navigation.navigate("Claims"),
        },
      ],
    },
    {
      title: "ABOUT",
      rows: [
        { icon: "information-circle-outline", label: "About ROVEYA", sub: "Premium taxipool and travel", onPress: () => navigation.navigate("About") },
        { icon: "reader-outline", label: "Terms and privacy", sub: "How we use your details", onPress: () => navigation.navigate("Terms") },
      ],
    },
  ];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.body, { paddingTop: Math.max(insets.top, 12) + 8 }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>PROFILE</Text>

        <LinearGradient colors={[colors.burgundy, colors.plum, colors.inkwell]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroRow}>
            <View style={styles.ring}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(name) || "R"}</Text>
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
              <Text style={styles.phone}>{spaced(phone)}</Text>
              <View style={styles.verified}>
                <Ionicons name="shield-checkmark" size={11} color={colors.night} />
                <Text style={styles.verifiedText}>VERIFIED</Text>
              </View>
            </View>
            <Pressable accessibilityLabel="Edit profile" onPress={() => navigation.navigate("Personal")} style={styles.edit}>
              <Ionicons name="pencil" size={15} color={colors.gold} />
            </Pressable>
          </View>
          <View style={styles.stats}>
            <Stat
              value={completed ? "4.90" : "New"}
              label="Rating"
              icon="star"
              onPress={() => detail("My rating", completed ? "4.90 from captains on your completed ROVEYA rides." : "Your rating appears after your first completed ride.")}
            />
            <View style={styles.statLine} />
            <Stat value={String(completed)} label="Rides" onPress={() => navigation.navigate("Activity")} />
            <View style={styles.statLine} />
            <Stat value={String(store.coins)} label="Coins" onPress={() => navigation.navigate("Lounge", { section: "rewards" })} />
          </View>
        </LinearGradient>

        <View style={styles.walletRow}>
          <Pressable onPress={() => navigation.navigate("Wallet")} style={({ pressed }) => [styles.walletCard, pressed && { borderColor: colors.gold }]}>
            <View style={styles.walletIcon}>
              <Ionicons name="wallet" size={18} color={colors.night} />
            </View>
            <Text style={styles.walletLabel}>WALLET</Text>
            <Text style={styles.walletValue}>{inr(store.wallet)}</Text>
            <Text style={styles.walletSub}>Add money</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate("Lounge", { section: "rewards" })} style={({ pressed }) => [styles.walletCard, pressed && { borderColor: colors.gold }]}>
            <View style={styles.walletIcon}>
              <Text style={styles.coinR}>R</Text>
            </View>
            <Text style={styles.walletLabel}>COINS</Text>
            <Text style={styles.walletValue}>{store.coins}</Text>
            <Text style={styles.walletSub}>{coinValue ? `Worth ${inr(coinValue)}` : `${REDEEM_COINS - store.coins} to your first ₹${REDEEM_VALUE}`}</Text>
          </Pressable>
        </View>

        {sections.map((section) => (
          <View key={section.title}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.group}>
              {section.rows.map((row, index) => (
                <Pressable key={row.label} onPress={row.onPress} style={({ pressed }) => [styles.row, index < section.rows.length - 1 && styles.rowLine, pressed && { backgroundColor: colors.mist }]}>
                  <View style={styles.rowIcon}>
                    <Ionicons name={row.icon} size={17} color={colors.gold} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowLabel}>{row.label}</Text>
                    {row.sub ? <Text style={styles.rowSub} numberOfLines={1}>{row.sub}</Text> : null}
                  </View>
                  {row.badge ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{row.badge}</Text>
                    </View>
                  ) : null}
                  <Ionicons name="chevron-forward" size={16} color={colors.faint} />
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <Pressable onPress={() => navigation.navigate("Desk")} style={({ pressed }) => [styles.desk, pressed && { borderColor: colors.gold }]}>
          <Ionicons name="headset" size={18} color={colors.gold} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>ROVEYA desk</Text>
            <Text style={styles.rowSub}>+91 90000 00001 · Daily, 5:00 AM to 11:00 PM</Text>
          </View>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => void Linking.openURL(DESK_PHONE)}>
            <Text style={styles.deskCall}>Call</Text>
          </Pressable>
        </Pressable>

        <Pressable
          onPress={() => (confirmOut ? store.signOut() : setConfirmOut(true))}
          style={({ pressed }) => [styles.logout, confirmOut && styles.logoutConfirm, pressed && { opacity: 0.9 }]}
        >
          <Ionicons name="log-out-outline" size={18} color={confirmOut ? colors.cream : colors.muted} />
          <Text style={[styles.logoutText, confirmOut && { color: colors.cream }]}>{confirmOut ? "Tap again to log out" : "Log out"}</Text>
        </Pressable>

        <View style={styles.footer}>
          <View style={styles.footerRule} />
          <Text style={styles.footerBrand}>ROVEYA</Text>
          <Text style={styles.footerLine}>Version 1.0.0 · Crafted in Hyderabad</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Stat({ value, label, icon, onPress }: { value: string; label: string; icon?: Icon; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.stat}>
      <View style={styles.statTop}>
        {icon ? <Ionicons name={icon} size={13} color={colors.gold} /> : null}
        <Text style={styles.statValue}>{value}</Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  body: { paddingHorizontal: 16, paddingBottom: 28 },
  kicker: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 10, letterSpacing: 2.4, marginBottom: 10 },
  hero: { borderRadius: 26, padding: 18, borderWidth: 1, borderColor: colors.line },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  ring: { width: 72, height: 72, borderRadius: 36, borderWidth: 1.5, borderColor: colors.gold, alignItems: "center", justifyContent: "center" },
  avatar: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.night, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 22, letterSpacing: 1 },
  name: { color: colors.cream, fontFamily: type.display, fontSize: 21, lineHeight: 26, letterSpacing: -0.3 },
  phone: { marginTop: 2, color: colors.muted, fontFamily: type.label, fontSize: 13.5 },
  verified: { marginTop: 8, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.gold, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 3 },
  verifiedText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 9.5, letterSpacing: 1.2 },
  edit: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.line, backgroundColor: "rgba(18,6,13,0.45)", alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  stats: { marginTop: 18, flexDirection: "row", alignItems: "center", paddingVertical: 12, borderRadius: 18, backgroundColor: "rgba(18,6,13,0.45)", borderWidth: 1, borderColor: colors.hairline },
  stat: { flex: 1, alignItems: "center" },
  statTop: { flexDirection: "row", alignItems: "center", gap: 4 },
  statValue: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 18 },
  statLabel: { marginTop: 2, color: colors.faint, fontFamily: type.label, fontSize: 11.5 },
  statLine: { width: 1, height: 28, backgroundColor: colors.line },
  walletRow: { marginTop: 12, flexDirection: "row", gap: 10 },
  walletCard: { flex: 1, padding: 14, borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  walletIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  coinR: { color: colors.night, fontFamily: type.bold, fontSize: 15, lineHeight: 18 },
  walletLabel: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 9.5, letterSpacing: 1.8 },
  walletValue: { marginTop: 3, color: colors.cream, fontFamily: type.labelStrong, fontSize: 22 },
  walletSub: { marginTop: 2, color: colors.faint, fontFamily: type.body, fontSize: 12 },
  sectionTitle: { marginTop: 24, marginBottom: 10, color: colors.gold, fontFamily: type.labelStrong, fontSize: 10, letterSpacing: 2.4 },
  group: { borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 14 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  rowLabel: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15 },
  rowSub: { marginTop: 2, color: colors.faint, fontFamily: type.body, fontSize: 12.5 },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, backgroundColor: "rgba(214,160,0,0.14)", borderWidth: 1, borderColor: colors.line },
  badgeText: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 11.5 },
  desk: { marginTop: 24, flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  deskCall: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 14 },
  logout: { marginTop: 12, height: 52, borderRadius: 18, borderWidth: 1, borderColor: colors.line, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  logoutConfirm: { backgroundColor: colors.burgundy, borderColor: colors.burgundy },
  logoutText: { color: colors.muted, fontFamily: type.labelStrong, fontSize: 15 },
  footer: { alignItems: "center", paddingTop: 26, gap: 4 },
  footerRule: { width: 36, height: 1.5, backgroundColor: colors.gold, marginBottom: 8 },
  footerBrand: { color: "rgba(246,241,220,0.32)", fontFamily: type.display, fontSize: 20, letterSpacing: 6 },
  footerLine: { color: colors.faint, fontFamily: type.body, fontSize: 12 },
});
