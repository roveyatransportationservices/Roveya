import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Constants from "expo-constants";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Accordion, Button, PageTitle, Sheet } from "../components/kit";
import { aboutParagraphs, contactCards, faqGroups, feedbackTopics, officeAddress, privacySections, termsSections, type Section } from "../content";
import { live } from "../backend";
import { useStore } from "../store";
import { startConversation } from "../support";
import { colors, type } from "../theme";
import type { UserStack } from "../navigation";

export function FeedbackScreen({ navigation }: NativeStackScreenProps<UserStack, "Feedback">) {
  const store = useStore();
  const [name, setName] = useState(store.user?.name ?? "");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState(store.user?.phone ?? "");
  const [topic, setTopic] = useState(Platform.OS === "ios" ? "iPhone App" : "Android App");
  const [message, setMessage] = useState("");
  const [picking, setPicking] = useState(false);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState("");
  const emailOk = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const ready = name.trim().length >= 2 && /^[6-9]\d{9}$/.test(phone) && emailOk && message.trim().length >= 10;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <PageTitle title="Feedback" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {sent ? (
          <View style={styles.sent}>
            <View style={styles.sentRing}>
              <Ionicons name="checkmark" size={32} color={colors.night} />
            </View>
            <Text style={styles.sentTitle}>Thank you, {name.trim().split(" ")[0]}</Text>
            <Text style={styles.sentLine}>Your feedback on {topic} reached the ROVEYA team. If you asked a question, we reply on +91 {phone} within a day.</Text>
            <Button label="Back to Account" onPress={() => navigation.goBack()} style={{ alignSelf: "stretch", marginTop: 20 }} />
          </View>
        ) : (
          <>
            <View style={styles.form}>
              <Floating label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
              <Floating label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" bad={!emailOk} />
              <Floating label="Mobile Number" value={phone} onChangeText={(text) => setPhone(text.replace(/\D/g, "").slice(0, 10))} keyboardType="number-pad" />
              <Pressable onPress={() => setPicking(true)} style={[styles.formRow, styles.formLine]}>
                <Text style={styles.formLabel}>Feedback on</Text>
                <Text style={styles.formValue}>{topic}</Text>
                <Ionicons name="chevron-down" size={18} color={colors.gold} />
              </Pressable>
              <TextInput
                value={message}
                onChangeText={(text) => setMessage(text.slice(0, 600))}
                multiline
                placeholder="Feedback"
                placeholderTextColor={colors.faint}
                selectionColor={colors.gold}
                style={styles.message}
              />
              <Text style={styles.count}>{message.length}/600</Text>
            </View>
            {failed ? <Text style={styles.failed}>{failed}</Text> : null}
            <Button
              label={sending ? "Sending…" : "Submit"}
              disabled={!ready}
              loading={sending}
              onPress={async () => {
                setSending(true);
                setFailed("");
                try {
                  if (live) {
                    if (!store.user) throw new Error("Log in first, so the ROVEYA team can reply to you.");
                    const contact = [name.trim(), `+91 ${phone}`, email.trim()].filter(Boolean).join(" · ");
                    await startConversation(`Feedback · ${topic}`, `${message.trim()}\n\n${contact}`);
                  } else {
                    await new Promise((resolve) => setTimeout(resolve, 900));
                  }
                  setSent(true);
                } catch (error) {
                  setFailed((error as Error).message);
                } finally {
                  setSending(false);
                }
              }}
              style={{ marginHorizontal: 24, marginTop: 18 }}
            />
          </>
        )}
      </ScrollView>
      <Sheet visible={picking} onClose={() => setPicking(false)} title="Feedback on">
        {feedbackTopics.map((item) => (
          <Pressable
            key={item}
            onPress={() => {
              setTopic(item);
              setPicking(false);
            }}
            style={[styles.pick, item === topic && styles.pickOn]}
          >
            <Text style={styles.pickText}>{item}</Text>
            {item === topic ? <Ionicons name="checkmark-circle" size={20} color={colors.gold} /> : null}
          </Pressable>
        ))}
      </Sheet>
    </KeyboardAvoidingView>
  );
}

