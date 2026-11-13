import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Image, Linking, Pressable, StyleSheet, Text, TextInput, View, type ImageSourcePropType } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CoverPhoto } from "../components/CoverPhoto";
import { DESK_PHONE, FlowCta, FlowGhost, FlowSum, StepShell, type FlowIcon, type TrailItem } from "../components/StepShell";
import { captains, DEMO_LOGIN_CODE, fallbackHere, places } from "../data";
import { distanceKm, inr, quoteEta } from "../geo";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { CustomerStack } from "../navigation";
import type { ParcelBooking, ParcelContact, PayMethod, Place } from "../types";

type Props = NativeStackScreenProps<CustomerStack, "ParcelFlow">;
type Mode = "bike" | "auto";

const steps = ["Pickup", "Drop", "Vehicle", "Sender", "Receiver", "Confirm"];
const CITY_RANGE_KM = 60;

const modes: Record<Mode, { title: string; limit: string; line: string; photo: ImageSourcePropType; base: number; perKm: number; min: number }> = {
  bike: { title: "Bike", limit: "Up to 5 kg", line: "Fits in a bag. Fastest across the city.", photo: require("../../assets/hero-bike.jpg"), base: 30, perKm: 8, min: 45 },
  auto: { title: "Auto", limit: "Up to 20 kg", line: "Room for boxes and bigger bags.", photo: require("../../assets/hero-auto.jpg"), base: 50, perKm: 14, min: 80 },
};

const items: { label: string; icon: FlowIcon }[] = [
  { label: "Documents", icon: "document-text-outline" },
  { label: "Food", icon: "fast-food-outline" },
  { label: "Clothes", icon: "shirt-outline" },
  { label: "Electronics", icon: "phone-portrait-outline" },
  { label: "Keys", icon: "key-outline" },
  { label: "Medicines", icon: "medkit-outline" },
  { label: "Other", icon: "cube-outline" },
];

const prohibited = "ROVEYA parcels do not carry cash, jewellery, alcohol, drugs, weapons, gas cylinders, flammable liquids, or live animals. Pack fragile items with padding and seal every box or bag before pickup.";

function roadKm(a: Place, b: Place) {
  return Math.max(1, distanceKm(a, b) * 1.25);
}

function parcelFare(mode: Mode, km: number) {
  const rate = modes[mode];
  return Math.max(rate.min, Math.round(rate.base + rate.perKm * km));
}

function validPhone(phone: string) {
  return /^[6-9]\d{9}$/.test(phone);
}

function spaced(phone: string) {
  return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
}

function code() {
  return String(1000 + Math.floor(Math.random() * 9000));
}

