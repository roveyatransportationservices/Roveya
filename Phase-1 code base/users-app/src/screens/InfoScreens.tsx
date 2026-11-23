import { useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button, Card, Header, Icon, OfferCard } from "../components/kit";
import { offers } from "../data";
import { useScreenWidth } from "../layout";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { Glyph } from "../types";
import type { UserStack } from "../navigation";

export function OffersScreen({ navigation }: NativeStackScreenProps<UserStack, "Offers">) {
  const width = useScreenWidth() - 32;
  const [copied, setCopied] = useState("");
  return (
    <View style={styles.screen}>
      <Header title="Offers" subtitle="Apply a code on the review screen" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {offers.map((offer) => (
          <View key={offer.code}>
            <OfferCard offer={offer} width={width} onPress={() => setCopied(offer.code)} />
            {copied === offer.code ? <Text style={styles.copied}>Use {offer.code} when you review your booking.</Text> : null}
          </View>
        ))}
        <Card>
          <Text style={styles.kicker}>STUDENT PASS</Text>
          <Text style={styles.title}>Flat 10% off every trip for a year</Text>
          <Text style={styles.line}>Verify your college ID once. The discount applies on its own at checkout with STUDENT10.</Text>
        </Card>
      </ScrollView>
    </View>
  );
}

const promises: { icon: Glyph; title: string; line: string }[] = [
  { icon: "mc:seat-passenger", title: "Women sit next to women", line: "A seat beside a woman traveller opens only to women. You see it in pink on the seat map." },
  { icon: "mc:account-check-outline", title: "Verified captains", line: "Police verification, licence checks, and safety training for every captain." },
  { icon: "mc:map-marker-radius-outline", title: "Live trip sharing", line: "Share your car's live location with family from the ticket." },
  { icon: "mc:alarm-light-outline", title: "SOS on every ticket", line: "One tap reaches the ROVEYA desk and 112 together." },
  { icon: "mc:car-side", title: "Women-friendly cars", line: "Cars marked women friendly have women travellers booked or women captains." },
];

export function WomenZoneScreen({ navigation }: NativeStackScreenProps<UserStack, "WomenZone">) {
  const store = useStore();
  return (
    <View style={styles.screen}>
      <Header title="Women Zone" subtitle="Safer seats for women travellers" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <LinearGradient colors={[colors.burgundy, colors.plum, colors.inkwell]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroIcon}>
            <Icon name="mc:face-woman-outline" size={28} color={colors.rose} />
          </View>
          <Text style={styles.heroTitle}>Travel with confidence</Text>
          <Text style={styles.heroLine}>Women-only seats, verified captains, and live tracking on every ROVEYA car.</Text>
          <View style={styles.toggle}>
            <Text style={styles.toggleText}>Show women-friendly cars first</Text>
            <Switch value={store.womenOnly} onValueChange={store.setWomenOnly} trackColor={{ true: colors.gold, false: colors.mist }} thumbColor={colors.cream} />
          </View>
        </LinearGradient>
        <View style={{ gap: 10, marginTop: 16 }}>
          {promises.map((item) => (
            <Card key={item.title} style={styles.promise}>
              <View style={styles.promiseIcon}>
                <Icon name={item.icon} size={20} color={colors.rose} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.promiseTitle}>{item.title}</Text>
                <Text style={styles.line}>{item.line}</Text>
              </View>
            </Card>
          ))}
        </View>
        <Card style={{ marginTop: 16 }}>
          <Text style={styles.kicker}>WOMEN15</Text>
          <Text style={styles.title}>15% off for women travellers</Text>
          <Text style={styles.line}>Up to ₹150 off every booking made by a woman traveller.</Text>
        </Card>
        <Button label="Find a car" icon="search" onPress={() => navigation.navigate("Results")} style={{ marginTop: 18 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  copied: { marginTop: 6, color: colors.gold, fontFamily: type.medium, fontSize: 12.5 },
  kicker: { color: colors.gold, fontFamily: type.semibold, fontSize: 11, letterSpacing: 2 },
  title: { marginTop: 8, color: colors.cream, fontFamily: type.semibold, fontSize: 17 },
  line: { marginTop: 4, color: colors.muted, fontFamily: type.regular, fontSize: 13, lineHeight: 19 },
  hero: { borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.line },
  heroIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(229,138,168,0.14)", borderWidth: 1, borderColor: "rgba(229,138,168,0.45)", alignItems: "center", justifyContent: "center" },
  heroTitle: { marginTop: 14, color: colors.cream, fontFamily: type.semibold, fontSize: 22 },
  heroLine: { marginTop: 6, color: colors.muted, fontFamily: type.regular, fontSize: 13.5, lineHeight: 20 },
  toggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.hairline },
  toggleText: { flex: 1, color: colors.cream, fontFamily: type.medium, fontSize: 14 },
  promise: { flexDirection: "row", alignItems: "center", gap: 12 },
  promiseIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(229,138,168,0.1)", borderWidth: 1, borderColor: "rgba(229,138,168,0.3)" },
  promiseTitle: { color: colors.cream, fontFamily: type.semibold, fontSize: 14.5 },
});
