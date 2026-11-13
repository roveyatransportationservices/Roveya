import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, live } from "../backend";
import { BannerCarousel } from "../components/BannerCarousel";
import { Field } from "../components/Field";
import { pickDocumentPhoto, uploadDocument } from "../documents";
import { docsFromServer, type ServerDocument } from "../remote";
import { art, slide } from "../banners";
import { Plate } from "../components/kit";
import { Group, Line, ListRow, PageShell, Pill, SectionTitle, Stars, Toggle, page } from "../components/PageShell";
import { FlowCta } from "../components/StepShell";
import { TabPage } from "../components/TabPage";
import { DESK_LABEL, DESK_PHONE, vehicleTitle } from "../data";
import { inr } from "../geo";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { CaptainStack, CaptainTabs } from "../navigation";
import type { DocKey, DocStatus } from "../types";
import { docInfo } from "./JoinScreens";
import { when } from "./EarningsScreens";

type Props = CompositeScreenProps<BottomTabScreenProps<CaptainTabs, "Account">, NativeStackScreenProps<CaptainStack>>;
type Icon = keyof typeof Ionicons.glyphMap;

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function average(list: { stars: number }[]) {
  return list.length ? list.reduce((sum, item) => sum + item.stars, 0) / list.length : 0;
}

export function ProfileScreen({ navigation }: Props) {
  const store = useStore();
  const captain = store.captain!;
  const [confirmOut, setConfirmOut] = useState(false);
  const rating = average(store.feedback);
  const orders = store.trips.filter((trip) => trip.status === "Completed").length;
  const joined = new Date(captain.joinedAt);
  const pending = Object.values(captain.docs).filter((status) => status !== "verified").length;

  useEffect(() => {
    if (!confirmOut) return;
    const timer = setTimeout(() => setConfirmOut(false), 3500);
    return () => clearTimeout(timer);
  }, [confirmOut]);

  const sections: { title: string; rows: { icon: Icon; label: string; sub?: string; badge?: string; right?: React.ReactNode; onPress?: () => void }[] }[] = [
    {
      title: "WORK",
      rows: [
        { icon: "receipt-outline", label: "Ride history", sub: "Completed, cancelled, and missed", badge: String(store.trips.length), onPress: () => navigation.navigate("Orders") },
        { icon: "star-outline", label: "Ratings and feedback", sub: `${rating.toFixed(2)} from ${store.feedback.length} passengers`, onPress: () => navigation.navigate("Ratings") },
        { icon: "flash-outline", label: "Auto accept", sub: store.autoAccept ? "On · ride requests are accepted for you" : "Off · you accept each ride request", right: <Toggle on={store.autoAccept} label="Auto accept" onChange={store.setAutoAccept} /> },
      ],
    },
    {
      title: "ACCOUNT",
      rows: [
        { icon: "person-circle-outline", label: "Personal details", sub: `${captain.city} · ${captain.email || "Add email"}`, onPress: () => navigation.navigate("Personal") },
        { icon: captain.vehicle === "bike" ? "bicycle-outline" : "car-outline", label: "Vehicle", sub: `${captain.vehicleModel} · ${captain.vehicleNo}`, onPress: () => navigation.navigate("Vehicle") },
        { icon: "document-text-outline", label: "Documents", sub: pending ? `${pending} awaiting check` : "All verified", badge: pending ? String(pending) : undefined, onPress: () => navigation.navigate("Documents") },
        { icon: "business-outline", label: "Bank account", sub: `••${captain.bankLast4} · ${captain.ifsc}`, onPress: () => navigation.navigate("Bank") },
      ],
    },
    {
      title: "EARN MORE",
      rows: [
        { icon: "person-add-outline", label: "Refer a captain", sub: "You both get ₹500 after 20 rides", onPress: () => navigation.navigate("Refer") },
        { icon: "trophy-outline", label: "Incentives", sub: "Daily, weekly, and peak hour bonus", onPress: () => navigation.navigate("Tabs", { screen: "Incentives" }) },
      ],
    },
    {
      title: "SUPPORT AND SAFETY",
      rows: [
        { icon: "help-buoy-outline", label: "Help and support", sub: "Rides, payouts, and documents", onPress: () => navigation.navigate("Help") },
        { icon: "shield-checkmark-outline", label: "Safety and SOS", sub: `Emergency contact · ${captain.emergencyName}`, onPress: () => navigation.navigate("Safety") },
        { icon: "medkit-outline", label: "Accident insurance", sub: "Active on every ride", onPress: () => navigation.navigate("Insurance") },
      ],
    },
    {
      title: "SETTINGS",
      rows: [
        { icon: "settings-outline", label: "App settings", sub: "Ride alert sound, navigation, screen", onPress: () => navigation.navigate("Settings") },
        { icon: "language-outline", label: "Language", sub: store.prefs.language, onPress: () => navigation.navigate("Language") },
        { icon: "reader-outline", label: "Terms and privacy", sub: "Captain terms", onPress: () => navigation.navigate("Terms") },
      ],
    },
  ];

  return (
    <TabPage kicker="PROFILE" title="Captain profile">
      <BannerCarousel
        style={{ marginBottom: 14 }}
        slides={[
          slide(art.cab, "REFER A CAPTAIN", "Bring a friend to ROVEYA. You both get ₹500", "Invite", () => navigation.navigate("Refer")),
          slide(art.ride, "SAFETY FIRST", "Spare helmet ready and OTP checked, every ride", "Safety", () => navigation.navigate("Safety")),
          slide(art.auto, "CAPTAIN DESK", "Real support, daily from 5 AM to 11 PM", "Get help", () => navigation.navigate("Help")),
        ]}
      />
      <LinearGradient colors={[colors.burgundy, colors.plum, colors.inkwell]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={page.heroCard}>
        <View style={styles.heroRow}>
          <View style={styles.ring}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(captain.name)}</Text>
            </View>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.name} numberOfLines={1}>{captain.name}</Text>
            <Text style={styles.phone}>+91 {captain.phone.slice(0, 5)} {captain.phone.slice(5)}</Text>
            <View style={styles.badges}>
              <View style={styles.verified}>
                <Ionicons name="shield-checkmark" size={11} color={colors.night} />
                <Text style={styles.verifiedText}>{vehicleTitle[captain.vehicle].toUpperCase()} CAPTAIN</Text>
              </View>
              <Text style={styles.id}>{captain.captainId}</Text>
            </View>
          </View>
          <Pressable accessibilityLabel="Edit profile" onPress={() => navigation.navigate("Personal")} style={styles.edit}>
            <Ionicons name="pencil" size={15} color={colors.gold} />
          </Pressable>
        </View>
        <View style={styles.vehicle}>
          <Ionicons name={captain.vehicle === "bike" ? "bicycle" : "car"} size={18} color={colors.gold} />
          <Text style={styles.vehicleText} numberOfLines={1}>{captain.vehicleModel} · {captain.vehicleColor}</Text>
          <Plate value={captain.vehicleNo} />
        </View>
        <View style={styles.stats}>
          <Stat value={rating ? rating.toFixed(2) : "New"} label="Rating" icon="star" onPress={() => navigation.navigate("Ratings")} />
          <View style={styles.statLine} />
          <Stat value={String(orders)} label="Rides" onPress={() => navigation.navigate("Orders")} />
          <View style={styles.statLine} />
          <Stat value={`${months[joined.getMonth()]} ${joined.getFullYear()}`} label="Captain since" onPress={() => navigation.navigate("Personal")} />
        </View>
      </LinearGradient>

      <View style={styles.quickRow}>
        <Pressable onPress={() => navigation.navigate("Tabs", { screen: "Wallet" })} style={({ pressed }) => [styles.quick, pressed && { borderColor: colors.gold }]}>
          <View style={styles.quickIcon}>
            <Ionicons name="wallet" size={18} color={colors.night} />
          </View>
          <Text style={styles.quickLabel}>WALLET</Text>
          <Text style={styles.quickValue}>{inr(store.wallet)}</Text>
          <Text style={page.small}>Redeem to bank</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate("Tabs", { screen: "Earnings" })} style={({ pressed }) => [styles.quick, pressed && { borderColor: colors.gold }]}>
          <View style={styles.quickIcon}>
            <Ionicons name="stats-chart" size={17} color={colors.night} />
          </View>
          <Text style={styles.quickLabel}>EARNINGS</Text>
          <Text style={styles.quickValue}>{orders} rides</Text>
          <Text style={page.small}>See today and week</Text>
        </Pressable>
      </View>

      {sections.map((section) => (
        <View key={section.title}>
          <SectionTitle>{section.title}</SectionTitle>
          <Group>
            {section.rows.map((row, index) => (
              <ListRow
                key={row.label}
                icon={row.icon}
                label={row.label}
                sub={row.sub}
                last={index === section.rows.length - 1}
                onPress={row.onPress}
                right={row.right ?? (row.badge ? <Pill label={row.badge} /> : undefined)}
              />
            ))}
          </Group>
        </View>
      ))}

      <Pressable onPress={() => void Linking.openURL(DESK_PHONE)} style={({ pressed }) => [styles.desk, pressed && { borderColor: colors.gold }]}>
        <Ionicons name="headset" size={18} color={colors.gold} />
        <View style={{ flex: 1 }}>
          <Text style={page.name}>Captain desk</Text>
          <Text style={page.small}>{DESK_LABEL} · Daily, 5:00 AM to 11:00 PM</Text>
        </View>
        <Text style={styles.call}>Call</Text>
      </Pressable>

      <Pressable onPress={() => (confirmOut ? store.signOut() : setConfirmOut(true))} style={({ pressed }) => [styles.logout, confirmOut && styles.logoutConfirm, pressed && { opacity: 0.9 }]}>
        <Ionicons name="log-out-outline" size={18} color={confirmOut ? colors.cream : colors.muted} />
        <Text style={[styles.logoutText, confirmOut && { color: colors.cream }]}>{confirmOut ? "Tap again to log out" : store.online ? "Log out · ends your duty" : "Log out"}</Text>
      </Pressable>

      <View style={styles.footer}>
        <View style={styles.footerRule} />
        <Text style={styles.footerBrand}>ROVEYA</Text>
        <Text style={page.small}>Captain app · Version 1.0.0</Text>
      </View>
    </TabPage>
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

