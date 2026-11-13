import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Linking, Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, live } from "../backend";
import { DeskTickets } from "../components/DeskTickets";
import { Logo } from "../components/Logo";
import { Chips, Empty, Group, ListRow, PageShell, Pill, RoutePair, SectionTitle, page } from "../components/PageShell";
import { DESK_PHONE, FlowCta, FlowGhost, type FlowIcon } from "../components/StepShell";
import { shortDay, clock } from "../pool";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { CustomerStack } from "../navigation";

const DESK_LABEL = "+91 90000 00001";
const OPENS = 5;
const CLOSES = 23;

function deskOpen(now = new Date()) {
  const hour = now.getHours();
  return hour >= OPENS && hour < CLOSES;
}

type Topic = "rides" | "pay" | "pool" | "parcel" | "account" | "safety";

const topics: { key: Topic; label: string; icon: FlowIcon }[] = [
  { key: "rides", label: "Rides and fares", icon: "bicycle-outline" },
  { key: "pay", label: "Payments", icon: "wallet-outline" },
  { key: "pool", label: "Taxipool", icon: "people-outline" },
  { key: "parcel", label: "Parcels", icon: "cube-outline" },
  { key: "account", label: "Account", icon: "person-outline" },
  { key: "safety", label: "Safety", icon: "shield-checkmark-outline" },
];

const faqs: { topic: Topic; q: string; a: string }[] = [
  { topic: "rides", q: "How is my fare worked out?", a: "Every ride has a base fare plus a per-km rate. Bike starts at ₹35, auto at ₹60, and cab at ₹90. You see the full fare before you book." },
  { topic: "rides", q: "Can I cancel a ride?", a: "Yes. Cancel from the trip screen any time before pickup. Cancelling before pickup is free." },
  { topic: "rides", q: "What is the ride OTP?", a: "A 4-digit code on your trip screen. Share it with your captain when you board. The ride starts once the code matches." },
  { topic: "rides", q: "I left something in the vehicle", a: "Open the ride in My rides, tap Get help, and pick Lost item. The ROVEYA desk reaches your captain for you." },
  { topic: "pay", q: "How do I pay?", a: "Pay your captain in cash, or pay from your ROVEYA wallet at the end of the ride." },
  { topic: "pay", q: "How do I add money to my wallet?", a: "Open Wallet, pick an amount or type your own, then tap Add." },
  { topic: "pay", q: "How do coins work?", a: "Earn coins from trip trivia and scratch cards. Every 100 coins turn into ₹10 in your wallet from the Lounge." },
  { topic: "pool", q: "Where do I board a taxipool?", a: "Every city has a fixed boarding point. It is on your booking with the departure time." },
  { topic: "pool", q: "What is the boarding code?", a: "A 4-digit code on your taxipool booking. Show it to your captain at boarding." },
  { topic: "parcel", q: "What can I send?", a: "Documents, food, clothes, electronics, keys, medicines, and other everyday items. Seal every box or bag before pickup." },
  { topic: "parcel", q: "How do parcel codes work?", a: "The sender shares the pickup code at handover. The receiver shares the delivery code when the parcel arrives." },
  { topic: "account", q: "How do I change my name or email?", a: "Go to Profile, then Personal details. Edit and tap Save changes." },
  { topic: "account", q: "How do I change my phone number?", a: "Log out, then sign in with the new number." },
  { topic: "safety", q: "What do I do in an emergency?", a: "Tap SOS on the trip screen or call 112. The ROVEYA desk is on +91 90000 00001, daily 5:00 AM to 11:00 PM." },
  { topic: "safety", q: "How do I share my trip?", a: "Tap Share trip on the trip screen. Add trusted contacts in Safety so they are ready." },
];

