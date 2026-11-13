import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Group, ListRow, PageShell, Pill, SectionTitle, Toggle, page } from "../components/PageShell";
import { FlowCta, FlowSum, type FlowIcon } from "../components/StepShell";
import { fallbackHere, places } from "../data";
import { hasPoint, resolvePlace, searchAddresses } from "../geocode";
import { inr } from "../geo";
import { REDEEM_COINS, REDEEM_VALUE } from "../lounge";
import { clock, shortDay } from "../pool";
import { useStore, type Prefs } from "../store";
import { colors, type } from "../theme";
import type { CustomerStack } from "../navigation";
import type { Place, WalletEntry } from "../types";

const quick = [100, 200, 500, 1000];
const MIN_TOPUP = 10;
const MAX_TOPUP = 10000;

function when(at: number) {
  const today = new Date();
  const date = new Date(at);
  const sameDay = date.toDateString() === today.toDateString();
  return `${sameDay ? "Today" : shortDay(at)}, ${clock(at)}`;
}

export function WalletScreen({ navigation }: NativeStackScreenProps<CustomerStack, "Wallet">) {
  const store = useStore();
  const [amount, setAmount] = useState(200);
  const [custom, setCustom] = useState("");
  const [focused, setFocused] = useState(false);
  const [note, setNote] = useState("");
  const typed = custom ? Number(custom) : amount;
  const valid = Number.isFinite(typed) && typed >= MIN_TOPUP && typed <= MAX_TOPUP;
  const coinValue = Math.floor(store.coins / REDEEM_COINS) * REDEEM_VALUE;
  const spent = store.walletLog.filter((entry) => entry.amount < 0).reduce((sum, entry) => sum - entry.amount, 0);

  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(""), 3200);
    return () => clearTimeout(timer);
  }, [note]);

  const add = () => {
    if (!valid) return;
    store.addWallet(typed);
    setNote(`${inr(typed)} added to your wallet.`);
    setCustom("");
  };

  return (
    <PageShell
      kicker="PAYMENTS"
      title="Wallet"
      onBack={() => navigation.goBack()}
      footer={
        <>
          <FlowSum value={valid ? inr(typed) : "—"} sub="To add" />
          <FlowCta label={valid ? `Add ${inr(typed)}` : `Enter ₹${MIN_TOPUP} to ₹${MAX_TOPUP.toLocaleString("en-IN")}`} icon="add" disabled={!valid} onPress={add} />
        </>
      }
    >
      <LinearGradient colors={[colors.burgundy, colors.plum, colors.inkwell]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={page.heroCard}>
        <View style={styles.heroTop}>
          <Text style={page.kicker}>ROVEYA WALLET</Text>
          <Ionicons name="wallet" size={22} color={colors.gold} />
        </View>
        <Text style={styles.balance}>{inr(store.wallet)}</Text>
        <Text style={page.lead}>Pay for rides, taxipool seats, and parcels in one tap.</Text>
        <View style={styles.heroStats}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroStatValue}>{inr(spent)}</Text>
            <Text style={page.small}>Paid with wallet</Text>
          </View>
          <View style={styles.heroLine} />
          <Pressable onPress={() => navigation.navigate("Tabs", { screen: "Lounge", params: { section: "rewards" } })} style={{ flex: 1, paddingLeft: 14 }}>
            <Text style={styles.heroStatValue}>{store.coins} coins</Text>
            <Text style={page.small}>{coinValue ? `Redeem for ${inr(coinValue)} ›` : `${REDEEM_COINS - store.coins} more for ₹${REDEEM_VALUE} ›`}</Text>
          </Pressable>
        </View>
      </LinearGradient>

      {note ? (
        <View style={[page.note, { borderColor: colors.gold }]}>
          <Ionicons name="checkmark-circle" size={18} color={colors.gold} />
          <Text style={[page.noteText, { color: colors.cream }]}>{note}</Text>
        </View>
      ) : null}

      <SectionTitle>ADD MONEY</SectionTitle>
      <View style={page.card}>
        <View style={styles.amounts}>
          {quick.map((value) => {
            const on = !custom && amount === value;
            return (
              <Pressable
                key={value}
                onPress={() => {
                  setAmount(value);
                  setCustom("");
                }}
                style={[styles.amount, on && styles.amountOn]}
              >
                <Text style={[styles.amountText, on && { color: colors.night }]}>{inr(value)}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[page.label, { marginTop: 14 }]}>Or enter an amount</Text>
        <View style={[styles.field, focused && page.inputFocus]}>
          <Text style={styles.rupee}>₹</Text>
          <TextInput
            value={custom}
            onChangeText={(text) => setCustom(text.replace(/[^0-9]/g, "").slice(0, 5))}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            keyboardType="number-pad"
            placeholder="500"
            placeholderTextColor={colors.faint}
            selectionColor={colors.gold}
            style={styles.fieldInput}
          />
        </View>
        <View style={styles.safeLine}>
          <Ionicons name="lock-closed" size={12} color={colors.gold} />
          <Text style={page.small}>Test mode top-up. Your bank stays untouched.</Text>
        </View>
      </View>

      <SectionTitle>HISTORY</SectionTitle>
      {store.walletLog.length ? (
        <Group>
          {store.walletLog.map((entry, index) => (
            <HistoryRow key={entry.id} entry={entry} last={index === store.walletLog.length - 1} />
          ))}
        </Group>
      ) : (
        <View style={[page.card, styles.noHistory]}>
          <Ionicons name="receipt-outline" size={20} color={colors.gold} />
          <Text style={[page.small, { flex: 1 }]}>Top-ups and wallet payments show here.</Text>
        </View>
      )}
    </PageShell>
  );
}

function HistoryRow({ entry, last }: { entry: WalletEntry; last: boolean }) {
  const credit = entry.amount > 0;
  const icon: FlowIcon = entry.label.startsWith("Ride") ? "bicycle-outline" : entry.label.startsWith("Taxipool") ? "people-outline" : entry.label.startsWith("Parcel") ? "cube-outline" : credit ? "arrow-down" : "arrow-up";
  return (
    <View style={[styles.history, !last && styles.historyLine]}>
      <View style={[styles.historyIcon, credit && styles.historyIconIn]}>
        <Ionicons name={icon} size={16} color={credit ? colors.night : colors.gold} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={page.name} numberOfLines={1}>{entry.label}</Text>
        <Text style={page.small}>{when(entry.at)}</Text>
      </View>
      <Text style={[styles.historyAmount, credit && { color: colors.gold }]}>
        {credit ? "+" : "−"}
        {inr(Math.abs(entry.amount))}
      </Text>
    </View>
  );
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function PersonalScreen({ navigation }: NativeStackScreenProps<CustomerStack, "Personal">) {
  const store = useStore();
  const session = store.session;
  const [name, setName] = useState(session?.name ?? "");
  const [email, setEmail] = useState(session?.email ?? "");
  const [focus, setFocus] = useState<"name" | "email" | null>(null);
  const [saved, setSaved] = useState(false);
  const phone = session?.phone ?? "";
  const nameOk = name.trim().length >= 2;
  const emailOk = !email.trim() || emailPattern.test(email.trim());
  const dirty = name.trim() !== (session?.name ?? "").trim() || email.trim() !== (session?.email ?? "");

  const save = () => {
    if (!nameOk || !emailOk) return;
    store.updateProfile({ name: name.trim(), email: email.trim() || undefined });
    setSaved(true);
    setTimeout(() => setSaved(false), 2600);
  };

  return (
    <PageShell
      kicker="ACCOUNT"
      title="Personal details"
      onBack={() => navigation.goBack()}
      footer={<FlowCta label={saved ? "Saved" : "Save changes"} icon="checkmark" disabled={!dirty || !nameOk || !emailOk} onPress={save} />}
    >
      <View style={styles.avatarWrap}>
        <View style={styles.ring}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(name) || "R"}</Text>
          </View>
        </View>
        <Text style={[page.title, { marginTop: 12 }]}>{name.trim() || "Your name"}</Text>
        <View style={styles.verified}>
          <Ionicons name="shield-checkmark" size={11} color={colors.night} />
          <Text style={styles.verifiedText}>VERIFIED RIDER</Text>
        </View>
      </View>

      {saved ? (
        <View style={[page.note, { borderColor: colors.gold, marginBottom: 6 }]}>
          <Ionicons name="checkmark-circle" size={18} color={colors.gold} />
          <Text style={[page.noteText, { color: colors.cream }]}>Your details are saved.</Text>
        </View>
      ) : null}

      <View style={[page.card, { gap: 16, marginTop: 10 }]}>
        <View>
          <Text style={page.label}>Full name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            onFocus={() => setFocus("name")}
            onBlur={() => setFocus(null)}
            placeholder="Your name"
            placeholderTextColor={colors.faint}
            selectionColor={colors.gold}
            autoCapitalize="words"
            style={[page.input, focus === "name" && page.inputFocus]}
          />
          {!nameOk ? <Text style={styles.error}>Enter at least 2 letters.</Text> : null}
        </View>
        <View>
          <Text style={page.label}>Mobile number</Text>
          <View style={[page.input, styles.locked]}>
            <Text style={styles.lockedText}>+91 {phone.slice(0, 5)} {phone.slice(5)}</Text>
            <Pill label="Verified" />
          </View>
          <Text style={page.small}>To use a new number, log out and sign in with it.</Text>
        </View>
        <View>
          <Text style={page.label}>Email · for receipts</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            onFocus={() => setFocus("email")}
            onBlur={() => setFocus(null)}
            placeholder="name@example.com"
            placeholderTextColor={colors.faint}
            selectionColor={colors.gold}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={[page.input, focus === "email" && page.inputFocus]}
          />
          {!emailOk ? <Text style={styles.error}>Check the email format.</Text> : null}
        </View>
      </View>

      <View style={page.note}>
        <Ionicons name="lock-closed-outline" size={16} color={colors.gold} />
        <Text style={page.noteText}>Your number is used to sign in, share trip codes, and reach you about a booking.</Text>
      </View>
    </PageShell>
  );
}

type Slot = "home" | "work";

export function PlacesScreen({ navigation }: NativeStackScreenProps<CustomerStack, "Places">) {
  const store = useStore();
  const [editing, setEditing] = useState<Slot | null>(null);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const needle = query.trim().toLowerCase();
  const near = store.pickup ?? fallbackHere;

  const known = [...store.recentDrops, ...store.recentPickups, ...places].filter((place, index, all) => place.id !== "gps" && all.findIndex((item) => item.name === place.name) === index);
  const local = needle ? known.filter((place) => `${place.name} ${place.subtitle}`.toLowerCase().includes(needle)) : known.slice(0, 8);
  const localNames = new Set(local.map((place) => place.name.toLowerCase()));
  const options = [...local, ...remote.filter((place) => !localNames.has(place.name.toLowerCase()))];

  useEffect(() => {
    if (needle.length < 3) {
      setRemote([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchAddresses(query.trim(), near, controller.signal)
        .then(setRemote)
        .catch(() => undefined)
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [needle]);

  const choose = async (picked: Place) => {
    const place = hasPoint(picked) ? picked : await resolvePlace(picked).catch(() => null);
    if (!place) return;
    if (editing === "home") store.setHome(place);
    if (editing === "work") store.setWork(place);
    setEditing(null);
    setQuery("");
  };

  const slots: { key: Slot; label: string; icon: FlowIcon; place: Place | null; clear: () => void }[] = [
    { key: "home", label: "Home", icon: "home", place: store.home, clear: () => store.setHome(null) },
    { key: "work", label: "Work", icon: "briefcase", place: store.work, clear: () => store.setWork(null) },
  ];

  return (
    <PageShell kicker="ACCOUNT" title="Saved places" onBack={() => (editing ? setEditing(null) : navigation.goBack())}>
      <Text style={page.lead}>Saved places sit at the top of your search, one tap away.</Text>
      <View style={{ marginTop: 14, gap: 12 }}>
        {slots.map((slot) => {
          const open = editing === slot.key;
          return (
            <View key={slot.key} style={[page.card, open && { borderColor: colors.gold }]}>
              <View style={styles.slotRow}>
                <View style={[styles.slotIcon, slot.place && styles.slotIconOn]}>
                  <Ionicons name={slot.place ? slot.icon : (`${slot.icon}-outline` as FlowIcon)} size={18} color={slot.place ? colors.night : colors.gold} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={page.kicker}>{slot.label.toUpperCase()}</Text>
                  <Text style={page.name} numberOfLines={1}>{slot.place?.name ?? `Add ${slot.label.toLowerCase()}`}</Text>
                  <Text style={page.small} numberOfLines={1}>{slot.place?.subtitle ?? "Not set"}</Text>
                </View>
              </View>
              <View style={page.actions}>
                <Pressable
                  onPress={() => {
                    setEditing(open ? null : slot.key);
                    setQuery("");
                  }}
                  style={({ pressed }) => [page.action, (pressed || open) && { borderColor: colors.gold }]}
                >
                  <Ionicons name={open ? "close" : slot.place ? "create-outline" : "add"} size={15} color={colors.gold} />
                  <Text style={page.actionText}>{open ? "Close" : slot.place ? "Change" : `Add ${slot.label.toLowerCase()}`}</Text>
                </Pressable>
                {slot.place && !open ? (
                  <Pressable onPress={slot.clear} style={({ pressed }) => [page.action, pressed && { borderColor: colors.gold }]}>
                    <Ionicons name="trash-outline" size={15} color={colors.muted} />
                    <Text style={[page.actionText, { color: colors.muted }]}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>

              {open ? (
                <View style={{ marginTop: 14 }}>
                  <View style={styles.search}>
                    <Ionicons name="search" size={16} color={colors.gold} />
                    <TextInput
                      autoFocus
                      value={query}
                      onChangeText={setQuery}
                      placeholder={`Search ${slot.label.toLowerCase()} address`}
                      placeholderTextColor={colors.faint}
                      selectionColor={colors.gold}
                      autoCorrect={false}
                      style={styles.searchInput}
                    />
                    {searching ? <ActivityIndicator size="small" color={colors.gold} /> : null}
                  </View>
                  <Text style={[page.kicker, { marginTop: 14, marginBottom: 6 }]}>{needle ? "RESULTS" : "SUGGESTED"}</Text>
                  {options.length ? (
                    options.map((place, index) => (
                      <Pressable key={`${place.id}-${index}`} onPress={() => choose(place)} style={({ pressed }) => [styles.option, index < options.length - 1 && styles.historyLine, pressed && { backgroundColor: colors.mist }]}>
                        <Ionicons name="location-outline" size={16} color={colors.gold} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={page.name} numberOfLines={1}>{place.name}</Text>
                          <Text style={page.small} numberOfLines={1}>{place.subtitle}</Text>
                        </View>
                      </Pressable>
                    ))
                  ) : (
                    <Text style={page.small}>{searching ? "Searching…" : `No match for "${query.trim()}". Try a nearby landmark.`}</Text>
                  )}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </PageShell>
  );
}

const notificationRows: { key: keyof Prefs; icon: FlowIcon; label: string; sub: string; group: string }[] = [
  { key: "codes", icon: "keypad-outline", label: "Booking codes by SMS", sub: "Ride OTP, boarding, and parcel codes", group: "TRIPS" },
  { key: "pool", icon: "people-outline", label: "Taxipool reminders", sub: "The evening before you travel", group: "PLANS" },
  { key: "parcel", icon: "cube-outline", label: "Parcel updates", sub: "Pickup and delivery alerts", group: "PLANS" },
  { key: "offers", icon: "pricetag-outline", label: "Offers and rewards", sub: "Coupons, scratch cards, and coins", group: "OFFERS" },
  { key: "trivia", icon: "sparkles-outline", label: "Daily trivia", sub: "A nudge when today's quiz opens", group: "OFFERS" },
];

export function NotificationsScreen({ navigation }: NativeStackScreenProps<CustomerStack, "Notifications">) {
  const store = useStore();
  const groups = ["TRIPS", "PLANS", "OFFERS"];
  const onCount = Object.values(store.prefs).filter(Boolean).length + 1;
  return (
    <PageShell kicker="ACCOUNT" title="Notifications" onBack={() => navigation.goBack()}>
      <View style={[page.card, styles.notifyHero]}>
        <View style={styles.bell}>
          <Ionicons name="notifications" size={22} color={colors.night} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={page.name}>{onCount} of {notificationRows.length + 1} alerts on</Text>
          <Text style={page.small}>Choose what reaches this phone.</Text>
        </View>
      </View>
      {groups.map((group) => (
        <View key={group}>
          <SectionTitle>{group}</SectionTitle>
          <Group>
            {group === "TRIPS" ? (
              <ListRow icon="navigate-outline" label="Ride updates" sub="Captain assigned, arriving, and drop alerts · always on for safety" right={<Toggle on locked label="Ride updates" />} chevron={false} />
            ) : null}
            {notificationRows
              .filter((row) => row.group === group)
              .map((row, index, all) => (
                <ListRow
                  key={row.key}
                  icon={row.icon}
                  label={row.label}
                  sub={row.sub}
                  last={index === all.length - 1}
                  chevron={false}
                  right={<Toggle on={store.prefs[row.key]} label={row.label} onChange={(next) => store.setPref(row.key, next)} />}
                />
              ))}
          </Group>
        </View>
      ))}
    </PageShell>
  );
}

const languages = [
  { id: "en", name: "English", native: "English", ready: true },
  { id: "te", name: "Telugu", native: "తెలుగు", ready: false },
  { id: "hi", name: "Hindi", native: "हिन्दी", ready: false },
  { id: "ur", name: "Urdu", native: "اردو", ready: false },
];

export function LanguageScreen({ navigation }: NativeStackScreenProps<CustomerStack, "Language">) {
  return (
    <PageShell kicker="ACCOUNT" title="Language" onBack={() => navigation.goBack()}>
      <Text style={page.lead}>Pick the language for menus, receipts, and alerts.</Text>
      <View style={{ marginTop: 14, gap: 10 }}>
        {languages.map((lang) => {
          const on = lang.id === "en";
          return (
            <View key={lang.id} style={[page.card, styles.lang, on && { borderColor: colors.gold }, !lang.ready && { opacity: 0.72 }]}>
              <View style={[styles.langMark, on && { backgroundColor: colors.gold, borderColor: colors.gold }]}>
                <Text style={[styles.langMarkText, on && { color: colors.night }]}>{lang.native.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.langNative}>{lang.native}</Text>
                <Text style={page.small}>{lang.name}</Text>
              </View>
              {lang.ready ? (
                <View style={[styles.radio, on && styles.radioOn]}>{on ? <Ionicons name="checkmark" size={14} color={colors.night} /> : null}</View>
              ) : (
                <Pill label="Coming soon" tone="muted" />
              )}
            </View>
          );
        })}
      </View>
      <View style={page.note}>
        <Ionicons name="language-outline" size={16} color={colors.gold} />
        <Text style={page.noteText}>English is the app language today. Telugu, Hindi, and Urdu are on the way.</Text>
      </View>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  balance: { marginTop: 8, color: colors.cream, fontFamily: type.labelStrong, fontSize: 40, lineHeight: 46 },
  heroStats: { marginTop: 16, flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 18, backgroundColor: "rgba(18,6,13,0.45)", borderWidth: 1, borderColor: colors.hairline },
  heroStatValue: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15 },
  heroLine: { width: 1, height: 30, backgroundColor: colors.line },
  amounts: { flexDirection: "row", gap: 8 },
  amount: { flex: 1, height: 46, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, alignItems: "center", justifyContent: "center" },
  amountOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  amountText: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 14.5 },
  field: { flexDirection: "row", alignItems: "center", gap: 8, height: 52, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, paddingHorizontal: 14 },
  rupee: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 18 },
  fieldInput: { flex: 1, height: 50, color: colors.cream, fontFamily: type.labelStrong, fontSize: 18, paddingVertical: 0 },
  safeLine: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 6 },
  history: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  historyLine: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  historyIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  historyIconIn: { backgroundColor: colors.gold, borderColor: colors.gold },
  noHistory: { flexDirection: "row", alignItems: "center", gap: 12 },
  historyAmount: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15 },
  avatarWrap: { alignItems: "center", paddingTop: 4, paddingBottom: 8 },
  ring: { width: 96, height: 96, borderRadius: 48, borderWidth: 1.5, borderColor: colors.gold, alignItems: "center", justifyContent: "center" },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.plum, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 30, letterSpacing: 1 },
  verified: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.gold, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3 },
  verifiedText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 9.5, letterSpacing: 1.2 },
  error: { marginTop: 6, color: colors.goldBright, fontFamily: type.label, fontSize: 12 },
  locked: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6, backgroundColor: colors.mist },
  lockedText: { color: colors.cream, fontFamily: type.label, fontSize: 15 },
  slotRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  slotIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  slotIconOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  search: { flexDirection: "row", alignItems: "center", gap: 10, height: 48, borderRadius: 24, borderWidth: 1.5, borderColor: colors.gold, backgroundColor: colors.night, paddingHorizontal: 14 },
  searchInput: { flex: 1, height: 46, color: colors.cream, fontFamily: type.label, fontSize: 15, paddingVertical: 0 },
  option: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, paddingHorizontal: 4, borderRadius: 10 },
  notifyHero: { flexDirection: "row", alignItems: "center", gap: 14 },
  bell: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  lang: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  langMark: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, alignItems: "center", justifyContent: "center" },
  langMarkText: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 18 },
  langNative: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 16, textAlign: "left", writingDirection: "ltr" },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: "rgba(246,241,220,0.25)", alignItems: "center", justifyContent: "center" },
  radioOn: { backgroundColor: colors.gold, borderColor: colors.gold },
});