export function PersonalScreen({ navigation }: NativeStackScreenProps<CaptainStack, "Personal">) {
  const store = useStore();
  const captain = store.captain!;
  const [name, setName] = useState(captain.name);
  const [email, setEmail] = useState(captain.email);
  const [emergencyName, setEmergencyName] = useState(captain.emergencyName);
  const [emergencyPhone, setEmergencyPhone] = useState(captain.emergencyPhone);
  const [saved, setSaved] = useState(false);
  const emailOk = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const valid = name.trim().length >= 3 && emailOk && emergencyName.trim().length >= 2 && /^[6-9]\d{9}$/.test(emergencyPhone);
  const dirty = name.trim() !== captain.name || email.trim() !== captain.email || emergencyName.trim() !== captain.emergencyName || emergencyPhone !== captain.emergencyPhone;

  const save = () => {
    store.updateCaptain({ name: name.trim(), email: email.trim(), emergencyName: emergencyName.trim(), emergencyPhone });
    setSaved(true);
    setTimeout(() => setSaved(false), 2400);
  };

  return (
    <PageShell kicker="ACCOUNT" title="Personal details" onBack={() => navigation.goBack()} footer={<FlowCta label={saved ? "Saved" : "Save changes"} icon="checkmark" disabled={!dirty || !valid} onPress={save} />}>
      <View style={[page.card, { gap: 14 }]}>
        <Field label="Full name" value={name} onChangeText={setName} autoCapitalize="words" hint="Must match your driving licence" />
        <View>
          <Text style={page.label}>Mobile number</Text>
          <View style={[page.input, styles.locked]}>
            <Text style={styles.lockedText}>+91 {captain.phone.slice(0, 5)} {captain.phone.slice(5)}</Text>
            <Pill label="Verified" />
          </View>
        </View>
        <Field label="Email" value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" error={!emailOk ? "Check the email format." : undefined} />
        <Line label="Date of birth" value={captain.dob} />
        <Line label="Gender" value={captain.gender} />
        <Line label="City" value={captain.city} />
        <Line label="Captain ID" value={captain.captainId} />
      </View>
      <SectionTitle>EMERGENCY CONTACT</SectionTitle>
      <View style={[page.card, { gap: 14 }]}>
        <Field label="Name" value={emergencyName} onChangeText={setEmergencyName} autoCapitalize="words" />
        <Field label="Mobile" prefix="+91" value={emergencyPhone} onChangeText={(text) => setEmergencyPhone(text.replace(/\D/g, "").slice(0, 10))} keyboardType="phone-pad" />
      </View>
      <View style={page.note}>
        <Ionicons name="lock-closed-outline" size={16} color={colors.gold} />
        <Text style={page.noteText}>Passengers see your first name, photo, rating, and vehicle only.</Text>
      </View>
    </PageShell>
  );
}