export function ParcelFlowScreen({ navigation }: Props) {
  const store = useStore();
  const here = store.pickup ?? fallbackHere;
  const [step, setStep] = useState(0);
  const [pickup, setPickup] = useState<Place | null>(null);
  const [drop, setDrop] = useState<Place | null>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode | null>(null);
  const [item, setItem] = useState<string | null>(null);
  const [sender, setSender] = useState<ParcelContact>({ name: store.session?.name ?? "", phone: store.session?.phone ?? "", detail: "" });
  const [receiver, setReceiver] = useState<ParcelContact>({ name: "", phone: "", detail: "" });
  const [senderVerified, setSenderVerified] = useState<string | null>(store.session?.phone ?? null);
  const [receiverVerified, setReceiverVerified] = useState<string | null>(null);
  const [payment, setPayment] = useState<PayMethod>("cash");
  const [agreed, setAgreed] = useState(false);
  const [booked, setBooked] = useState<ParcelBooking | null>(null);

  const km = pickup && drop ? roadKm(pickup, drop) : 0;
  const fare = mode ? parcelFare(mode, km) : 0;
  const walletShort = store.wallet < fare;

  useEffect(() => {
    if (walletShort && payment === "wallet") setPayment("cash");
  }, [walletShort, payment]);

  useEffect(() => setQuery(""), [step]);

  const pickupOptions = useMemo(() => [here, ...places.filter((place) => place.id !== here.id)], [here]);
  const listFor = (options: Place[]) => {
    const text = query.trim().toLowerCase();
    return text ? options.filter((place) => `${place.name} ${place.subtitle}`.toLowerCase().includes(text)) : options;
  };

  const senderOk = sender.name.trim().length >= 2 && validPhone(sender.phone) && senderVerified === sender.phone;
  const receiverOk = receiver.name.trim().length >= 2 && validPhone(receiver.phone) && receiverVerified === receiver.phone && receiver.phone !== sender.phone;

  const go = (next: number) => setStep(next);
  const back = () => {
    if (booked || step === 0) navigation.goBack();
    else go(step - 1);
  };

  const choosePickup = (place: Place) => {
    setPickup(place);
    if (drop?.id === place.id) setDrop(null);
    setTimeout(() => go(1), 200);
  };

  const chooseDrop = (place: Place) => {
    setDrop(place);
    setTimeout(() => go(2), 200);
  };

  const confirm = () => {
    if (!pickup || !drop || !mode || !item) return;
    if (payment === "wallet" && !store.payFromWallet(fare, `Parcel · ${pickup.name} to ${drop.name}`)) return;
    const captain = captains[mode];
    const booking: ParcelBooking = {
      id: `RVX-${String(Date.now()).slice(-5)}`,
      vehicle: mode,
      item,
      pickup: pickup.name,
      drop: drop.name,
      sender: { ...sender, name: sender.name.trim() },
      receiver: { ...receiver, name: receiver.name.trim() },
      pickupCode: code(),
      deliveryCode: code(),
      fare,
      distanceKm: km,
      payment,
      captain: captain.name,
      vehicleNo: captain.vehicleNo,
    };
    store.bookParcel(booking);
    setBooked(booking);
  };

  const canContinue = [Boolean(pickup), Boolean(drop), Boolean(mode && item), senderOk, receiverOk, agreed][step];
  const ctaLabel = step === steps.length - 1 ? `Book parcel · ${inr(fare)}` : "Continue";
  const onCta = () => {
    if (!canContinue) return;
    if (step === steps.length - 1) confirm();
    else go(step + 1);
  };

  const trail: TrailItem[] = [];
  if (pickup) trail.push({ step: 0, icon: "radio-button-on", label: pickup.name });
  if (drop) trail.push({ step: 1, icon: "location", label: drop.name });
  if (mode && item) trail.push({ step: 2, icon: mode === "bike" ? "bicycle" : "car", label: `${modes[mode].title} · ${item}` });
  if (senderOk) trail.push({ step: 3, icon: "arrow-up-circle-outline", label: sender.name.trim().split(" ")[0] });
  if (receiverOk) trail.push({ step: 4, icon: "arrow-down-circle-outline", label: receiver.name.trim().split(" ")[0] });

  return (
    <StepShell
      kicker="PARCEL · DOOR TO DOOR"
      steps={steps}
      step={step}
      doneLabel={booked ? "Parcel booked" : null}
      trail={trail}
      onBack={back}
      onTrail={go}
      footer={
        booked ? (
          <>
            <FlowGhost label="Call desk" icon="call-outline" onPress={() => void Linking.openURL(DESK_PHONE)} />
            <FlowCta label="Done" icon="checkmark" onPress={() => navigation.goBack()} />
          </>
        ) : (
          <>
            {step >= 2 && mode ? <FlowSum value={inr(fare)} sub={`${modes[mode].title} · ${km.toFixed(1)} km`} /> : null}
            <FlowCta label={ctaLabel} icon={step === steps.length - 1 ? "checkmark" : "arrow-forward"} disabled={!canContinue} onPress={onCta} />
          </>
        )
      }
    >
      {booked ? (
        <Booked booking={booked} />
      ) : step === 0 ? (
        <>
          <RouteCard pickup={pickup} drop={drop} active="pickup" />
          <Text style={styles.title}>Where do we pick it up?</Text>
          <Text style={styles.lead}>Your captain comes to this address to collect the parcel.</Text>
          <SearchBox value={query} onChange={setQuery} placeholder="Search pickup address" />
          <View style={styles.card}>
            {listFor(pickupOptions).map((place, index, all) => (
              <PlaceRow
                key={place.id}
                place={place}
                icon={place.id === here.id ? "navigate" : "location-outline"}
                sub={place.id === here.id ? "Pick up from where you are now" : place.subtitle}
                selected={pickup?.id === place.id}
                last={index === all.length - 1}
                onPress={() => choosePickup(place)}
              />
            ))}
          </View>
        </>
      ) : step === 1 && pickup ? (
        <>
          <RouteCard pickup={pickup} drop={drop} active="drop" />
          <Text style={styles.title}>Where does it go?</Text>
          <Text style={styles.lead}>Parcels go anywhere within {CITY_RANGE_KM} km of pickup.</Text>
          <SearchBox value={query} onChange={setQuery} placeholder="Search drop address" />
          <View style={styles.card}>
            {listFor(places.filter((place) => place.id !== pickup.id))
              .map((place) => ({ place, km: roadKm(pickup, place) }))
              .sort((a, b) => a.km - b.km)
              .map(({ place, km: distance }, index, all) => {
                const inRange = distance <= CITY_RANGE_KM;
                return (
                  <PlaceRow
                    key={place.id}
                    place={place}
                    icon="location-outline"
                    sub={inRange ? `${distance.toFixed(1)} km · ${place.subtitle}` : `${place.subtitle} · outside city range`}
                    selected={drop?.id === place.id}
                    disabled={!inRange}
                    last={index === all.length - 1}
                    onPress={() => chooseDrop(place)}
                  />
                );
              })}
          </View>
        </>
      ) : step === 2 && pickup && drop ? (
        <>
          <Text style={styles.title}>How should it travel?</Text>
          <Text style={styles.lead}>{km.toFixed(1)} km from {pickup.name} to {drop.name}.</Text>
          <View style={styles.modeRow}>
            {(Object.keys(modes) as Mode[]).map((key) => {
              const info = modes[key];
              const on = mode === key;
              return (
                <Pressable key={key} onPress={() => setMode(key)} style={[styles.modeCard, on && styles.modeOn]}>
                  <CoverPhoto source={info.photo} ratio={0.75} focus={0.5} style={styles.modePhoto}>
                    <LinearGradient colors={["rgba(18,6,13,0)", "rgba(18,6,13,0.85)"]} locations={[0.4, 1]} style={styles.fillAbs} />
                    <View style={styles.limit}>
                      <Text style={styles.limitText}>{info.limit}</Text>
                    </View>
                    {on ? (
                      <View style={[styles.radio, styles.radioOn, styles.modeCheck]}>
                        <Ionicons name="checkmark" size={13} color={colors.night} />
                      </View>
                    ) : null}
                  </CoverPhoto>
                  <View style={styles.modeBody}>
                    <View style={styles.modeHead}>
                      <Text style={styles.modeTitle}>{info.title}</Text>
                      <Text style={styles.modeFare}>{inr(parcelFare(key, km))}</Text>
                    </View>
                    <Text style={styles.modeLine}>{info.line}</Text>
                    <View style={styles.metaRow}>
                      <Ionicons name="time-outline" size={11} color={colors.gold} />
                      <Text style={styles.metaText}>About {quoteEta(key, km)} min</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.kicker, styles.sectionGap]}>WHAT ARE YOU SENDING?</Text>
          <View style={styles.wrap}>
            {items.map((entry) => {
              const on = item === entry.label;
              return (
                <Pressable key={entry.label} onPress={() => setItem(entry.label)} style={({ pressed }) => [styles.chip, (on || pressed) && styles.chipOn]}>
                  <Ionicons name={entry.icon} size={14} color={on ? colors.night : colors.gold} />
                  <Text style={[styles.chipText, on && { color: colors.night }]}>{entry.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.tip}>
            <Ionicons name="cube-outline" size={16} color={colors.gold} />
            <Text style={styles.tipText}>Seal boxes and bags before pickup. Your captain checks the size against the vehicle.</Text>
          </View>
        </>
      ) : step === 3 && pickup ? (
        <ContactStep
          kicker="SENDER · AT PICKUP"
          title="Who is sending it?"
          lead={`Your captain meets this person at ${pickup.name}.`}
          contact={sender}
          onChange={setSender}
          verified={senderVerified === sender.phone}
          onVerified={() => setSenderVerified(sender.phone)}
          detailLabel="House, flat, or landmark at pickup"
          codeNote="A pickup code goes to this number. The captain collects the parcel only with that code."
        />
      ) : step === 4 && drop ? (
        <ContactStep
          kicker="RECEIVER · AT DROP"
          title="Who receives it?"
          lead={`Your captain hands the parcel to this person at ${drop.name}.`}
          contact={receiver}
          onChange={setReceiver}
          verified={receiverVerified === receiver.phone}
          onVerified={() => setReceiverVerified(receiver.phone)}
          detailLabel="House, flat, or landmark at drop"
          codeNote="A delivery code goes to this number. The captain hands over the parcel only with that code."
          sameAs={receiver.phone.length === 10 && receiver.phone === sender.phone ? "Use a different number from the sender." : null}
        />
      ) : step === 5 && pickup && drop && mode && item ? (
        <>
          <Text style={styles.title}>Review and book</Text>
          <Text style={styles.lead}>Check both contacts, then book your parcel.</Text>
          <View style={styles.ticket}>
            <View style={styles.poolTop}>
              <Text style={styles.kicker}>{modes[mode].title.toUpperCase()} PARCEL · {item.toUpperCase()}</Text>
            </View>
            <View style={styles.stops}>
              <View style={styles.stopRail}>
                <View style={[styles.stopDot, { backgroundColor: colors.gold }]} />
                <View style={styles.stopLine} />
                <View style={[styles.stopDot, { backgroundColor: colors.burgundy, borderColor: colors.goldBright }]} />
              </View>
              <View style={{ flex: 1, gap: 18 }}>
                <ContactSummary label="PICKUP" place={pickup.name} contact={sender} />
                <Text style={styles.stopDur}>{km.toFixed(1)} km · about {quoteEta(mode, km)} min</Text>
                <ContactSummary label="DROP" place={drop.name} contact={receiver} />
              </View>
            </View>
          </View>
          <View style={[styles.card, styles.fareCard]}>
            <FareLine label={`${modes[mode].title} parcel · ${km.toFixed(1)} km`} value={inr(fare)} />
            <View style={styles.rule} />
            <View style={styles.fareTotalRow}>
              <Text style={styles.fareTotalLabel}>Total</Text>
              <Text style={styles.fareTotal}>{inr(fare)}</Text>
            </View>
          </View>
          <Text style={[styles.kicker, styles.sectionGap]}>PAY WITH</Text>
          <View style={styles.card}>
            <OptionRow icon="cash-outline" title="Cash at pickup" sub="Pay your captain when the parcel is collected" selected={payment === "cash"} onPress={() => setPayment("cash")} />
            <OptionRow
              icon="wallet-outline"
              title="ROVEYA Wallet"
              sub={walletShort ? `Balance ${inr(store.wallet)} · add ${inr(fare - store.wallet)} to use it` : `Balance ${inr(store.wallet)}`}
              selected={payment === "wallet"}
              disabled={walletShort}
              last
              onPress={() => setPayment("wallet")}
            />
          </View>
          <Pressable onPress={() => setAgreed((value) => !value)} style={styles.agree}>
            <View style={[styles.box, agreed && styles.boxOn]}>{agreed ? <Ionicons name="checkmark" size={14} color={colors.night} /> : null}</View>
            <Text style={styles.agreeText}>
              My parcel has no prohibited items.{" "}
              <Text style={styles.link} onPress={() => navigation.navigate("Detail", { title: "Prohibited items", body: prohibited })}>
                See the list
              </Text>
            </Text>
          </Pressable>
        </>
      ) : null}
    </StepShell>
  );
}

function RouteCard({ pickup, drop, active }: { pickup: Place | null; drop: Place | null; active: "pickup" | "drop" }) {
  return (
    <View style={styles.route}>
      <View style={styles.stopRail}>
        <View style={[styles.stopDot, { backgroundColor: colors.gold }]} />
        <View style={styles.stopLine} />
        <View style={[styles.stopDot, { backgroundColor: colors.burgundy, borderColor: colors.goldBright }]} />
      </View>
      <View style={{ flex: 1, gap: 12 }}>
        <View style={[styles.routeRow, active === "pickup" && styles.routeActive]}>
          <Text style={styles.routeLabel}>PICKUP</Text>
          <Text style={[styles.routeValue, !pickup && styles.routeEmpty]} numberOfLines={1}>{pickup?.name ?? "Pick a pickup address"}</Text>
        </View>
        <View style={[styles.routeRow, active === "drop" && styles.routeActive]}>
          <Text style={styles.routeLabel}>DROP</Text>
          <Text style={[styles.routeValue, !drop && styles.routeEmpty]} numberOfLines={1}>{drop?.name ?? "Pick a drop address"}</Text>
        </View>
      </View>
    </View>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (text: string) => void; placeholder: string }) {
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={18} color={colors.gold} />
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.faint} style={styles.searchInput} />
      {value ? (
        <Pressable hitSlop={10} onPress={() => onChange("")}>
          <Ionicons name="close-circle" size={18} color={colors.faint} />
        </Pressable>
      ) : null}
    </View>
  );
}

function PlaceRow({ place, icon, sub, selected, disabled, last, onPress }: { place: Place; icon: FlowIcon; sub: string; selected: boolean; disabled?: boolean; last: boolean; onPress: () => void }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.row, !last && styles.rowLine, (pressed || selected) && { backgroundColor: colors.mist }, disabled && { opacity: 0.4 }]}>
      <View style={[styles.rowIcon, selected && { borderColor: colors.gold }]}>
        <Ionicons name={icon} size={16} color={colors.gold} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{place.name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text>
      </View>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <Ionicons name="checkmark" size={13} color={colors.night} /> : null}</View>
    </Pressable>
  );
}

function ContactStep({
  kicker,
  title,
  lead,
  contact,
  onChange,
  verified,
  onVerified,
  detailLabel,
  codeNote,
  sameAs,
}: {
  kicker: string;
  title: string;
  lead: string;
  contact: ParcelContact;
  onChange: (next: ParcelContact) => void;
  verified: boolean;
  onVerified: () => void;
  detailLabel: string;
  codeNote: string;
  sameAs?: string | null;
}) {
  return (
    <>
      <Text style={styles.kicker}>{kicker}</Text>
      <Text style={[styles.title, { marginTop: 6 }]}>{title}</Text>
      <Text style={styles.lead}>{lead}</Text>
      <View style={[styles.card, styles.form]}>
        <Field label="Full name" icon="person-outline" value={contact.name} onChange={(name) => onChange({ ...contact, name })} placeholder="Name as on their phone" />
        <Field
          label="Mobile number"
          icon="call-outline"
          prefix="+91"
          value={contact.phone}
          onChange={(phone) => onChange({ ...contact, phone: phone.replace(/\D/g, "").slice(0, 10) })}
          placeholder="10-digit number"
          keyboard="number-pad"
          trailing={verified ? <Ionicons name="shield-checkmark" size={18} color={colors.gold} /> : null}
        />
        <Field label={detailLabel} icon="home-outline" value={contact.detail} onChange={(detail) => onChange({ ...contact, detail })} placeholder="Flat 302, near the temple" optional />
      </View>
      {sameAs ? <Text style={styles.error}>{sameAs}</Text> : <VerifyPhone phone={contact.phone} verified={verified} onVerified={onVerified} />}
      <View style={styles.tip}>
        <Ionicons name="key-outline" size={16} color={colors.gold} />
        <Text style={styles.tipText}>{codeNote}</Text>
      </View>
    </>
  );
}

function Field({
  label,
  icon,
  value,
  onChange,
  placeholder,
  prefix,
  keyboard,
  trailing,
  optional,
}: {
  label: string;
  icon: FlowIcon;
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
  prefix?: string;
  keyboard?: "number-pad";
  trailing?: ReactNode;
  optional?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View>
      <Text style={styles.fieldLabel}>
        {label.toUpperCase()}
        {optional ? <Text style={styles.optional}>  OPTIONAL</Text> : null}
      </Text>
      <View style={[styles.field, focused && { borderColor: colors.gold }]}>
        <Ionicons name={icon} size={16} color={colors.gold} />
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
          keyboardType={keyboard}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={styles.input}
        />
        {trailing}
      </View>
    </View>
  );
}

function VerifyPhone({ phone, verified, onVerified }: { phone: string; verified: boolean; onVerified: () => void }) {
  const [sent, setSent] = useState(false);
  const [digits, setDigits] = useState("");
  const [error, setError] = useState("");
  const [left, setLeft] = useState(0);
  const input = useRef<TextInput>(null);

  useEffect(() => {
    setSent(false);
    setDigits("");
    setError("");
  }, [phone]);

  useEffect(() => {
    if (left <= 0) return;
    const timer = setTimeout(() => setLeft((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);

  const send = () => {
    setSent(true);
    setDigits("");
    setError("");
    setLeft(30);
    setTimeout(() => input.current?.focus(), 60);
  };

  const enterCode = (text: string) => {
    const next = text.replace(/\D/g, "").slice(0, 4);
    setDigits(next);
    setError("");
    if (next.length < 4) return;
    if (next === DEMO_LOGIN_CODE) {
      onVerified();
      setSent(false);
    } else {
      setError("That code does not match. Try again.");
      setTimeout(() => setDigits(""), 350);
    }
  };

  if (verified) {
    return (
      <View style={[styles.verify, styles.verifyDone]}>
        <View style={styles.verifyIcon}>
          <Ionicons name="shield-checkmark" size={16} color={colors.night} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.verifyTitle}>Number verified</Text>
          <Text style={styles.verifySub}>{spaced(phone)}</Text>
        </View>
      </View>
    );
  }

  if (!validPhone(phone)) {
    return (
      <View style={styles.verify}>
        <Ionicons name="shield-outline" size={18} color={colors.faint} />
        <Text style={[styles.verifySub, { flex: 1 }]}>Enter a 10-digit mobile number to verify it with a code.</Text>
      </View>
    );
  }

  if (!sent) {
    return (
      <Pressable onPress={send} style={({ pressed }) => [styles.verify, styles.verifySend, pressed && { backgroundColor: colors.mist }]}>
        <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.gold} />
        <View style={{ flex: 1 }}>
          <Text style={styles.verifyTitle}>Verify this number</Text>
          <Text style={styles.verifySub}>Send a 4-digit code to {spaced(phone)}</Text>
        </View>
        <Text style={styles.sendText}>Send code</Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.verify, styles.verifyOpen]}>
      <Text style={styles.verifyTitle}>Enter the code sent to {spaced(phone)}</Text>
      <Pressable onPress={() => input.current?.focus()} style={styles.codeRow}>
        {[0, 1, 2, 3].map((index) => {
          const filled = index < digits.length;
          const current = index === digits.length;
          return (
            <View key={index} style={[styles.codeBox, current && styles.codeBoxOn, error ? styles.codeBoxError : null]}>
              <Text style={styles.codeDigit}>{filled ? digits[index] : ""}</Text>
            </View>
          );
        })}
        <TextInput ref={input} value={digits} onChangeText={enterCode} keyboardType="number-pad" maxLength={4} style={styles.hiddenInput} caretHidden />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.codeFoot}>
        {left > 0 ? <Text style={styles.verifySub}>Resend in {left}s</Text> : <Text style={styles.link} onPress={send}>Resend code</Text>}
        <Text style={styles.verifySub}>Demo code {DEMO_LOGIN_CODE}</Text>
      </View>
    </View>
  );
}

function ContactSummary({ label, place, contact }: { label: string; place: string; contact: ParcelContact }) {
  return (
    <View>
      <Text style={styles.routeLabel}>{label}</Text>
      <Text style={styles.stopTime}>{place}</Text>
      {contact.detail ? <Text style={styles.stopPoint}>{contact.detail}</Text> : null}
      <View style={styles.contactLine}>
        <Ionicons name="shield-checkmark" size={12} color={colors.gold} />
        <Text style={styles.stopPoint}>
          {contact.name.trim()} · {spaced(contact.phone)}
        </Text>
      </View>
    </View>
  );
}

function FareLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fareLine}>
      <Text style={styles.fareLabel}>{label}</Text>
      <Text style={styles.fareValue}>{value}</Text>
    </View>
  );
}