export function SupportScreen({ navigation }: NativeStackScreenProps<CustomerStack, "Support">) {
  const store = useStore();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const last = store.rides.find((ride) => ride.status === "Completed");
  const needle = query.trim().toLowerCase();
  const shown = faqs.filter((item) => (!topic || item.topic === topic) && (!needle || `${item.q} ${item.a}`.toLowerCase().includes(needle)));

  return (
    <PageShell kicker="SUPPORT" title="Help" onBack={() => navigation.goBack()}>
      <Text style={page.title}>How can we help?</Text>
      <View style={styles.search}>
        <Ionicons name="search" size={16} color={colors.gold} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search fares, refunds, codes…" placeholderTextColor={colors.faint} selectionColor={colors.gold} style={styles.searchInput} />
        {query ? (
          <Pressable accessibilityLabel="Clear" hitSlop={10} onPress={() => setQuery("")}>
            <Ionicons name="close-circle" size={18} color={colors.faint} />
          </Pressable>
        ) : null}
      </View>

      {last && !needle ? (
        <>
          <SectionTitle>YOUR LAST RIDE</SectionTitle>
          <Pressable onPress={() => navigation.navigate("Receipt", { id: last.id })} style={({ pressed }) => [page.card, pressed && { borderColor: colors.gold }]}>
            <View style={styles.lastHead}>
              <Text style={page.name}>{last.when}</Text>
              <Text style={page.gold}>₹{last.fare}</Text>
            </View>
            <View style={{ marginTop: 10 }}>
              <RoutePair from={last.pickup} to={last.drop} />
            </View>
            <View style={page.actions}>
              <Pressable onPress={() => navigation.navigate("Claims", { rideId: last.id })} style={({ pressed }) => [page.action, pressed && { borderColor: colors.gold }]}>
                <Ionicons name="help-buoy-outline" size={15} color={colors.gold} />
                <Text style={page.actionText}>Get help with this ride</Text>
              </Pressable>
            </View>
          </Pressable>
        </>
      ) : null}

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

      <SectionTitle>{topic ? topics.find((item) => item.key === topic)?.label.toUpperCase() ?? "QUESTIONS" : "COMMON QUESTIONS"}</SectionTitle>
      {shown.length ? (
        <Group>
          {shown.map((item, index) => {
            const expanded = open === item.q;
            return (
              <Pressable key={item.q} onPress={() => setOpen(expanded ? null : item.q)} style={[styles.faq, index < shown.length - 1 && styles.faqLine]}>
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
        <Empty icon="search-outline" title="No answer found" line="Call the ROVEYA desk and we will sort it out with you." action="Call desk" onAction={() => void Linking.openURL(DESK_PHONE)} />
      )}

      <SectionTitle>STILL NEED HELP?</SectionTitle>
      <Group>
        <ListRow icon="call-outline" label="Call the ROVEYA desk" sub={`${DESK_LABEL} · Daily, 5:00 AM to 11:00 PM`} onPress={() => navigation.navigate("Desk")} />
        <ListRow icon="document-text-outline" label="Raise a claim" sub="Fare, lost item, or refund" onPress={() => navigation.navigate("Claims")} />
        <ListRow icon="shield-checkmark-outline" label="Safety centre" sub="SOS and trusted contacts" last onPress={() => navigation.navigate("Safety")} />
      </Group>
    </PageShell>
  );
}

const promises: { icon: FlowIcon; title: string; line: string }[] = [
  { icon: "id-card-outline", title: "Verified captains", line: "ID, licence, and vehicle papers checked before the first ride." },
  { icon: "keypad-outline", title: "Ride OTP", line: "Your ride starts only after your 4-digit code matches." },
  { icon: "navigate-outline", title: "Live tracking", line: "Watch your captain on the map from pickup to drop." },
  { icon: "share-social-outline", title: "Share your trip", line: "Send the captain, plate, and route to anyone you trust." },
  { icon: "headset-outline", title: "ROVEYA desk", line: "A real person on the line daily, 5:00 AM to 11:00 PM." },
];

export function SafetyScreen({ navigation }: NativeStackScreenProps<CustomerStack, "Safety">) {
  const store = useStore();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const valid = name.trim().length >= 2 && /^[6-9]\d{9}$/.test(phone);
  const trip = store.trip;

  const save = () => {
    if (!valid) return;
    store.addContact({ name: name.trim(), phone });
    setName("");
    setPhone("");
    setAdding(false);
  };

  const shareTrip = () => {
    if (!trip) return;
    void Share.share({ message: `I'm on a ROVEYA ride with ${trip.captain.name} (${trip.captain.vehicleNo}) from ${trip.pickup.name} to ${trip.drop.name}. Trip ${trip.serverId || trip.id}.` }).catch(() => undefined);
  };

  return (
    <PageShell kicker="SUPPORT" title="Safety" onBack={() => navigation.goBack()}>
      <LinearGradient colors={[colors.burgundy, colors.cherry, colors.inkwell]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={page.heroCard}>
        <Text style={page.kicker}>EMERGENCY</Text>
        <Text style={[page.title, { marginTop: 6 }]}>Help is one tap away.</Text>
        <Text style={[page.lead, { marginTop: 4 }]}>Police, ambulance, and fire on 112. Tap SOS on any live trip too.</Text>
        <View style={styles.sosRow}>
          <Pressable accessibilityRole="button" onPress={() => void Linking.openURL("tel:112")} style={({ pressed }) => [styles.sos, pressed && { opacity: 0.9 }]}>
            <Ionicons name="alert-circle" size={20} color={colors.night} />
            <Text style={styles.sosText}>Call 112</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => void Linking.openURL(DESK_PHONE)} style={({ pressed }) => [styles.deskBtn, pressed && { borderColor: colors.gold }]}>
            <Ionicons name="call-outline" size={17} color={colors.gold} />
            <Text style={styles.deskBtnText}>ROVEYA desk</Text>
          </Pressable>
        </View>
      </LinearGradient>

      {trip ? (
        <Pressable onPress={shareTrip} style={({ pressed }) => [page.card, styles.live, pressed && { borderColor: colors.gold }]}>
          <View style={styles.liveDot} />
          <View style={{ flex: 1 }}>
            <Text style={page.name}>Share your live trip</Text>
            <Text style={page.small}>{trip.captain.name} · {trip.captain.vehicleNo} · to {trip.drop.name}</Text>
          </View>
          <Ionicons name="share-social" size={18} color={colors.gold} />
        </Pressable>
      ) : null}

      <SectionTitle>TRUSTED CONTACTS</SectionTitle>
      <View style={page.card}>
        <Text style={page.lead}>Keep up to 3 people ready. Share your trip with them in one tap.</Text>
        {store.contacts.map((contact) => (
          <View key={contact.phone} style={styles.contact}>
            <View style={styles.contactMark}>
              <Text style={styles.contactLetter}>{contact.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={page.name}>{contact.name}</Text>
              <Text style={page.small}>+91 {contact.phone.slice(0, 5)} {contact.phone.slice(5)}</Text>
            </View>
            <Pressable accessibilityLabel={`Remove ${contact.name}`} hitSlop={10} onPress={() => store.removeContact(contact.phone)}>
              <Ionicons name="close-circle-outline" size={20} color={colors.faint} />
            </Pressable>
          </View>
        ))}
        {adding ? (
          <View style={{ marginTop: 14, gap: 10 }}>
            <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={colors.faint} selectionColor={colors.gold} autoCapitalize="words" style={page.input} />
            <View style={[page.input, styles.phoneField]}>
              <Text style={styles.prefix}>+91</Text>
              <TextInput value={phone} onChangeText={(text) => setPhone(text.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile" placeholderTextColor={colors.faint} selectionColor={colors.gold} keyboardType="phone-pad" style={styles.phoneInput} />
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <FlowGhost label="Cancel" icon="close" onPress={() => setAdding(false)} />
              <FlowCta label="Save contact" icon="checkmark" disabled={!valid} onPress={save} />
            </View>
          </View>
        ) : store.contacts.length < 3 ? (
          <Pressable onPress={() => setAdding(true)} style={({ pressed }) => [styles.addContact, pressed && { borderColor: colors.gold }]}>
            <Ionicons name="person-add-outline" size={16} color={colors.gold} />
            <Text style={styles.addText}>Add a trusted contact</Text>
          </Pressable>
        ) : null}
      </View>

      <SectionTitle>ON EVERY ROVEYA RIDE</SectionTitle>
      <Group>
        {promises.map((item, index) => (
          <ListRow key={item.title} icon={item.icon} label={item.title} sub={item.line} last={index === promises.length - 1} />
        ))}
      </Group>
    </PageShell>
  );
}

const claimTopics: { label: string; icon: FlowIcon }[] = [
  { label: "Fare looks wrong", icon: "cash-outline" },
  { label: "Lost item", icon: "bag-handle-outline" },
  { label: "Captain behaviour", icon: "person-outline" },
  { label: "Payment or refund", icon: "card-outline" },
  { label: "Something else", icon: "chatbubble-ellipses-outline" },
];

export function ClaimsScreen({ route, navigation }: NativeStackScreenProps<CustomerStack, "Claims">) {
  const store = useStore();
  const rides = store.rides;
  const [rideId, setRideId] = useState<string | null>(route.params?.rideId ?? rides[0]?.id ?? null);
  const [topic, setTopic] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [focused, setFocused] = useState(false);
  const [raised, setRaised] = useState<string | null>(null);
  const ride = rides.find((item) => item.id === rideId);
  const ready = Boolean(ride && topic && note.trim().length >= 8);

  useEffect(() => {
    if (route.params?.rideId) setRideId(route.params.rideId);
  }, [route.params?.rideId]);

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [refresh, setRefresh] = useState(0);

  const submit = async () => {
    if (!ride || !topic || !ready || sending) return;
    if (live) {
      setSending(true);
      setSendError("");
      try {
        const result = await api<{ ticket: { code: string } }>("/support/tickets", {
          body: { app: "rider", topic, message: `${note.trim()}\n\nRide: ${ride.pickup} to ${ride.drop}`, tripCode: /^RV-\d{4,8}$/.test(ride.id) ? ride.id : undefined },
        });
        setRaised(result.ticket.code);
        setRefresh((value) => value + 1);
      } catch (error) {
        setSendError(error instanceof Error ? error.message : "We could not send your claim. Try again.");
        return;
      } finally {
        setSending(false);
      }
    } else {
      const claim = store.raiseClaim({ rideId: ride.id, route: `${ride.pickup} to ${ride.drop}`, topic, note: note.trim() });
      setRaised(claim.id);
    }
    setTopic(null);
    setNote("");
  };

  return (
    <PageShell
      kicker="SUPPORT"
      title="Claims"
      onBack={() => navigation.goBack()}
      footer={raised ? <FlowCta label="Done" icon="checkmark" onPress={() => setRaised(null)} /> : <FlowCta label={sending ? "Sending…" : "Submit claim"} icon="send" disabled={!ready || sending} onPress={() => void submit()} />}
    >
      {raised ? (
        <View style={styles.done}>
          <View style={styles.doneRing}>
            <View style={styles.doneDisc}>
              <Ionicons name="checkmark" size={34} color={colors.night} />
            </View>
          </View>
          <Text style={[page.kicker, { marginTop: 16 }]}>CLAIM {raised}</Text>
          <Text style={[page.title, { marginTop: 6, textAlign: "center" }]}>We have your claim.</Text>
          <Text style={[page.lead, { textAlign: "center", marginTop: 6 }]}>The ROVEYA desk reviews it and calls you on your registered number.</Text>
        </View>
      ) : (
        <>
          <Text style={page.title}>Raise a claim</Text>
          <Text style={[page.lead, { marginTop: 4 }]}>Pick the ride, tell us what happened, and the desk takes it from there.</Text>

          <SectionTitle>1 · WHICH RIDE?</SectionTitle>
          {rides.length ? (
            <Group>
              {rides.slice(0, 5).map((item, index, all) => {
                const on = item.id === rideId;
                return (
                  <Pressable key={`${item.id}-${index}`} onPress={() => setRideId(item.id)} style={[styles.pick, index < all.length - 1 && styles.faqLine, on && { backgroundColor: colors.mist }]}>
                    <View style={[styles.radio, on && styles.radioOn]}>{on ? <Ionicons name="checkmark" size={13} color={colors.night} /> : null}</View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={page.name} numberOfLines={1}>{item.pickup} to {item.drop}</Text>
                      <Text style={page.small}>{item.when} · {item.id}</Text>
                    </View>
                    <Text style={page.gold}>{item.status === "Cancelled" ? "—" : `₹${item.fare}`}</Text>
                  </Pressable>
                );
              })}
            </Group>
          ) : (
            <Text style={page.small}>Your rides show here once you take one.</Text>
          )}

          <SectionTitle>2 · WHAT HAPPENED?</SectionTitle>
          <View style={styles.topics}>
            {claimTopics.map((item) => {
              const on = topic === item.label;
              return (
                <Pressable key={item.label} onPress={() => setTopic(item.label)} style={[styles.topic, on && styles.topicOn]}>
                  <Ionicons name={item.icon} size={18} color={on ? colors.night : colors.gold} />
                  <Text style={[styles.topicText, on && { color: colors.night }]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <SectionTitle>3 · A FEW DETAILS</SectionTitle>
          <TextInput
            value={note}
            onChangeText={(text) => setNote(text.slice(0, 400))}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            multiline
            placeholder={topic === "Lost item" ? "What did you leave, and where in the vehicle?" : "Tell us what happened"}
            placeholderTextColor={colors.faint}
            selectionColor={colors.gold}
            style={[page.input, styles.textArea, focused && page.inputFocus]}
          />
          <Text style={[page.small, { marginTop: 6, textAlign: "right" }]}>{note.length}/400</Text>
          {sendError ? <Text style={[page.small, { color: colors.goldBright }]}>{sendError}</Text> : null}
        </>
      )}

      {live ? <DeskTickets app="rider" refresh={refresh} title="YOUR CLAIMS" /> : null}

      {!live && store.claims.length ? (
        <>
          <SectionTitle>YOUR CLAIMS</SectionTitle>
          <View style={{ gap: 10 }}>
            {store.claims.map((claim) => (
              <View key={claim.id} style={page.card}>
                <View style={styles.lastHead}>
                  <Text style={page.name}>{claim.topic}</Text>
                  <Pill label={claim.status} tone={claim.status === "Resolved" ? "solid" : "gold"} />
                </View>
                <Text style={[page.small, { marginTop: 4 }]}>
                  {claim.id} · {claim.rideId} · {shortDay(claim.at)}, {clock(claim.at)}
                </Text>
                <Text style={[page.small, { marginTop: 2 }]}>{claim.route}</Text>
                <Text style={[page.lead, { marginTop: 8 }]} numberOfLines={3}>{claim.note}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </PageShell>
  );
}

const deskHelps: { icon: FlowIcon; title: string; line: string }[] = [
  { icon: "calendar-outline", title: "Bookings and changes", line: "Rides, taxipool seats, and parcels" },
  { icon: "cash-outline", title: "Fares and refunds", line: "Receipts, wallet, and cash" },
  { icon: "bag-handle-outline", title: "Lost items", line: "We reach your captain for you" },
  { icon: "people-outline", title: "Taxipool seats", line: "Boarding points and timings" },
];

export function DeskScreen({ navigation }: NativeStackScreenProps<CustomerStack, "Desk">) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const open = deskOpen(now);

  return (
    <PageShell kicker="SUPPORT" title="ROVEYA desk" onBack={() => navigation.goBack()} footer={<FlowCta label={`Call ${DESK_LABEL}`} icon="call" onPress={() => void Linking.openURL(DESK_PHONE)} />}>
      <LinearGradient colors={[colors.burgundy, colors.plum, colors.inkwell]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[page.heroCard, { alignItems: "center" }]}>
        <View style={styles.deskRing}>
          <View style={styles.deskDisc}>
            <Ionicons name="headset" size={30} color={colors.night} />
          </View>
        </View>
        <View style={[styles.status, open ? styles.statusOpen : styles.statusClosed]}>
          <View style={[styles.statusDot, { backgroundColor: open ? colors.night : colors.gold }]} />
          <Text style={[styles.statusText, { color: open ? colors.night : colors.gold }]}>{open ? "OPEN NOW" : "OPENS AT 5:00 AM"}</Text>
        </View>
        <Text style={[page.title, { marginTop: 12, textAlign: "center" }]}>A real person, on the line.</Text>
        <Text style={[page.lead, { textAlign: "center", marginTop: 4 }]}>Daily, 5:00 AM to 11:00 PM</Text>
        <Text style={styles.deskPhone}>{DESK_LABEL}</Text>
      </LinearGradient>

      <SectionTitle>THE DESK HELPS WITH</SectionTitle>
      <View style={styles.helpGrid}>
        {deskHelps.map((item) => (
          <View key={item.title} style={styles.helpCard}>
            <Ionicons name={item.icon} size={20} color={colors.gold} />
            <Text style={[page.name, { marginTop: 10 }]}>{item.title}</Text>
            <Text style={page.small}>{item.line}</Text>
          </View>
        ))}
      </View>

      <SectionTitle>OR TRY</SectionTitle>
      <Group>
        <ListRow icon="help-buoy-outline" label="Help articles" sub="Answers to common questions" onPress={() => navigation.navigate("Support")} />
        <ListRow icon="document-text-outline" label="Raise a claim" sub="The desk calls you back" last onPress={() => navigation.navigate("Claims")} />
      </Group>

      <View style={page.note}>
        <Ionicons name="location-outline" size={16} color={colors.gold} />
        <Text style={page.noteText}>ROVEYA · Khammam, Telangana</Text>
      </View>
    </PageShell>
  );
}

const services: { icon: FlowIcon; title: string; line: string }[] = [
  { icon: "bicycle-outline", title: "Bike", line: "Quick city hops" },
  { icon: "car-outline", title: "Auto", line: "Door to door" },
  { icon: "car-sport-outline", title: "Cab", line: "A seat of your own" },
  { icon: "people-outline", title: "Taxipool", line: "City to city seats" },
  { icon: "cube-outline", title: "Parcel", line: "Same-day delivery" },
  { icon: "game-controller-outline", title: "Lounge", line: "Play and earn" },
];

export function AboutScreen({ navigation }: NativeStackScreenProps<CustomerStack, "About">) {
  return (
    <PageShell kicker="ABOUT" title="About ROVEYA" onBack={() => navigation.goBack()}>
      <LinearGradient colors={[colors.burgundy, colors.plum, colors.inkwell]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[page.heroCard, { alignItems: "center", paddingVertical: 26 }]}>
        <Logo size={72} />
        <Text style={styles.brand}>ROVEYA</Text>
        <Text style={styles.brandKicker}>PREMIUM TAXIPOOL AND TRAVEL</Text>
        <View style={styles.brandRule} />
        <Text style={[page.lead, { textAlign: "center" }]}>From Khammam, Telangana. Rides across the city and seats from city to city, with the fare shown before you go.</Text>
      </LinearGradient>

      <SectionTitle>WHAT WE DO</SectionTitle>
      <View style={styles.helpGrid}>
        {services.map((item) => (
          <View key={item.title} style={[styles.helpCard, styles.serviceCard]}>
            <View style={styles.serviceIcon}>
              <Ionicons name={item.icon} size={18} color={colors.night} />
            </View>
            <Text style={[page.name, { marginTop: 10 }]}>{item.title}</Text>
            <Text style={page.small}>{item.line}</Text>
          </View>
        ))}
      </View>

      <SectionTitle>OUR PROMISE</SectionTitle>
      <Group>
        <ListRow icon="pricetag-outline" label="Clear fares" sub="The full fare before you book" />
        <ListRow icon="shield-checkmark-outline" label="Safe rides" sub="Verified captains and a ride OTP" />
        <ListRow icon="heart-outline" label="Local care" sub="A desk team that picks up the phone" last />
      </Group>

      <SectionTitle>APP</SectionTitle>
      <Group>
        <ListRow icon="information-circle-outline" label="Version" sub="1.0.0 · Crafted in Hyderabad" chevron={false} />
        <ListRow icon="call-outline" label="ROVEYA desk" sub={`${DESK_LABEL} · Daily, 5:00 AM to 11:00 PM`} onPress={() => navigation.navigate("Desk")} />
        <ListRow icon="reader-outline" label="Terms and privacy" last onPress={() => navigation.navigate("Terms")} />
      </Group>
    </PageShell>
  );
}

const terms: { title: string; body: string }[] = [
  { title: "Using ROVEYA", body: "ROVEYA connects you with verified captains for bike, auto, and cab rides, city-to-city taxipool seats, and parcel delivery. You need a valid Indian mobile number to sign in." },
  { title: "Fares and payment", body: "The fare is shown before you book. Pay your captain in cash or from your ROVEYA wallet. Cancelling a ride before pickup is free." },
  { title: "Taxipool seats", body: "Each seat is for one rider. Reach the boarding point before the departure time and show your boarding code to the captain." },
  { title: "Parcels", body: "Cash, jewellery, alcohol, drugs, weapons, gas cylinders, flammable liquids, and live animals stay off ROVEYA parcels. Seal every box or bag before pickup." },
  { title: "Rewards", body: "Coins and scratch cards are for ROVEYA rides and have no cash value outside the app. Every 100 coins turn into ₹10 in your wallet." },
];

const privacy: { title: string; body: string }[] = [
  { title: "What we keep", body: "Your name, phone number, optional email, saved places, and your ride history." },
  { title: "Why we use it", body: "Your phone number is used to sign in, to share trip codes, and to reach you about a booking. Your location is used to find your pickup and show your trip on the map." },
  { title: "Who sees it", body: "Your captain sees your name, pickup, and drop for the ride they are on. Trusted contacts see only the trips you share with them." },
  { title: "Your choices", body: "Edit your details any time in Personal details. Turn alerts on or off in Notifications. Call the desk to close your account." },
];

export function TermsScreen({ route, navigation }: NativeStackScreenProps<CustomerStack, "Terms">) {
  const [tab, setTab] = useState<"terms" | "privacy">(route.params?.tab ?? "terms");
  const list = tab === "terms" ? terms : privacy;
  return (
    <PageShell kicker="ABOUT" title="Terms and privacy" onBack={() => navigation.goBack()}>
      <Chips
        items={[
          { key: "terms", label: "Terms of use" },
          { key: "privacy", label: "Privacy" },
        ]}
        value={tab}
        onChange={setTab}
      />
      <Text style={[page.small, { marginTop: 14 }]}>Updated 21 Oct 2026</Text>
      <View style={{ marginTop: 10, gap: 10 }}>
        {list.map((item, index) => (
          <View key={item.title} style={page.card}>
            <View style={styles.termHead}>
              <View style={styles.termNum}>
                <Text style={styles.termNumText}>{index + 1}</Text>
              </View>
              <Text style={[page.name, { flex: 1 }]}>{item.title}</Text>
            </View>
            <Text style={[page.lead, { marginTop: 8 }]}>{item.body}</Text>
          </View>
        ))}
      </View>
      <View style={page.note}>
        <Ionicons name="call-outline" size={16} color={colors.gold} />
        <Text style={page.noteText}>Questions about your data? Call the ROVEYA desk on {DESK_LABEL}.</Text>
      </View>
    </PageShell>
  );
}

export function DetailScreen({ route, navigation }: NativeStackScreenProps<CustomerStack, "Detail">) {
  return (
    <PageShell kicker="ROVEYA" title={route.params.title} onBack={() => navigation.goBack()}>
      <View style={page.card}>
        {route.params.body.split("\n").map((line, index) => (
          <Text key={index} style={[page.lead, index > 0 && { marginTop: 8 }]}>{line}</Text>
        ))}
      </View>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  search: { marginTop: 14, flexDirection: "row", alignItems: "center", gap: 10, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: colors.gold, backgroundColor: colors.inkwell, paddingHorizontal: 16 },
  searchInput: { flex: 1, height: 50, color: colors.cream, fontFamily: type.label, fontSize: 15, paddingVertical: 0 },
  lastHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  topics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  topic: { width: "48%", flexGrow: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  topicOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  topicText: { flex: 1, color: colors.cream, fontFamily: type.labelStrong, fontSize: 13.5 },
  faq: { paddingVertical: 14, paddingHorizontal: 14 },
  faqLine: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  faqHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  sosRow: { marginTop: 16, flexDirection: "row", gap: 10 },
  sos: { flex: 1, height: 50, borderRadius: 16, backgroundColor: colors.gold, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  sosText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 16 },
  deskBtn: { flex: 1, height: 50, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: "rgba(18,6,13,0.45)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  deskBtnText: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 14.5 },
  live: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.gold },
  contact: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  contactMark: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.goldBright, alignItems: "center", justifyContent: "center" },
  contactLetter: { color: colors.night, fontFamily: type.labelStrong, fontSize: 16 },
  phoneField: { flexDirection: "row", alignItems: "center", gap: 8 },
  prefix: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 15 },
  phoneInput: { flex: 1, height: 50, color: colors.cream, fontFamily: type.label, fontSize: 15, paddingVertical: 0 },
  addContact: { marginTop: 14, height: 46, borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: colors.gold, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  addText: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 14 },
  pick: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: "rgba(246,241,220,0.25)", alignItems: "center", justifyContent: "center" },
  radioOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  textArea: { height: 120, paddingTop: 14, textAlignVertical: "top" },
  done: { alignItems: "center", paddingVertical: 24 },
  doneRing: { width: 104, height: 104, borderRadius: 52, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  doneDisc: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  deskRing: { width: 88, height: 88, borderRadius: 44, borderWidth: 1, borderColor: colors.gold, alignItems: "center", justifyContent: "center" },
  deskDisc: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  status: { marginTop: 14, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  statusOpen: { backgroundColor: colors.gold },
  statusClosed: { borderWidth: 1, borderColor: colors.line, backgroundColor: "rgba(18,6,13,0.45)" },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontFamily: type.labelStrong, fontSize: 10.5, letterSpacing: 1.4 },
  deskPhone: { marginTop: 10, color: colors.gold, fontFamily: type.labelStrong, fontSize: 22, letterSpacing: 0.6 },
  helpGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  helpCard: { width: "48%", flexGrow: 1, padding: 14, borderRadius: 20, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  serviceCard: { width: "31%" },
  serviceIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  brand: { marginTop: 14, color: colors.cream, fontFamily: type.semibold, fontSize: 28, letterSpacing: 7 },
  brandKicker: { marginTop: 4, color: colors.gold, fontFamily: type.labelStrong, fontSize: 10, letterSpacing: 2 },
  brandRule: { width: 48, height: 1.5, backgroundColor: colors.gold, marginVertical: 14 },
  termHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  termNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.gold, alignItems: "center", justifyContent: "center" },
  termNumText: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 12 },
});