export function VehicleScreen({ navigation }: NativeStackScreenProps<CaptainStack, "Vehicle">) {
  const captain = useStore().captain!;
  return (
    <PageShell kicker="ACCOUNT" title="Vehicle" onBack={() => navigation.goBack()}>
      <LinearGradient colors={[colors.burgundy, colors.plum, colors.inkwell]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[page.heroCard, { alignItems: "center" }]}>
        <View style={styles.vehicleIcon}>
          <Ionicons name={captain.vehicle === "bike" ? "bicycle" : "car-sport"} size={34} color={colors.night} />
        </View>
        <Text style={[page.title, { marginTop: 12 }]}>{captain.vehicleModel}</Text>
        <Text style={page.lead}>{vehicleTitle[captain.vehicle]} · {captain.vehicleColor} · {captain.vehicleYear}</Text>
        <View style={{ marginTop: 12 }}>
          <Plate value={captain.vehicleNo} />
        </View>
      </LinearGradient>
      <SectionTitle>DETAILS</SectionTitle>
      <View style={page.card}>
        <Line label="Service" value={`${vehicleTitle[captain.vehicle]} captain`} />
        <Line label="Number plate" value={captain.vehicleNo} />
        <Line label="Make and model" value={captain.vehicleModel} />
        <Line label="Colour" value={captain.vehicleColor} />
        <Line label="Registration year" value={captain.vehicleYear} />
        <Line label="RC status" value={captain.docs.rc === "verified" ? "Verified" : "In review"} />
      </View>
      <SectionTitle>KEEP IT ROAD READY</SectionTitle>
      <Group>
        <ListRow icon="shield-outline" label="Vehicle insurance" sub="Keep a valid policy in the vehicle" chevron={false} />
        <ListRow icon="leaf-outline" label="Pollution certificate" sub="Renew the PUC before it expires" chevron={false} />
        <ListRow icon="swap-horizontal-outline" label="Change vehicle" sub="Call the captain desk with the new RC" last onPress={() => void Linking.openURL(DESK_PHONE)} />
      </Group>
    </PageShell>
  );
}