function Floating({ label, value, onChangeText, bad, ...rest }: { label: string; value: string; onChangeText: (text: string) => void; bad?: boolean; keyboardType?: "email-address" | "number-pad"; autoCapitalize?: "none" | "words" }) {
  const [focus, setFocus] = useState(false);
  const lifted = focus || Boolean(value);
  return (
    <View style={[styles.floating, styles.formLine, bad && { borderBottomColor: colors.danger }]}>
      {lifted ? <Text style={[styles.floatLabel, focus && { color: colors.gold }]}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        placeholder={lifted ? "" : label}
        placeholderTextColor={colors.faint}
        selectionColor={colors.gold}
        style={styles.floatInput}
        {...rest}
      />
    </View>
  );
}

function SectionList({ sections }: { sections: Section[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <View style={styles.sheetCard}>
      {sections.map((section) => (
        <Accordion key={section.title} title={section.title} open={open === section.title} onToggle={() => setOpen(open === section.title ? null : section.title)}>
          {section.items.map((item) => (
            <View key={item.q ?? item.body}>
              {item.q ? <Text style={styles.q}>{item.q}</Text> : null}
              <Text style={styles.a}>{item.body}</Text>
            </View>
          ))}
        </Accordion>
      ))}
    </View>
  );
}

export function FaqsScreen({ navigation }: NativeStackScreenProps<UserStack, "Faqs">) {
  return (
    <View style={styles.screen}>
      <PageTitle title="FAQs" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <SectionList sections={faqGroups} />
      </ScrollView>
    </View>
  );
}

export function PolicyScreen({ route, navigation }: NativeStackScreenProps<UserStack, "Policy">) {
  const terms = route.params.kind === "terms";
  return (
    <View style={styles.screen}>
      <PageTitle title={terms ? "Terms & Conditions" : "Privacy Policy"} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <SectionList sections={terms ? termsSections : privacySections} />
        <Text style={styles.updated}>Last updated 28 October 2026</Text>
      </ScrollView>
    </View>
  );
}

export function AboutScreen({ navigation }: NativeStackScreenProps<UserStack, "About">) {
  const version = Constants.expoConfig?.version ?? "1.0.0";
  return (
    <View style={styles.screen}>
      <PageTitle title="About Us" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.aboutHero}>
          <Image source={require("../../assets/hero-car.jpg")} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <LinearGradient colors={["rgba(18,6,13,0.1)", "rgba(18,6,13,0.75)", colors.night]} style={StyleSheet.absoluteFill} />
          <Text style={styles.aboutBrand}>ROVEYA</Text>
          <Text style={styles.aboutTag}>PREMIUM SEATS, CITY TO CITY</Text>
        </View>
        <Text style={styles.aboutHeading}>About our company</Text>
        <View style={styles.aboutCard}>
          <Text style={styles.aboutLead}>{aboutParagraphs[0]}</Text>
          {aboutParagraphs.slice(1).map((paragraph) => (
            <Text key={paragraph} style={styles.aboutText}>{paragraph}</Text>
          ))}
          <View style={styles.stats}>
            {[
              ["50+", "routes"],
              ["2,000+", "verified cars"],
              ["4.6★", "average rating"],
            ].map(([value, label]) => (
              <View key={label} style={styles.stat}>
                <Text style={styles.statValue}>{value}</Text>
                <Text style={styles.statLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </View>
        <Text style={styles.version}>App Version: {version}</Text>
      </ScrollView>
    </View>
  );
}

export function ContactScreen({ navigation }: NativeStackScreenProps<UserStack, "Contact">) {
  return (
    <View style={styles.screen}>
      <PageTitle title="Contact Us" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }} showsVerticalScrollIndicator={false}>
        <View style={styles.hours}>
          <Ionicons name="time-outline" size={16} color={colors.gold} />
          <Text style={styles.hoursText}>The ROVEYA desk is open every day, 5 AM to 11 PM.</Text>
        </View>
        {contactCards.map((card) => (
          <View key={card.title} style={styles.contactCard}>
            <Text style={styles.contactTitle}>{card.title}</Text>
            {card.lines.map((line) => (
              <Text key={line.label} style={styles.contactLine}>
                {line.label}:{" "}
                <Text style={styles.contactLink} onPress={() => (line.action === "help" ? navigation.navigate("Tabs", { screen: "Help" }) : line.link ? void Linking.openURL(line.link) : undefined)}>
                  {line.value}
                </Text>
              </Text>
            ))}
          </View>
        ))}
        <View style={styles.contactCard}>
          <Text style={styles.contactTitle}>Office Address</Text>
          {officeAddress.map((line) => (
            <Text key={line} style={styles.contactLine}>{line}</Text>
          ))}
          <Text style={styles.contactLine}>
            Phone: <Text style={styles.contactLink} onPress={() => void Linking.openURL("tel:+919000000001")}>+91 90000 00001</Text>
          </Text>
          <Text style={styles.contactLine}>
            Email: <Text style={styles.contactLink} onPress={() => void Linking.openURL("mailto:hello@roveya.com")}>hello@roveya.com</Text>
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  form: { borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 18 },
  formLine: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  formRow: { flexDirection: "row", alignItems: "center", gap: 10, height: 62 },
  formLabel: { color: colors.cream, fontFamily: type.regular, fontSize: 15 },
  formValue: { flex: 1, textAlign: "center", color: colors.gold, fontFamily: type.medium, fontSize: 15 },
  floating: { minHeight: 62, justifyContent: "center", paddingTop: 6 },
  floatLabel: { color: colors.faint, fontFamily: type.medium, fontSize: 11.5 },
  floatInput: { height: 38, color: colors.cream, fontFamily: type.regular, fontSize: 15.5 },
  message: { minHeight: 110, paddingTop: 16, color: colors.cream, fontFamily: type.regular, fontSize: 15.5, textAlignVertical: "top" },
  count: { alignSelf: "flex-end", paddingBottom: 10, color: colors.faint, fontFamily: type.regular, fontSize: 11 },
  failed: { marginHorizontal: 24, marginTop: 12, color: colors.danger, fontFamily: type.medium, fontSize: 13, textAlign: "center" },
  pick: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: 12, borderRadius: 14, marginBottom: 6, backgroundColor: colors.night, borderWidth: 1, borderColor: "transparent" },
  pickOn: { borderColor: colors.gold },
  pickText: { color: colors.cream, fontFamily: type.medium, fontSize: 15 },
  sent: { alignItems: "center", padding: 24, borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, marginTop: 10 },
  sentRing: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  sentTitle: { marginTop: 16, color: colors.cream, fontFamily: type.semibold, fontSize: 20 },
  sentLine: { marginTop: 6, textAlign: "center", color: colors.muted, fontFamily: type.regular, fontSize: 13.5, lineHeight: 20 },
  sheetCard: { margin: 12, padding: 12, gap: 10, borderRadius: 22, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.hairline },
  q: { color: colors.cream, fontFamily: type.semibold, fontSize: 14, marginBottom: 4 },
  a: { color: colors.muted, fontFamily: type.regular, fontSize: 13.5, lineHeight: 20 },
  updated: { textAlign: "center", color: colors.faint, fontFamily: type.regular, fontSize: 12 },
  aboutHero: { height: 170, justifyContent: "flex-end", alignItems: "center", paddingBottom: 18, overflow: "hidden" },
  aboutBrand: { color: colors.cream, fontFamily: type.semibold, fontSize: 26, letterSpacing: 8 },
  aboutTag: { marginTop: 4, color: colors.gold, fontFamily: type.semibold, fontSize: 10.5, letterSpacing: 2 },
  aboutHeading: { marginTop: 18, textAlign: "center", color: colors.cream, fontFamily: type.semibold, fontSize: 18 },
  aboutCard: { margin: 16, padding: 18, borderRadius: 20, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, gap: 12 },
  aboutLead: { textAlign: "center", color: colors.cream, fontFamily: type.medium, fontSize: 15, lineHeight: 22 },
  aboutText: { color: colors.muted, fontFamily: type.regular, fontSize: 14, lineHeight: 21 },
  stats: { flexDirection: "row", gap: 10, marginTop: 6 },
  stat: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 14, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line },
  statValue: { color: colors.gold, fontFamily: type.bold, fontSize: 18 },
  statLabel: { marginTop: 2, color: colors.muted, fontFamily: type.regular, fontSize: 11.5 },
  version: { textAlign: "center", color: colors.faint, fontFamily: type.regular, fontSize: 13 },
  hours: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 14, backgroundColor: "rgba(214,160,0,0.08)", borderWidth: 1, borderColor: colors.line },
  hoursText: { flex: 1, color: colors.cream, fontFamily: type.regular, fontSize: 13 },
  contactCard: { padding: 18, borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, gap: 8 },
  contactTitle: { color: colors.gold, fontFamily: type.semibold, fontSize: 19, marginBottom: 2 },
  contactLine: { color: colors.cream, fontFamily: type.regular, fontSize: 14.5, lineHeight: 21 },
  contactLink: { color: colors.goldBright, textDecorationLine: "underline" },
});
