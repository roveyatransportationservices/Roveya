import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CoverPhoto } from "../components/CoverPhoto";
import { Group, ListRow, PageShell, SectionTitle, page } from "../components/PageShell";
import type { FlowIcon } from "../components/StepShell";
import { inr } from "../geo";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { CustomerStack } from "../navigation";

type Nav = NativeStackScreenProps<CustomerStack, "Services">["navigation"];

const rides: { title: string; line: string; from: string; photo: number }[] = [
  { title: "Bike", line: "Quick city hops", from: "From ₹35", photo: require("../../assets/hero-bike.jpg") },
  { title: "Auto", line: "Door to door", from: "From ₹60", photo: require("../../assets/hero-auto.jpg") },
];

export function ServicesScreen({ navigation }: NativeStackScreenProps<CustomerStack, "Services">) {
  const store = useStore();
  const toSearch = () => navigation.navigate("Search", { target: "drop" });
  const more: { icon: FlowIcon; title: string; line: string; go: (nav: Nav) => void }[] = [
    { icon: "people-outline", title: "Taxipool", line: "City to city seats", go: (nav) => nav.navigate("Pool") },
    { icon: "cube-outline", title: "Parcel", line: "Send by bike or auto", go: (nav) => nav.navigate("ParcelFlow") },
    { icon: "game-controller-outline", title: "Lounge", line: "Play and earn coins", go: (nav) => nav.navigate("Tabs", { screen: "Lounge" }) },
    { icon: "gift-outline", title: "Rewards", line: `${store.coins} coins`, go: (nav) => nav.navigate("Tabs", { screen: "Lounge", params: { section: "rewards" } }) },
  ];

  return (
    <PageShell kicker="ROVEYA" title="All services" onBack={() => navigation.goBack()}>
      <Text style={page.title}>Where are you headed?</Text>
      <Text style={[page.lead, { marginTop: 4 }]}>Every ROVEYA ride, seat, and delivery in one place.</Text>

      <SectionTitle>RIDE NOW</SectionTitle>
      <View style={styles.rides}>
        {rides.map((ride) => (
          <Pressable key={ride.title} onPress={toSearch} style={({ pressed }) => [styles.rideCard, pressed && { borderColor: colors.gold }]}>
            <CoverPhoto source={ride.photo} ratio={0.75} focus={0.5} style={styles.ridePhoto}>
              <LinearGradient colors={["rgba(18,6,13,0)", "rgba(18,6,13,0.9)"]} locations={[0.3, 1]} style={styles.fillAbs} />
              <View style={styles.rideCopy}>
                <Text style={styles.rideTitle}>{ride.title}</Text>
                <Text style={styles.rideLine}>{ride.line}</Text>
              </View>
            </CoverPhoto>
            <Text style={styles.rideFrom}>{ride.from}</Text>
          </Pressable>
        ))}
      </View>

      <SectionTitle>MORE FROM ROVEYA</SectionTitle>
      <View style={styles.grid}>
        {more.map((item) => (
          <Pressable key={item.title} onPress={() => item.go(navigation)} style={({ pressed }) => [styles.tile, pressed && { borderColor: colors.gold }]}>
            <View style={styles.tileIcon}>
              <Ionicons name={item.icon} size={20} color={colors.night} />
            </View>
            <Text style={[page.name, { marginTop: 10 }]}>{item.title}</Text>
            <Text style={page.small}>{item.line}</Text>
          </Pressable>
        ))}
      </View>

      <SectionTitle>YOUR ACCOUNT</SectionTitle>
      <Group>
        <ListRow icon="time-outline" label="My rides" sub={`${store.rides.length} on this phone`} onPress={() => navigation.navigate("Activity")} />
        <ListRow icon="wallet-outline" label="Wallet" sub={`Balance ${inr(store.wallet)}`} onPress={() => navigation.navigate("Wallet")} />
        <ListRow icon="shield-checkmark-outline" label="Safety" sub="SOS and trusted contacts" onPress={() => navigation.navigate("Safety")} />
        <ListRow icon="headset-outline" label="ROVEYA desk" sub="Daily, 5:00 AM to 11:00 PM" last onPress={() => navigation.navigate("Desk")} />
      </Group>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  fillAbs: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  rides: { flexDirection: "row", gap: 10 },
  rideCard: { flex: 1, borderRadius: 20, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  ridePhoto: { height: 128 },
  rideCopy: { position: "absolute", left: 10, right: 10, bottom: 10 },
  rideTitle: { color: colors.cream, fontFamily: type.display, fontSize: 17 },
  rideLine: { color: colors.muted, fontFamily: type.body, fontSize: 11.5 },
  rideFrom: { paddingHorizontal: 10, paddingVertical: 9, color: colors.gold, fontFamily: type.labelStrong, fontSize: 12.5 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { width: "48%", flexGrow: 1, padding: 14, borderRadius: 20, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  tileIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
});