export function DocumentsScreen({ navigation }: NativeStackScreenProps<CaptainStack, "Documents">) {
  const store = useStore();
  const captain = store.captain!;
  const [busy, setBusy] = useState<DocKey | null>(null);
  const [error, setError] = useState("");
  const list = (Object.keys(docInfo) as DocKey[]).filter((doc) => live || captain.docs[doc] !== "missing" || doc === "aadhaar" || doc === "pan");
  const verified = list.filter((doc) => captain.docs[doc] === "verified").length;

  useEffect(() => {
    if (!live) return;
    void api<{ documents: ServerDocument[] }>("/captain/me")
      .then((result) => store.updateCaptain(docsFromServer(result.documents)))
      .catch(() => undefined);
  }, []);

  const replace = async (doc: DocKey) => {
    setError("");
    if (!live) {
      setBusy(doc);
      setTimeout(() => {
        store.setDoc(doc, "uploaded");
        setBusy(null);
      }, 1100);
      return;
    }
    try {
      const uri = await pickDocumentPhoto(doc);
      if (!uri) return;
      setBusy(doc);
      await uploadDocument(doc, uri);
      store.updateCaptain({ docs: { ...captain.docs, [doc]: "uploaded" }, docNotes: { ...captain.docNotes, [doc]: undefined } });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The photo did not upload. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const label: Record<DocStatus, string> = { verified: "Verified", uploaded: "In review", missing: "Add", rejected: "Upload again" };

  return (
    <PageShell kicker="ACCOUNT" title="Documents" onBack={() => navigation.goBack()}>
      <View style={[page.card, styles.docHero]}>
        <View style={styles.docRing}>
          <Text style={styles.docCount}>{verified}/{list.length}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={page.name}>{verified === list.length ? "All documents verified" : "Some documents are in review"}</Text>
          <Text style={page.small}>Keep them up to date to stay on duty.</Text>
        </View>
      </View>
      <View style={{ marginTop: 14, gap: 10 }}>
        {list.map((doc) => {
          const status = captain.docs[doc];
          return (
            <View key={doc} style={[page.card, styles.doc]}>
              <View style={[styles.docIcon, status === "verified" && styles.docIconOn]}>
                {busy === doc ? <ActivityIndicator size="small" color={colors.gold} /> : <Ionicons name={status === "verified" ? "checkmark" : docInfo[doc].icon} size={18} color={status === "verified" ? colors.night : colors.gold} />}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={page.name}>{docInfo[doc].title}</Text>
                <Text style={[page.small, status === "rejected" && { color: colors.goldBright }]}>{busy === doc ? "Uploading…" : status === "rejected" ? (captain.docNotes?.[doc] ?? "The desk needs a clearer photo") : docInfo[doc].line}</Text>
              </View>
              <Pressable onPress={() => void replace(doc)} disabled={busy !== null} hitSlop={6}>
                <Pill label={status === "missing" ? "Add" : label[status]} tone={status === "verified" ? "solid" : "gold"} />
              </Pressable>
            </View>
          );
        })}
      </View>
      <View style={page.note}>
        <Ionicons name="refresh-outline" size={16} color={colors.gold} />
        <Text style={page.noteText}>Tap a status to upload a fresh copy. A new copy goes back to review.</Text>
      </View>
      {error ? <Text style={[page.small, { marginTop: 10, color: colors.goldBright }]}>{error}</Text> : null}
    </PageShell>
  );
}

export function BankScreen({ navigation }: NativeStackScreenProps<CaptainStack, "Bank">) {
  const store = useStore();
  const captain = store.captain!;
  const [editing, setEditing] = useState(false);
  const [holder, setHolder] = useState(captain.bankHolder);
  const [account, setAccount] = useState("");
  const [ifsc, setIfsc] = useState(captain.ifsc);
  const [upi, setUpi] = useState(captain.upi);
  const valid = holder.trim().length >= 3 && /^\d{9,18}$/.test(account) && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc);

  const save = () => {
    store.updateCaptain({ bankHolder: holder.trim(), bankLast4: account.slice(-4), ifsc, upi: upi.trim() });
    setEditing(false);
    setAccount("");
  };

  return (
    <PageShell
      kicker="ACCOUNT"
      title="Bank account"
      onBack={() => (editing ? setEditing(false) : navigation.goBack())}
      footer={editing ? <FlowCta label="Save bank account" icon="checkmark" disabled={!valid} onPress={save} /> : <FlowCta label="Change bank account" icon="create-outline" onPress={() => setEditing(true)} />}
    >
      {editing ? (
        <View style={[page.card, { gap: 14 }]}>
          <Field label="Account holder name" value={holder} onChangeText={setHolder} autoCapitalize="words" />
          <Field label="New account number" value={account} onChangeText={(text) => setAccount(text.replace(/\D/g, "").slice(0, 18))} keyboardType="number-pad" secureTextEntry placeholder="9 to 18 digits" />
          <Field label="IFSC" value={ifsc} onChangeText={(text) => setIfsc(text.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11))} autoCapitalize="characters" />
          <Field label="UPI ID · optional" value={upi} onChangeText={setUpi} autoCapitalize="none" placeholder="name@bank" />
        </View>
      ) : (
        <>
          <LinearGradient colors={[colors.burgundy, colors.plum, colors.inkwell]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={page.heroCard}>
            <View style={styles.bankTop}>
              <Text style={page.kicker}>PAYOUT ACCOUNT</Text>
              <Ionicons name="business" size={20} color={colors.gold} />
            </View>
            <Text style={styles.bankNo}>•••• •••• {captain.bankLast4}</Text>
            <Text style={page.lead}>{captain.bankHolder}</Text>
            <View style={styles.bankMeta}>
              <Text style={styles.bankMetaText}>IFSC {captain.ifsc}</Text>
              {captain.upi ? <Text style={styles.bankMetaText}>UPI {captain.upi}</Text> : null}
            </View>
          </LinearGradient>
          <View style={page.note}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.gold} />
            <Text style={page.noteText}>Only the last 4 digits are shown on this phone.</Text>
          </View>
        </>
      )}
    </PageShell>
  );
}

