import { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Linking, Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, live } from "../backend";
import { BannerCarousel } from "../components/BannerCarousel";
import { DeskTickets } from "../components/DeskTickets";
import { art, slide } from "../banners";
import { Chips, Empty, Group, ListRow, PageShell, Pill, SectionTitle, Toggle, page } from "../components/PageShell";
import { FlowCta, type FlowIcon } from "../components/StepShell";
import { DESK_LABEL, DESK_PHONE, MIN_REDEEM } from "../data";
import { confirmLogout } from "../sessionEpoch";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { CaptainStack } from "../navigation";

type Topic = "orders" | "pay" | "incentives" | "docs" | "account" | "safety";

const topics: { key: Topic; label: string; icon: FlowIcon }[] = [
  { key: "orders", label: "Rides", icon: "receipt-outline" },
  { key: "pay", label: "Wallet and payouts", icon: "wallet-outline" },
  { key: "incentives", label: "Incentives", icon: "trophy-outline" },
  { key: "docs", label: "Documents", icon: "document-text-outline" },
  { key: "account", label: "Account", icon: "person-outline" },
  { key: "safety", label: "Safety", icon: "shield-checkmark-outline" },
];

const faqs: { topic: Topic; q: string; a: string }[] = [
  { topic: "orders", q: "How do I get more ride requests?", a: "Stay on duty. A request is sent only when you are free. Rush hour does not change the fare." },
  { topic: "orders", q: "What happens if I miss a ride request?", a: "If you do not accept, the request moves on. Switch off duty when you take a break." },
  { topic: "orders", q: "How does the ride OTP work?", a: "The passenger sees a 4-digit OTP in the ROVEYA app. Ask for it at pickup and enter it to start the ride. The ride cannot start without it." },
  { topic: "orders", q: "The passenger is not at the pickup", a: "The call button reaches the desk. It does not show your number. After 3 free minutes a waiting charge can apply. You can cancel with the reason Passenger not at pickup." },
  { topic: "pay", q: "When can I redeem my wallet?", a: `On Monday and Thursday, from ${"₹"}${MIN_REDEEM}. The money reaches your bank account within 24 hours.` },
  { topic: "pay", q: "Where does cash go?", a: "Cash rides are paid to you directly by the passenger. Cash does not enter your wallet. Online fares do." },
  { topic: "incentives", q: "How does the day plan work?", a: "Pay the day fee before you go on duty. It is used only when you complete a trip. If you finish none, it moves to the next day. A month plan covers every day. Bike and auto plans do not mix." },
  { topic: "incentives", q: "Is there a rush-hour bonus?", a: "No. The passenger price stays the same in rush hour, rain, and at night. Pickup kilometres are not paid." },
  { topic: "docs", q: "How long does verification take?", a: "The desk check on this screen is 45 minutes. You can watch the captain training videos while you wait." },
  { topic: "docs", q: "My licence was renewed", a: "Open Profile, then Documents, and upload the new copy. It goes back to review." },
  { topic: "account", q: "How do I change my bank account?", a: "Open Profile, then Bank account, and tap Change bank account." },
  { topic: "account", q: "How do I change my vehicle?", a: "Call the captain desk with the new RC ready." },
  { topic: "safety", q: "What do I do in an emergency?", a: "Call the captain desk from Safety, or call 112. Your emergency contact is saved on your profile." },
];

