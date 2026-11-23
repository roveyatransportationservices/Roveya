import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button, Sheet } from "../components/kit";
import { referFaqs, referSteps, referTerms } from "../data";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { UserStack } from "../navigation";

export function ReferScreen({ navigation }: NativeStackScreenProps<UserStack, "Refer">) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const [panel, setPanel] = useState<"faq" | "terms" | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const code = store.user ? `ROV${store.user.phone.slice(-4)}${(store.user.name || "R").slice(0, 1).toUpperCase()}` : "";

  const share = () =>
    void Share.share({ message: `Travel city to city in a verified ROVEYA car seat. Sign up with my code ${code} and get 20% off your first seat, up to ₹250.` }).catch(() => undefined);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 6 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.cream} />
        </Pressable>
        <Text style={styles.title}>Refer A Friend</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[colors.burgundy, colors.cherry, colors.night]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <Image source={require("../../assets/cust-pool-group.jpg")} style={styles.heroPhoto} resizeMode="cover" />
          <LinearGradient colors={[colors.cherry, "rgba(76,16,44,0.85)", "rgba(76,16,44,0)"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>Introduce ROVEYA to your friends and earn rewards</Text>
            <View style={styles.rewards}>
              <View style={styles.reward}>
                <Text style={styles.rewardValue}>₹150 off</Text>
                <Text style={styles.rewardFor}>for you</Text>
              </View>
              <View style={[styles.reward, styles.rewardGold]}>
                <Text style={[styles.rewardValue, { color: colors.night }]}>₹250 off</Text>
                <Text style={[styles.rewardFor, { color: colors.night }]}>for your friend</Text>
              </View>
            </View>
            <Text style={styles.tc}>*T&C apply</Text>
          </View>
        </LinearGradient>

        <View style={styles.card}>
          <Text style={styles.how}>How it works</Text>
          {referSteps.map((step) => (
            <View key={step.text} style={styles.step}>
              <View style={styles.stepIcon}>
                <Ionicons name={step.icon} size={26} color={colors.gold} />
              </View>
              <Text style={styles.stepText}>{step.text}</Text>
            </View>
          ))}
          <Text style={styles.closing}>Read the Terms & Conditions of the referral programme before you share.</Text>
          <Text style={styles.closing}>Happy referring and travelling with ROVEYA!</Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.links}>
          <Pressable hitSlop={8} onPress={() => setPanel("faq")}>
            <Text style={styles.link}>FAQ</Text>
          </Pressable>
          <View style={styles.linkRule} />
          <Pressable hitSlop={8} onPress={() => setPanel("terms")}>
            <Text style={styles.link}>Terms & Conditions</Text>
          </Pressable>
        </View>
        {store.user ? (
          <>
            <Pressable onPress={() => setCopied(true)} style={styles.codeBox}>
              <View>
                <Text style={styles.codeLabel}>YOUR CODE</Text>
                <Text style={styles.code}>{code}</Text>
              </View>
              <Text style={styles.copy}>{copied ? "Copied" : "Tap to copy"}</Text>
            </Pressable>
            <Button label="Share with friends" icon="share-social-outline" onPress={share} />
          </>
        ) : (
          <Button label="Login" onPress={() => navigation.navigate("Login")} />
        )}
      </View>

      <Sheet visible={panel === "faq"} onClose={() => setPanel(null)} title="Referral FAQ">
        {referFaqs.map((faq) => {
          const expanded = open === faq.q;
          return (
            <Pressable key={faq.q} onPress={() => setOpen(expanded ? null : faq.q)} style={styles.faq}>
              <View style={styles.faqHead}>
                <Text style={styles.faqQ}>{faq.q}</Text>
                <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.gold} />
              </View>
              {expanded ? <Text style={styles.faqA}>{faq.a}</Text> : null}
            </Pressable>
          );
        })}
      </Sheet>

      <Sheet visible={panel === "terms"} onClose={() => setPanel(null)} title="Referral Terms & Conditions">
        {referTerms.map((term, index) => (
          <View key={term} style={styles.term}>
            <Text style={styles.termNumber}>{index + 1}</Text>
            <Text style={styles.faqA}>{term}</Text>
          </View>
        ))}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  title: { color: colors.cream, fontFamily: type.semibold, fontSize: 18 },
  hero: { height: 210, overflow: "hidden", borderBottomWidth: 1, borderBottomColor: colors.line },
  heroPhoto: { position: "absolute", right: 0, top: 0, bottom: 0, width: "62%" },
  heroText: { flex: 1, justifyContent: "center", paddingHorizontal: 18, maxWidth: "72%" },
  heroTitle: { color: colors.cream, fontFamily: type.semibold, fontSize: 19, lineHeight: 24 },
  rewards: { flexDirection: "row", gap: 8, marginTop: 14 },
  reward: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: "rgba(18,6,13,0.55)", borderWidth: 1, borderColor: colors.gold },
  rewardGold: { backgroundColor: colors.gold },
  rewardValue: { color: colors.gold, fontFamily: type.bold, fontSize: 16 },
  rewardFor: { color: colors.cream, fontFamily: type.medium, fontSize: 10.5 },
  tc: { marginTop: 8, color: colors.faint, fontFamily: type.regular, fontSize: 10.5 },
  card: { marginHorizontal: 16, marginTop: 18, borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, padding: 18 },
  how: { color: colors.cream, fontFamily: type.semibold, fontSize: 20, marginBottom: 18 },
  step: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 18 },
  stepIcon: { width: 64, height: 64, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, alignItems: "center", justifyContent: "center" },
  stepText: { flex: 1, color: colors.cream, fontFamily: type.regular, fontSize: 14, lineHeight: 20 },
  closing: { marginTop: 6, color: colors.muted, fontFamily: type.regular, fontSize: 13.5, lineHeight: 20 },
  footer: { paddingHorizontal: 16, paddingTop: 12, gap: 12, backgroundColor: colors.inkwell, borderTopWidth: 1, borderTopColor: colors.line },
  links: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14 },
  link: { color: colors.gold, fontFamily: type.medium, fontSize: 13.5 },
  linkRule: { width: 1, height: 18, backgroundColor: colors.line },
  codeBox: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: colors.gold, backgroundColor: colors.night },
  codeLabel: { color: colors.faint, fontFamily: type.semibold, fontSize: 10, letterSpacing: 1.5 },
  code: { marginTop: 2, color: colors.gold, fontFamily: type.bold, fontSize: 20, letterSpacing: 3 },
  copy: { color: colors.cream, fontFamily: type.medium, fontSize: 12.5 },
  faq: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  faqHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  faqQ: { flex: 1, color: colors.cream, fontFamily: type.semibold, fontSize: 14.5 },
  faqA: { flex: 1, marginTop: 6, color: colors.muted, fontFamily: type.regular, fontSize: 13, lineHeight: 19 },
  term: { flexDirection: "row", gap: 10, marginBottom: 10 },
  termNumber: { width: 22, height: 22, marginTop: 6, borderRadius: 11, textAlign: "center", lineHeight: 22, backgroundColor: colors.mist, color: colors.gold, fontFamily: type.semibold, fontSize: 12, overflow: "hidden" },
});