const ratingTags = ["On time", "Safe riding", "Polite", "Clean vehicle", "Knows the route"];

export function RatingsScreen({ navigation }: NativeStackScreenProps<CaptainStack, "Ratings">) {
  const store = useStore();
  const avg = average(store.feedback);
  const counts = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: store.feedback.filter((item) => item.stars === stars).length }));
  const most = Math.max(1, ...counts.map((item) => item.count));
  return (
    <PageShell kicker="WORK" title="Ratings and feedback" onBack={() => navigation.goBack()}>
      <View style={[page.card, styles.ratingHero]}>
        <View style={{ alignItems: "center", width: 110 }}>
          <Text style={styles.ratingBig}>{avg ? avg.toFixed(2) : "—"}</Text>
          <Stars value={Math.round(avg)} size={14} />
          <Text style={[page.small, { marginTop: 4 }]}>{store.feedback.length} ratings</Text>
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          {counts.map((item) => (
            <View key={item.stars} style={styles.distRow}>
              <Text style={styles.distLabel}>{item.stars}</Text>
              <View style={styles.distTrack}>
                <View style={[styles.distFill, { width: `${(item.count / most) * 100}%` }]} />
              </View>
              <Text style={styles.distCount}>{item.count}</Text>
            </View>
          ))}
        </View>
      </View>
      <SectionTitle>PASSENGERS SAY YOU ARE</SectionTitle>
      <View style={styles.tags}>
        {ratingTags.map((tag) => {
          const count = store.feedback.filter((item) => item.tags.includes(tag)).length;
          return (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
              <Text style={styles.tagCount}>{count}</Text>
            </View>
          );
        })}
      </View>
      <SectionTitle>RECENT FEEDBACK</SectionTitle>
      <View style={{ gap: 10 }}>
        {[...store.feedback].sort((a, b) => b.at - a.at).slice(0, 10).map((item) => (
          <View key={item.id} style={page.card}>
            <View style={styles.feedHead}>
              <Text style={[page.name, { flex: 1 }]}>{item.customer}</Text>
              <Stars value={item.stars} />
            </View>
            <Text style={page.small}>{when(item.at)}</Text>
            {item.note ? <Text style={[page.lead, { marginTop: 8 }]}>{item.note}</Text> : null}
          </View>
        ))}
      </View>
      <View style={page.note}>
        <Ionicons name="trending-up-outline" size={16} color={colors.gold} />
        <Text style={page.noteText}>Reach pickups on time and keep the helmet ready to keep your rating above 4.8.</Text>
      </View>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  heroRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  ring: { width: 72, height: 72, borderRadius: 36, borderWidth: 1.5, borderColor: colors.gold, alignItems: "center", justifyContent: "center" },
  avatar: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.night, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 22, letterSpacing: 1 },
  name: { color: colors.cream, fontFamily: type.display, fontSize: 21, lineHeight: 26, letterSpacing: -0.3 },
  phone: { marginTop: 2, color: colors.muted, fontFamily: type.label, fontSize: 13.5 },
  badges: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  verified: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.gold, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 3 },
  verifiedText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 9.5, letterSpacing: 1.2 },
  id: { color: colors.faint, fontFamily: type.labelStrong, fontSize: 11, letterSpacing: 1 },
  edit: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.line, backgroundColor: "rgba(18,6,13,0.45)", alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  vehicle: { marginTop: 16, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 16, backgroundColor: "rgba(18,6,13,0.45)", borderWidth: 1, borderColor: colors.hairline },
  vehicleText: { flex: 1, color: colors.cream, fontFamily: type.labelStrong, fontSize: 14 },
  stats: { marginTop: 12, flexDirection: "row", alignItems: "center", paddingVertical: 12, borderRadius: 18, backgroundColor: "rgba(18,6,13,0.45)", borderWidth: 1, borderColor: colors.hairline },
  stat: { flex: 1, alignItems: "center" },
  statTop: { flexDirection: "row", alignItems: "center", gap: 4 },
  statValue: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 16 },
  statLabel: { marginTop: 2, color: colors.faint, fontFamily: type.label, fontSize: 11.5 },
  statLine: { width: 1, height: 28, backgroundColor: colors.line },
  quickRow: { marginTop: 12, flexDirection: "row", gap: 10 },
  quick: { flex: 1, padding: 14, borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  quickIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  quickLabel: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 9.5, letterSpacing: 1.8 },
  quickValue: { marginTop: 3, color: colors.cream, fontFamily: type.labelStrong, fontSize: 20 },
  desk: { marginTop: 24, flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  call: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 14 },
  logout: { marginTop: 12, height: 52, borderRadius: 18, borderWidth: 1, borderColor: colors.line, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  logoutConfirm: { backgroundColor: colors.burgundy, borderColor: colors.burgundy },
  logoutText: { color: colors.muted, fontFamily: type.labelStrong, fontSize: 15 },
  footer: { alignItems: "center", paddingTop: 26, gap: 4 },
  footerRule: { width: 36, height: 1.5, backgroundColor: colors.gold, marginBottom: 8 },
  footerBrand: { color: "rgba(246,241,220,0.32)", fontFamily: type.display, fontSize: 20, letterSpacing: 6 },
  locked: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.mist },
  lockedText: { color: colors.cream, fontFamily: type.label, fontSize: 15 },
  vehicleIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  docHero: { flexDirection: "row", alignItems: "center", gap: 14 },
  docRing: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: colors.gold, alignItems: "center", justifyContent: "center" },
  docCount: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 16 },
  doc: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  docIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  docIconOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  bankTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bankNo: { marginTop: 14, color: colors.cream, fontFamily: type.labelStrong, fontSize: 26, letterSpacing: 2 },
  bankMeta: { marginTop: 12, flexDirection: "row", gap: 14 },
  bankMetaText: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 12, letterSpacing: 0.8 },
  ratingHero: { flexDirection: "row", alignItems: "center", gap: 16 },
  ratingBig: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 40, lineHeight: 46 },
  distRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  distLabel: { width: 10, color: colors.muted, fontFamily: type.labelStrong, fontSize: 12 },
  distTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.night, overflow: "hidden" },
  distFill: { height: 6, borderRadius: 3, backgroundColor: colors.gold },
  distCount: { width: 18, textAlign: "right", color: colors.faint, fontFamily: type.label, fontSize: 12 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  tagText: { color: colors.cream, fontFamily: type.label, fontSize: 13 },
  tagCount: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 13 },
  feedHead: { flexDirection: "row", alignItems: "center", gap: 10 },
});