export function HelpScreen({ navigation }: NativeStackScreenProps<CaptainStack, "Help">) {
  const [topic, setTopic] = useState<Topic | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const needle = query.trim().toLowerCase();
  const shown = faqs.filter((item) => (!topic || item.topic === topic) && (!needle || `${item.q} ${item.a}`.toLowerCase().includes(needle)));

  return (
    <PageShell kicker="SUPPORT" title="Help and support" onBack={() => navigation.goBack()}>
      <BannerCarousel
        style={{ marginBottom: 18 }}
        slides={[
          slide(art.auto, "CAPTAIN DESK", "A real person on the line, 5 AM to 11 PM", "Call now", () => void Linking.openURL(DESK_PHONE)),
          slide(art.ride, "ON THE ROAD", "Your emergency contact and the captain desk", "Safety", () => navigation.navigate("Safety")),
        ]}
      />
      <Text style={page.title}>How can we help, Captain?</Text>
      <View style={styles.search}>
        <Ionicons name="search" size={16} color={colors.gold} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search rides, payouts, documents…" placeholderTextColor={colors.faint} selectionColor={colors.gold} style={styles.searchInput} />
      </View>
      <SectionTitle>TOPICS</SectionTitle>
      <View style={styles.topics}>
        {topics.map((item) => {
          const on = topic === item.key;
          return (
            <Pressable key={item.key} onPress={() => setTopic(on ? null : item.key)} style={[styles.topic, on && styles.topicOn]}>
              <Ionicons name={item.icon} size={18} color={on ? colors.night : colors.gold} />
              <Text style={[styles.topicText, on && { color: colors.night }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <SectionTitle>{topic ? topics.find((item) => item.key === topic)?.label.toUpperCase() ?? "" : "COMMON QUESTIONS"}</SectionTitle>
      {shown.length ? (
        <Group>
          {shown.map((item, index) => {
            const expanded = open === item.q;
            return (
              <Pressable key={item.q} onPress={() => setOpen(expanded ? null : item.q)} style={[styles.faq, index < shown.length - 1 && styles.line]}>
                <View style={styles.faqHead}>
                  <Text style={[page.name, { flex: 1 }]}>{item.q}</Text>
                  <Ionicons name={expanded ? "remove" : "add"} size={18} color={colors.gold} />
                </View>
                {expanded ? <Text style={[page.lead, { marginTop: 8 }]}>{item.a}</Text> : null}
              </Pressable>
            );
          })}
        </Group>
      ) : (
        <Empty icon="search-outline" title="No answer found" line="Call the captain desk and we will sort it out." action="Call desk" onAction={() => void Linking.openURL(DESK_PHONE)} />
      )}
      <SectionTitle>TALK TO US</SectionTitle>
      <Group>
        <ListRow icon="call-outline" label="Call the captain desk" sub={`${DESK_LABEL} · Daily, 5:00 AM to 11:00 PM`} onPress={() => void Linking.openURL(DESK_PHONE)} />
        <ListRow icon="shield-checkmark-outline" label="Safety" sub="Emergency contact and the desk" last onPress={() => navigation.navigate("Safety")} />
      </Group>
      {live ? <WriteToDesk topic={topics.find((item) => item.key === topic)?.label ?? "General"} /> : null}
    </PageShell>
  );
}

function WriteToDesk({ topic }: { topic: string }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState("");
  const [refresh, setRefresh] = useState(0);
  const ready = message.trim().length >= 8 && !sending;

  const send = async () => {
    if (!ready) return;
    setSending(true);
    setNote("");
    try {
      const result = await api<{ ticket: { code: string } }>("/support/tickets", { body: { app: "captain", topic, message: message.trim() } });
      setMessage("");
      setNote(`Sent as ${result.ticket.code}. The desk replies here and on your phone.`);
      setRefresh((value) => value + 1);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "We could not send that. Try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <SectionTitle>WRITE TO THE DESK</SectionTitle>
      <View style={[page.card, { gap: 10 }]}>
        <Text style={page.small}>Topic · {topic}. Pick a topic above to change it.</Text>
        <TextInput
          value={message}
          onChangeText={(text) => setMessage(text.slice(0, 1000))}
          multiline
          placeholder="Tell us what happened, with the ride ID if you have it"
          placeholderTextColor={colors.faint}
          selectionColor={colors.gold}
          style={[page.input, { height: 110, paddingTop: 12, textAlignVertical: "top" }]}
        />
        <FlowCta label={sending ? "Sending…" : "Send to the desk"} icon="send" disabled={!ready} onPress={() => void send()} />
        {note ? <Text style={page.small}>{note}</Text> : null}
      </View>
      <DeskTickets app="captain" refresh={refresh} />
    </>
  );
}

const rules: { icon: FlowIcon; title: string; line: string }[] = [
  { icon: "keypad-outline", title: "Start only with the OTP", line: "Every ride starts after the passenger's 4-digit OTP matches." },
  { icon: "headset-outline", title: "Carry a spare helmet", line: "Bike captains offer a clean helmet to every passenger." },
  { icon: "speedometer-outline", title: "Ride within limits", line: "Follow speed limits and traffic signals on every ride." },
  { icon: "phone-portrait-outline", title: "Phone in the holder", line: "Mount the phone. Never hold it while riding." },
  { icon: "moon-outline", title: "Night rides", line: "Stay on lit main roads and share your trip after 10 PM." },
];

export function SafetyScreen({ navigation }: NativeStackScreenProps<CaptainStack, "Safety">) {
  const store = useStore();
  const captain = store.captain;
  const shareLocation = () => {
    void Share.share({ message: `I'm on duty as a ROVEYA captain${captain ? ` (${captain.vehicleNo})` : ""}. Captain desk ${DESK_LABEL}.` }).catch(() => undefined);
  };
  return (
    <PageShell kicker="SUPPORT" title="Safety" onBack={() => navigation.goBack()}>
      <LinearGradient colors={[colors.burgundy, colors.cherry, colors.inkwell]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={page.heroCard}>
        <Text style={page.kicker}>DESK</Text>
        <Text style={[page.title, { marginTop: 6 }]}>The captain desk is open.</Text>
        <Text style={[page.lead, { marginTop: 4 }]}>{DESK_LABEL}, daily 5:00 AM to 11:00 PM.</Text>
        <View style={styles.sosRow}>
          <Pressable accessibilityRole="button" onPress={() => void Linking.openURL(DESK_PHONE)} style={({ pressed }) => [styles.sos, pressed && { opacity: 0.9 }]}>
            <Ionicons name="call" size={18} color={colors.night} />
            <Text style={styles.sosText}>Call the desk</Text>
          </Pressable>
        </View>
      </LinearGradient>
      <SectionTitle>EMERGENCY CONTACT</SectionTitle>
      <Group>
        {captain ? (
          <ListRow icon="person-outline" label={captain.emergencyName} sub={`+91 ${captain.emergencyPhone.slice(0, 5)} ${captain.emergencyPhone.slice(5)}`} right={<Ionicons name="call" size={18} color={colors.gold} />} chevron={false} onPress={() => void Linking.openURL(`tel:+91${captain.emergencyPhone}`)} />
        ) : null}
        <ListRow icon="share-social-outline" label="Share my location" sub="Send it to someone you trust" onPress={shareLocation} />
        <ListRow icon="create-outline" label="Change emergency contact" sub="In personal details" last onPress={() => navigation.navigate("Personal")} />
      </Group>
      <SectionTitle>ON EVERY RIDE</SectionTitle>
      <Group>
        {rules.map((item, index) => (
          <ListRow key={item.title} icon={item.icon} label={item.title} sub={item.line} last={index === rules.length - 1} />
        ))}
      </Group>
    </PageShell>
  );
}

export function InsuranceScreen({ navigation }: NativeStackScreenProps<CaptainStack, "Insurance">) {
  return (
    <PageShell kicker="SUPPORT" title="Accident insurance" onBack={() => navigation.goBack()} footer={<FlowCta label="Call desk to raise a claim" icon="call" onPress={() => void Linking.openURL(DESK_PHONE)} />}>
      <LinearGradient colors={[colors.burgundy, colors.plum, colors.inkwell]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[page.heroCard, { alignItems: "center" }]}>
        <View style={styles.coverRing}>
          <View style={styles.coverDisc}>
            <Ionicons name="medkit" size={30} color={colors.night} />
          </View>
        </View>
        <Pill label="Active" tone="solid" />
        <Text style={[page.title, { marginTop: 10, textAlign: "center" }]}>Covered on every ride</Text>
        <Text style={[page.lead, { textAlign: "center", marginTop: 4 }]}>From the moment you accept a ride until it ends.</Text>
      </LinearGradient>
      <SectionTitle>WHAT IS COVERED</SectionTitle>
      <Group>
        <ListRow icon="bandage-outline" label="Hospital treatment" sub="Admission and treatment after an accident" chevron={false} />
        <ListRow icon="medical-outline" label="Doctor visits" sub="Outpatient care after an accident" chevron={false} />
        <ListRow icon="people-outline" label="Passenger on board" sub="Your passenger is covered on the same ride" last chevron={false} />
      </Group>
      <SectionTitle>HOW TO CLAIM</SectionTitle>
      <View style={page.card}>
        {["Call the captain desk and share the ride ID.", "Send the hospital bills and a photo of your licence.", "The desk tracks the claim and calls you with updates."].map((step, index) => (
          <View key={step} style={styles.step}>
            <View style={styles.stepNum}>
              <Text style={styles.stepNumText}>{index + 1}</Text>
            </View>
            <Text style={[page.lead, { flex: 1 }]}>{step}</Text>
          </View>
        ))}
      </View>
    </PageShell>
  );
}

export function ReferScreen({ navigation }: NativeStackScreenProps<CaptainStack, "Refer">) {
  const captain = useStore().captain;
  const [note, setNote] = useState("");
  const code = `CAPT-${(captain?.name.split(" ")[0] ?? "ROVEYA").toUpperCase().slice(0, 6)}${captain?.captainId.slice(-3) ?? ""}`;
  const share = async () => {
    const message = `Drive with ROVEYA and earn on your own time. Use my captain code ${code} when you sign up.`;
    try {
      const browser = Platform.OS === "web" && typeof navigator !== "undefined" ? navigator : null;
      if (browser && typeof browser.share !== "function") {
        await browser.clipboard?.writeText(message);
        setNote("Invite copied. Paste it in any chat.");
        return;
      }
      await Share.share({ message });
    } catch {
      setNote("Your code is ready to share.");
    }
  };
  return (
    <PageShell kicker="EARN MORE" title="Refer a captain" onBack={() => navigation.goBack()} footer={<FlowCta label="Share invite" icon="share-social" onPress={() => void share()} />}>
      <LinearGradient colors={[colors.burgundy, colors.plum, colors.inkwell]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={page.heroCard}>
        <Text style={page.kicker}>INVITE FRIENDS WHO DRIVE</Text>
        <Text style={[page.title, { marginTop: 6 }]}>Referral rewards are off.</Text>
        <Text style={[page.lead, { marginTop: 4 }]}>When your friend joins with your code and completes 20 rides in 30 days.</Text>
        <View style={styles.codeBox}>
          <Text style={styles.code}>{code}</Text>
          <Ionicons name="copy-outline" size={18} color={colors.gold} />
        </View>
        {note ? <Text style={[page.small, { marginTop: 8, color: colors.gold }]}>{note}</Text> : null}
      </LinearGradient>
      <SectionTitle>HOW IT WORKS</SectionTitle>
      <View style={page.card}>
        {["Share your code with a friend who has a bike, auto, or cab.", "They sign up, upload documents, and go on duty.", "A cash reward is not paid until the desk turns referrals on."].map((step, index) => (
          <View key={step} style={styles.step}>
            <View style={styles.stepNum}>
              <Text style={styles.stepNumText}>{index + 1}</Text>
            </View>
            <Text style={[page.lead, { flex: 1 }]}>{step}</Text>
          </View>
        ))}
      </View>
      <SectionTitle>YOUR REFERRALS</SectionTitle>
      <Empty icon="people-outline" title="No referrals yet" line="Friends who join with your code show up here with their progress." />
    </PageShell>
  );
}

export function SettingsScreen({ navigation }: NativeStackScreenProps<CaptainStack, "Settings">) {
  const store = useStore();
  const [confirmOut, setConfirmOut] = useState(false);
  const armed = useRef(false);
  useEffect(() => {
    if (!confirmOut) {
      armed.current = false;
      return;
    }
    const timer = setTimeout(() => {
      armed.current = false;
      setConfirmOut(false);
    }, 3500);
    return () => clearTimeout(timer);
  }, [confirmOut]);
  return (
    <PageShell kicker="SETTINGS" title="App settings" onBack={() => navigation.goBack()}>
      <SectionTitle first>RIDE REQUESTS</SectionTitle>
      <Group>
        <ListRow icon="flash-outline" label="Auto accept" sub="Accept new ride requests without tapping" chevron={false} right={<Toggle on={store.autoAccept} label="Auto accept" onChange={store.setAutoAccept} />} />
        <ListRow icon="volume-high-outline" label="Ride alert sound" sub="Ring when a new ride request arrives" chevron={false} right={<Toggle on={store.prefs.sound} label="Ride alert sound" onChange={(on) => store.setPref("sound", on)} />} />
        <ListRow icon="pulse-outline" label="Vibrate" sub="Buzz with every new ride request" last chevron={false} right={<Toggle on={store.prefs.vibrate} label="Vibrate" onChange={(on) => store.setPref("vibrate", on)} />} />
      </Group>
      <SectionTitle>NAVIGATION</SectionTitle>
      <View style={[page.card, { gap: 12 }]}>
        <Text style={page.small}>Open directions in</Text>
        <Chips items={[{ key: "google", label: "Google Maps" }, { key: "inapp", label: "ROVEYA map" }]} value={store.prefs.nav} onChange={(value) => store.setPref("nav", value)} />
      </View>
      <SectionTitle>SCREEN</SectionTitle>
      <Group>
        <ListRow icon="sunny-outline" label="Keep screen on" sub="While you are on duty" last chevron={false} right={<Toggle on={store.prefs.awake} label="Keep screen on" onChange={(on) => store.setPref("awake", on)} />} />
      </Group>
      <SectionTitle>MORE</SectionTitle>
      <Group>
        <ListRow icon="language-outline" label="Language" sub={store.prefs.language} onPress={() => navigation.navigate("Language")} />
        <ListRow icon="reader-outline" label="Terms and privacy" last onPress={() => navigation.navigate("Terms")} />
      </Group>
      <SectionTitle>ACCOUNT</SectionTitle>
      <Group>
        <ListRow
          icon="log-out-outline"
          label={confirmOut ? "Tap again to log out" : "Log out"}
          sub={store.captain ? `+91 ${store.captain.phone} · ${store.captain.captainId}` : undefined}
          last
          chevron={false}
          onPress={() => confirmLogout(armed, setConfirmOut, () => store.signOut())}
        />
      </Group>
    </PageShell>
  );
}

const languages = [
  { name: "English", native: "English", ready: true },
  { name: "Telugu", native: "తెలుగు", ready: false },
  { name: "Hindi", native: "हिन्दी", ready: false },
  { name: "Urdu", native: "اردو", ready: false },
];

export function LanguageScreen({ navigation }: NativeStackScreenProps<CaptainStack, "Language">) {
  const store = useStore();
  return (
    <PageShell kicker="SETTINGS" title="Language" onBack={() => navigation.goBack()}>
      <Text style={page.lead}>Pick the language for rides, earnings, and alerts.</Text>
      <View style={{ marginTop: 14, gap: 10 }}>
        {languages.map((lang) => {
          const on = store.prefs.language === lang.name;
          return (
            <Pressable key={lang.name} disabled={!lang.ready} onPress={() => store.setPref("language", lang.name)} style={[page.card, styles.lang, on && { borderColor: colors.gold }, !lang.ready && { opacity: 0.72 }]}>
              <View style={[styles.langMark, on && { backgroundColor: colors.gold, borderColor: colors.gold }]}>
                <Text style={[styles.langMarkText, on && { color: colors.night }]}>{lang.native.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.langNative}>{lang.native}</Text>
                <Text style={page.small}>{lang.name}</Text>
              </View>
              {lang.ready ? <View style={[styles.radio, on && styles.radioOn]}>{on ? <Ionicons name="checkmark" size={14} color={colors.night} /> : null}</View> : <Pill label="Coming soon" tone="muted" />}
            </Pressable>
          );
        })}
      </View>
    </PageShell>
  );
}

const terms = [
  { title: "Joining ROVEYA", body: "You must be 18 or older with a valid driving licence, vehicle RC, and ID. Joining is free." },
  { title: "Taking rides", body: "Go on duty when you like. Accept ride requests within 15 seconds, start rides only with the passenger's OTP, and follow traffic rules." },
  { title: "Earnings", body: "Cash and UPI fares are paid to you by the passenger. An online fare is recorded as yours in full. The day fee is charged once from your wallet the first time you go on duty that day. Redeem on Monday and Thursday from ₹100. A failed transfer comes back to the wallet." },
  { title: "Conduct", body: "Treat every passenger with respect. Ratings below 3 are reviewed by the captain desk." },
];

const privacy = [
  { title: "What we keep", body: "Your name, phone, date of birth, documents, vehicle, bank details, and ride history." },
  { title: "Why we use it", body: "To verify you, send you ride requests near your location while you are on duty, and pay you." },
  { title: "Who sees it", body: "Passengers see your first name, photo, rating, and vehicle for the ride you are on. Calls between you and passengers go through ROVEYA." },
  { title: "Your choices", body: "Edit your details in Profile. Call the captain desk to close your account." },
];

export function TermsScreen({ navigation }: NativeStackScreenProps<CaptainStack, "Terms">) {
  const [tab, setTab] = useState<"terms" | "privacy">("terms");
  const list = tab === "terms" ? terms : privacy;
  return (
    <PageShell kicker="CAPTAIN" title="Terms and privacy" onBack={() => navigation.goBack()}>
      <Chips items={[{ key: "terms", label: "Captain terms" }, { key: "privacy", label: "Privacy" }]} value={tab} onChange={setTab} />
      <Text style={[page.small, { marginTop: 14 }]}>Updated 21 Oct 2026</Text>
      <View style={{ marginTop: 10, gap: 10 }}>
        {list.map((item, index) => (
          <View key={item.title} style={page.card}>
            <View style={styles.termHead}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{index + 1}</Text>
              </View>
              <Text style={[page.name, { flex: 1 }]}>{item.title}</Text>
            </View>
            <Text style={[page.lead, { marginTop: 8 }]}>{item.body}</Text>
          </View>
        ))}
      </View>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  search: { marginTop: 14, flexDirection: "row", alignItems: "center", gap: 10, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: colors.gold, backgroundColor: colors.inkwell, paddingHorizontal: 16 },
  searchInput: { flex: 1, height: 50, color: colors.cream, fontFamily: type.label, fontSize: 15, paddingVertical: 0 },
  topics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  topic: { width: "48%", flexGrow: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  topicOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  topicText: { flex: 1, color: colors.cream, fontFamily: type.labelStrong, fontSize: 13.5 },
  faq: { paddingVertical: 14, paddingHorizontal: 14 },
  line: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  faqHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  sosRow: { marginTop: 16, flexDirection: "row", gap: 10 },
  sos: { flex: 1, height: 50, borderRadius: 16, backgroundColor: colors.gold, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  sosText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 16 },
  deskBtn: { flex: 1, height: 50, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: "rgba(18,6,13,0.45)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  deskBtnText: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 14.5 },
  coverRing: { width: 92, height: 92, borderRadius: 46, borderWidth: 1, borderColor: colors.gold, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  coverDisc: { width: 70, height: 70, borderRadius: 35, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  step: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 6 },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.gold, alignItems: "center", justifyContent: "center" },
  stepNumText: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 12 },
  codeBox: { marginTop: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: colors.gold, backgroundColor: "rgba(18,6,13,0.45)" },
  code: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 20, letterSpacing: 2 },
  lang: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  langMark: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, alignItems: "center", justifyContent: "center" },
  langMarkText: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 18 },
  langNative: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 16, textAlign: "left", writingDirection: "ltr" },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: "rgba(246,241,220,0.25)", alignItems: "center", justifyContent: "center" },
  radioOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  termHead: { flexDirection: "row", alignItems: "center", gap: 10 },
});