function OptionRow({ icon, title, sub, selected, disabled, last, onPress }: { icon: FlowIcon; title: string; sub: string; selected: boolean; disabled?: boolean; last?: boolean; onPress: () => void }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.row, !last && styles.rowLine, (pressed || selected) && { backgroundColor: colors.mist }, disabled && { opacity: 0.5 }]}>
      <View style={[styles.rowIcon, selected && { borderColor: colors.gold }]}>
        <Ionicons name={icon} size={16} color={colors.gold} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <Ionicons name="checkmark" size={13} color={colors.night} /> : null}</View>
    </Pressable>
  );
}

function Booked({ booking }: { booking: ParcelBooking }) {
  const captain = captains[booking.vehicle];
  const stages: { title: string; sub: string; done: boolean }[] = [
    { title: "Parcel booked", sub: booking.id, done: true },
    { title: "Captain reaches pickup", sub: booking.pickup, done: false },
    { title: "Picked up with the pickup code", sub: booking.sender.name, done: false },
    { title: "Delivered with the delivery code", sub: booking.receiver.name, done: false },
  ];
  return (
    <>
      <View style={styles.doneTop}>
        <View style={styles.doneRing}>
          <View style={styles.doneDisc}>
            <Ionicons name="cube" size={32} color={colors.night} />
          </View>
        </View>
        <Text style={[styles.kicker, { marginTop: 18 }]}>PARCEL BOOKED</Text>
        <Text style={[styles.title, { textAlign: "center", marginTop: 6 }]}>Your parcel is on its way.</Text>
        <Text style={[styles.lead, { textAlign: "center" }]}>
          Captain {captain.name.split(" ")[0]} is heading to {booking.pickup}. Each code goes to its own phone.
        </Text>
      </View>
      <View style={styles.codes}>
        <CodeCard label="PICKUP CODE" code={booking.pickupCode} who={`Sent to ${booking.sender.name.split(" ")[0]}`} phone={booking.sender.phone} />
        <CodeCard label="DELIVERY CODE" code={booking.deliveryCode} who={`Sent to ${booking.receiver.name.split(" ")[0]}`} phone={booking.receiver.phone} />
      </View>
      <View style={[styles.card, styles.captainCard]}>
        <Image source={captain.photo} style={styles.photo} />
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>Captain {captain.name}</Text>
          <Text style={styles.rowSub}>
            <Text style={{ color: colors.gold }}>★ {captain.rating.toFixed(2)}</Text> · {captain.vehicleName} · {captain.vehicleNo}
          </Text>
        </View>
        <Pressable accessibilityLabel="Call captain" onPress={() => void Linking.openURL(DESK_PHONE)} style={styles.callCaptain}>
          <Ionicons name="call" size={16} color={colors.night} />
        </Pressable>
      </View>
      <View style={[styles.card, styles.timeline]}>
        {stages.map((stage, index) => (
          <View key={stage.title} style={styles.stage}>
            <View style={styles.stageRail}>
              <View style={[styles.stageDot, stage.done && styles.stageDone]}>{stage.done ? <Ionicons name="checkmark" size={11} color={colors.night} /> : null}</View>
              {index < stages.length - 1 ? <View style={styles.stageLine} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: index < stages.length - 1 ? 16 : 0 }}>
              <Text style={[styles.stageTitle, !stage.done && { color: colors.muted }]}>{stage.title}</Text>
              <Text style={styles.rowSub}>{stage.sub}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={[styles.card, styles.fareCard]}>
        <FareLine label="Parcel" value={`${booking.item} · ${booking.vehicle === "bike" ? "Bike" : "Auto"}`} />
        <FareLine label="Distance" value={`${booking.distanceKm.toFixed(1)} km`} />
        <View style={styles.rule} />
        <View style={styles.fareTotalRow}>
          <Text style={styles.fareTotalLabel}>{booking.payment === "wallet" ? "Paid from wallet" : "Pay at pickup"}</Text>
          <Text style={styles.fareTotal}>{inr(booking.fare)}</Text>
        </View>
      </View>
    </>
  );
}

function CodeCard({ label, code: value, who, phone }: { label: string; code: string; who: string; phone: string }) {
  return (
    <View style={styles.codeCard}>
      <Text style={styles.routeLabel}>{label}</Text>
      <Text style={styles.bigCode}>{value}</Text>
      <Text style={styles.codeWho}>{who}</Text>
      <Text style={styles.rowSub}>{spaced(phone)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fillAbs: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  kicker: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 10, letterSpacing: 2.4 },
  title: { color: colors.cream, fontFamily: type.display, fontSize: 25, lineHeight: 30, letterSpacing: -0.4 },
  lead: { marginTop: 6, marginBottom: 16, color: colors.muted, fontFamily: type.body, fontSize: 14, lineHeight: 20 },
  sectionGap: { marginTop: 22, marginBottom: 10 },
  card: { backgroundColor: colors.inkwell, borderRadius: 22, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  route: { flexDirection: "row", gap: 14, padding: 14, marginBottom: 20, borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  routeRow: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: "transparent" },
  routeActive: { borderColor: colors.gold, backgroundColor: colors.night },
  routeLabel: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 9.5, letterSpacing: 1.8 },
  routeValue: { marginTop: 2, color: colors.cream, fontFamily: type.labelStrong, fontSize: 14.5 },
  routeEmpty: { color: colors.faint, fontFamily: type.label },
  search: { flexDirection: "row", alignItems: "center", gap: 10, height: 52, paddingHorizontal: 16, marginBottom: 12, borderRadius: 26, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: "rgba(214,160,0,0.4)" },
  searchInput: { flex: 1, height: 24, color: colors.cream, fontFamily: type.label, fontSize: 15, paddingVertical: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  rowTitle: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15.5 },
  rowSub: { marginTop: 2, color: colors.faint, fontFamily: type.body, fontSize: 12.5 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: "rgba(246,241,220,0.25)", alignItems: "center", justifyContent: "center" },
  radioOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  modeRow: { flexDirection: "row", gap: 10 },
  modeCard: { flex: 1, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell, overflow: "hidden" },
  modeOn: { borderColor: colors.gold, borderWidth: 1.5 },
  modePhoto: { height: 130 },
  limit: { position: "absolute", left: 10, bottom: 10, backgroundColor: colors.gold, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  limitText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 11 },
  modeCheck: { position: "absolute", top: 10, right: 10 },
  modeBody: { padding: 12 },
  modeHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  modeTitle: { color: colors.cream, fontFamily: type.display, fontSize: 19, lineHeight: 23 },
  modeFare: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 16 },
  modeLine: { marginTop: 4, color: colors.faint, fontFamily: type.body, fontSize: 12, lineHeight: 16 },
  metaRow: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { color: colors.muted, fontFamily: type.label, fontSize: 11.5 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  chipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipText: { color: colors.cream, fontFamily: type.label, fontSize: 13 },
  tip: { marginTop: 16, flexDirection: "row", gap: 10, padding: 14, borderRadius: 18, backgroundColor: "rgba(214,160,0,0.07)", borderWidth: 1, borderColor: colors.line },
  tipText: { flex: 1, color: colors.muted, fontFamily: type.body, fontSize: 12.5, lineHeight: 18 },
  form: { padding: 14, gap: 14 },
  fieldLabel: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 9.5, letterSpacing: 1.8, marginBottom: 6 },
  optional: { color: colors.faint, letterSpacing: 1.2 },
  field: { flexDirection: "row", alignItems: "center", gap: 10, height: 50, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line },
  prefix: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15 },
  input: { flex: 1, height: 24, color: colors.cream, fontFamily: type.label, fontSize: 15, paddingVertical: 0 },
  verify: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  verifySend: { borderColor: "rgba(214,160,0,0.5)" },
  verifyDone: { borderColor: colors.gold },
  verifyOpen: { flexDirection: "column", alignItems: "stretch", gap: 12, borderColor: colors.gold },
  verifyIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  verifyTitle: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 14 },
  verifySub: { marginTop: 2, color: colors.faint, fontFamily: type.body, fontSize: 12.5 },
  sendText: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 13 },
  codeRow: { flexDirection: "row", gap: 10, justifyContent: "center" },
  codeBox: { flex: 1, maxWidth: 60, height: 60, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, alignItems: "center", justifyContent: "center" },
  codeBoxOn: { borderColor: colors.gold },
  codeBoxError: { borderColor: "#E0605A" },
  codeDigit: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 24 },
  hiddenInput: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0, color: "transparent", borderWidth: 0 },
  codeFoot: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  error: { marginTop: 8, color: "#E8857F", fontFamily: type.label, fontSize: 12.5 },
  link: { color: colors.gold, fontFamily: type.labelStrong },
  ticket: { backgroundColor: colors.inkwell, borderRadius: 22, borderWidth: 1, borderColor: colors.line, padding: 16 },
  poolTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  stops: { marginTop: 14, flexDirection: "row", gap: 14 },
  stopRail: { alignItems: "center", paddingVertical: 5, width: 12 },
  stopDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.night },
  stopLine: { flex: 1, width: 1.5, backgroundColor: colors.line, marginVertical: 3 },
  stopTime: { marginTop: 2, color: colors.cream, fontFamily: type.labelStrong, fontSize: 15.5 },
  stopPoint: { color: colors.faint, fontFamily: type.body, fontSize: 12.5 },
  stopDur: { color: colors.gold, fontFamily: type.displayItalic, fontSize: 13.5 },
  contactLine: { marginTop: 3, flexDirection: "row", alignItems: "center", gap: 5 },
  fareCard: { marginTop: 12, padding: 16, gap: 8 },
  fareLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingVertical: 2 },
  fareLabel: { color: colors.faint, fontFamily: type.body, fontSize: 13.5 },
  fareValue: { flexShrink: 1, textAlign: "right", color: colors.cream, fontFamily: type.label, fontSize: 13.5 },
  rule: { height: 1, backgroundColor: colors.hairline, marginVertical: 4 },
  fareTotalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  fareTotalLabel: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 14 },
  fareTotal: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 22, lineHeight: 28 },
  agree: { marginTop: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  box: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: "rgba(246,241,220,0.3)", alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  agreeText: { flex: 1, color: colors.cream, fontFamily: type.label, fontSize: 13.5, lineHeight: 19 },
  doneTop: { alignItems: "center", paddingTop: 12, paddingBottom: 20 },
  doneRing: { width: 104, height: 104, borderRadius: 52, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  doneDisc: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  codes: { flexDirection: "row", gap: 10 },
  codeCard: { flex: 1, padding: 14, borderRadius: 20, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.gold, alignItems: "center" },
  bigCode: { marginTop: 6, color: colors.gold, fontFamily: type.labelStrong, fontSize: 32, lineHeight: 38, letterSpacing: 5 },
  codeWho: { marginTop: 4, color: colors.cream, fontFamily: type.labelStrong, fontSize: 13 },
  captainCard: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  photo: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line },
  callCaptain: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  timeline: { marginTop: 12, padding: 16 },
  stage: { flexDirection: "row", gap: 12 },
  stageRail: { alignItems: "center", width: 20 },
  stageDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.night, alignItems: "center", justifyContent: "center" },
  stageDone: { backgroundColor: colors.gold, borderColor: colors.gold },
  stageLine: { flex: 1, width: 1.5, backgroundColor: colors.line, marginTop: 2 },
  stageTitle: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 14 },
});
