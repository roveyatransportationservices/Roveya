import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CarSeats } from "../components/CarSeats";
import { CycleOptions } from "../components/Cycles";
import { CitySheet, Field, Picker, Toggle } from "../components/Form";
import { Button, Chip, Line } from "../components/kit";
import { CAR_CLASSES, buildCabin, cityById, isCaptainChair, kindForCabin, MAX_PASSENGER_SEATS, MIN_PASSENGER_SEATS, validateSeats, type LayoutKind } from "../rules";
import { service, templateSeats } from "../service";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { CarClass, Cycle, Registration, SeatCell } from "../types";

const STEPS = ["About you", "Your car", "Seat names", "Bank & payouts", "Review"];
const CARS = ["Maruti Dzire", "Toyota Etios", "Honda Amaze", "Maruti Ertiga", "Kia Carens", "Toyota Innova Crysta"];
const AMENITIES = ["Water bottle", "Phone charger", "Music", "Boot space", "Reading light", "Sanitised car"];
// The car class that usually goes with each layout, so the fare guide starts in the right place.
const CLASS_FOR: Record<LayoutKind, CarClass[]> = {
  seat4: ["Hatchback", "Sedan", "SUV"],
  seat5c: ["SUV", "Premium SUV"],
  seat6: ["SUV"],
  seat6c: ["Premium SUV", "SUV"],
  seat7: ["Premium SUV", "Traveller"],
  flex: ["Hatchback", "Sedan", "SUV", "Premium SUV", "Traveller"],
};
const plate = /^[A-Z]{2} ?[0-9]{1,2} ?[A-Z]{0,3} ?[0-9]{3,4}$/;

function toIsoDate(text: string) {
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const at = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
  return Number.isNaN(at.getTime()) || at.getUTCDate() !== Number(dd) ? null : `${yyyy}-${mm}-${dd}`;
}

function maskDate(text: string) {
  const digits = text.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join("/");
}

export function RegisterScreen() {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [cityOpen, setCityOpen] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState<string | null>("F1");

  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<Registration["gender"] | null>(null);
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("hyd");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");

  const [makeModel, setMakeModel] = useState("");
  const [carClass, setCarClass] = useState<CarClass>("Sedan");
  const [plateNo, setPlateNo] = useState("");
  const [color, setColor] = useState("");
  const [year, setYear] = useState("");
  const [ac, setAc] = useState(true);
  const [amenities, setAmenities] = useState<string[]>(["Water bottle", "Phone charger"]);

  const [layout, setLayout] = useState<LayoutKind>("seat4");
  const [seats, setSeats] = useState<SeatCell[]>(templateSeats("seat4"));

  const [bankHolder, setBankHolder] = useState("");
  const [account, setAccount] = useState("");
  const [account2, setAccount2] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [upi, setUpi] = useState("");
  const [cycle, setCycle] = useState<Cycle>("weekly");
  const [agree, setAgree] = useState(false);

  const isoDob = toIsoDate(dob);
  const adult = isoDob ? new Date(`${isoDob}T00:00:00Z`).getTime() <= Date.now() - 18 * 365.25 * 86400000 : false;
  const yearNumber = Number(year);
  const seatProblem = validateSeats(layout, seats);

  const errors: Record<string, string> = {};
  if (step === 0) {
    if (name.trim().length < 3) errors.name = "Enter your full name as on your licence.";
    if (!isoDob) errors.dob = "Use DD/MM/YYYY.";
    else if (!adult) errors.dob = "Captains must be 18 or older.";
    if (!gender) errors.gender = "Pick one.";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) errors.email = "Check the email format.";
    if (emergencyName.trim().length < 2) errors.emergencyName = "Who should we call in an emergency?";
    if (!/^[6-9]\d{9}$/.test(emergencyPhone)) errors.emergencyPhone = "Enter a 10-digit mobile number.";
  }
  if (step === 1) {
    if (makeModel.trim().length < 2) errors.makeModel = "Enter the car name, like Maruti Ertiga.";
    if (!plate.test(plateNo.trim().toUpperCase())) errors.plate = "Use the format TS09 AB 2146.";
    if (color.trim().length < 3) errors.color = "Enter the colour.";
    if (!(yearNumber >= 2005 && yearNumber <= new Date().getFullYear() + 1)) errors.year = "Cars from 2005 or later can join.";
  }
  if (step === 2 && seatProblem) errors.seats = seatProblem;
  if (step === 3) {
    if (bankHolder.trim().length < 3) errors.bankHolder = "Enter the name on the bank account.";
    if (!/^\d{9,18}$/.test(account)) errors.account = "Account numbers have 9 to 18 digits.";
    else if (account !== account2) errors.account2 = "The two account numbers do not match.";
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) errors.ifsc = "Check the IFSC code, like SBIN0001234.";
  }
  if (step === 4 && !agree) errors.agree = "Accept the captain terms to continue.";
  const show = (key: string) => (tried ? errors[key] : undefined);

  const resize = (count: number) => {
    const next = buildCabin(count, seats);
    const kind = kindForCabin(next);
    setSeats(next);
    setLayout(kind);
    setSelectedSeat(next[0]?.id ?? null);
    if (!CLASS_FOR[kind].includes(carClass)) setCarClass(CLASS_FOR[kind][0]!);
  };

  const next = async () => {
    setTried(true);
    if (Object.keys(errors).length) return;
    setTried(false);
    if (step < STEPS.length - 1) return setStep(step + 1);
    setBusy(true);
    setFailure("");
    try {
      const profile = await service.register({
        name: name.trim(),
        dob: isoDob!,
        gender: gender!,
        email: email.trim(),
        city,
        emergencyName: emergencyName.trim(),
        emergencyPhone,
        bankHolder: bankHolder.trim(),
        accountNumber: account,
        ifsc,
        upi: upi.trim(),
        payoutCycle: cycle,
        car: { makeModel: makeModel.trim(), carClass, plate: plateNo.trim().toUpperCase(), color: color.trim(), year: yearNumber, ac, amenities, layout, seats: seats.map((seat) => ({ ...seat, label: seat.label.trim() })) },
      });
      store.setProfile(profile);
    } catch (error) {
      setFailure((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const selected = seats.find((seat) => seat.id === selectedSeat) ?? null;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 6 }]}>
        <Pressable accessibilityLabel="Back" hitSlop={10} onPress={() => (step ? setStep(step - 1) : void store.signOut())} style={styles.back}>
          <Ionicons name={step ? "chevron-back" : "close"} size={20} color={colors.cream} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>
            STEP {step + 1} OF {STEPS.length}
          </Text>
          <Text style={styles.title}>{STEPS[step]}</Text>
        </View>
      </View>
      <View style={styles.progress}>
        {STEPS.map((label, index) => (
          <View key={label} style={[styles.bar, index <= step && styles.barOn]} />
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140, gap: 14 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {step === 0 ? (
          <>
            <Field label="Full name (as on licence)" value={name} onChangeText={setName} autoCapitalize="words" error={show("name")} />
            <Field label="Date of birth" value={dob} onChangeText={(text) => setDob(maskDate(text))} placeholder="DD/MM/YYYY" keyboardType="number-pad" error={show("dob")} />
            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Gender</Text>
              <View style={styles.chips}>
                {(["Male", "Female", "Other"] as const).map((value) => (
                  <Chip key={value} label={value} on={gender === value} onPress={() => setGender(value)} />
                ))}
              </View>
              {show("gender") ? <Text style={styles.error}>{show("gender")}</Text> : null}
            </View>
            <Field label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" error={show("email")} />
            <Picker label="Base city" value={cityById(city)?.name ?? ""} placeholder="Pick your city" onPress={() => setCityOpen(true)} />
            <Text style={styles.section}>EMERGENCY CONTACT</Text>
            <Field label="Name" value={emergencyName} onChangeText={setEmergencyName} autoCapitalize="words" error={show("emergencyName")} />
            <Field label="Mobile number" value={emergencyPhone} onChangeText={(text) => setEmergencyPhone(text.replace(/\D/g, "").slice(0, 10))} keyboardType="number-pad" error={show("emergencyPhone")} />
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Field label="Car name" value={makeModel} onChangeText={setMakeModel} placeholder="Maruti Ertiga" autoCapitalize="words" error={show("makeModel")} hint="Travellers see this on every trip." />
            <View style={styles.chips}>
              {CARS.map((value) => (
                <Chip key={value} label={value} on={makeModel === value} onPress={() => setMakeModel(value)} />
              ))}
            </View>
            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Car type</Text>
              <View style={styles.chips}>
                {CAR_CLASSES.map((value) => (
                  <Chip key={value} label={value} on={carClass === value} onPress={() => setCarClass(value)} />
                ))}
              </View>
            </View>
            <Field label="Number plate" value={plateNo} onChangeText={(text) => setPlateNo(text.toUpperCase().slice(0, 13))} placeholder="TS09 AB 2146" autoCapitalize="characters" error={show("plate")} />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field label="Colour" value={color} onChangeText={setColor} placeholder="Pearl white" autoCapitalize="words" error={show("color")} />
              </View>
              <View style={{ width: 120 }}>
                <Field label="Year" value={year} onChangeText={(text) => setYear(text.replace(/\D/g, "").slice(0, 4))} placeholder="2022" keyboardType="number-pad" error={show("year")} />
              </View>
            </View>
            <Toggle label="Air conditioning" sub="ROVEYA lists AC cars first" on={ac} onPress={() => setAc(!ac)} />
            <View style={{ gap: 6 }}>
              <Text style={styles.label}>What travellers get</Text>
              <View style={styles.chips}>
                {AMENITIES.map((value) => (
                  <Chip key={value} label={value} on={amenities.includes(value)} onPress={() => setAmenities((list) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]))} />
                ))}
              </View>
            </View>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text style={styles.lead}>Use + to add a seat and the small − to take one away. Two seats in a row move to the windows on their own.</Text>
            <CarSeats
              depth
              edit
              layout={layout}
              cells={seats}
              selected={selectedSeat}
              onPress={(cell) => setSelectedSeat(cell.id)}
              onAdd={seats.length < MAX_PASSENGER_SEATS ? () => resize(seats.length + 1) : undefined}
              onRemove={seats.length > MIN_PASSENGER_SEATS ? () => resize(seats.length - 1) : undefined}
            />
            {selected ? (
              <View style={styles.rename}>
                <Field
                  label={`Name for seat ${selected.id} · ${isCaptainChair(layout, selected.row) ? "captain seat" : selected.window ? "window" : "middle"}`}
                  value={selected.label}
                  onChangeText={(text) => setSeats((list) => list.map((seat) => (seat.id === selected.id ? { ...seat, label: text.slice(0, 12) } : seat)))}
                  autoCapitalize="characters"
                  maxLength={12}
                  hint="Short names work best, like F1, Front, or 2A. Tap another seat to rename it."
                  error={show("seats")}
                />
              </View>
            ) : null}
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Field label="Account holder name" value={bankHolder} onChangeText={setBankHolder} autoCapitalize="words" error={show("bankHolder")} />
            <Field label="Account number" value={account} onChangeText={(text) => setAccount(text.replace(/\D/g, "").slice(0, 18))} keyboardType="number-pad" secure error={show("account")} />
            <Field label="Confirm account number" value={account2} onChangeText={(text) => setAccount2(text.replace(/\D/g, "").slice(0, 18))} keyboardType="number-pad" error={show("account2")} />
            <Field label="IFSC" value={ifsc} onChangeText={(text) => setIfsc(text.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11))} autoCapitalize="characters" placeholder="SBIN0001234" error={show("ifsc")} />
            <Field label="UPI ID (optional)" value={upi} onChangeText={setUpi} autoCapitalize="none" placeholder="name@okbank" />
            <Text style={styles.section}>HOW OFTEN SHOULD WE PAY YOU?</Text>
            <CycleOptions value={cycle} onChange={setCycle} />
            <View style={styles.note}>
              <Ionicons name="lock-closed-outline" size={15} color={colors.gold} />
              <Text style={styles.noteText}>Once a cycle starts it runs to the end. You can switch any time, and the new cycle begins right after the current one settles.</Text>
            </View>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{name.trim()}</Text>
              <Line label="Base city" value={cityById(city)?.name ?? ""} />
              <Line label="Emergency contact" value={`${emergencyName.trim()} · ${emergencyPhone}`} />
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{makeModel.trim()}</Text>
              <Line label="Plate" value={plateNo.trim().toUpperCase()} />
              <Line label="Type" value={`${carClass} · ${ac ? "AC" : "Non-AC"} · ${year}`} />
              <Line label="Seats" value={seats.map((seat) => seat.label.trim()).join(", ")} />
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Payouts</Text>
              <Line label="Bank account" value={`•• ${account.slice(-4)} · ${ifsc}`} />
              <Line label="Cycle" value={cycle[0].toUpperCase() + cycle.slice(1)} />
            </View>
            <Pressable onPress={() => setAgree(!agree)} style={styles.agree}>
              <View style={[styles.box, agree && styles.boxOn]}>{agree ? <Ionicons name="checkmark" size={14} color={colors.night} /> : null}</View>
              <Text style={styles.agreeText}>I confirm these details are mine and accept the ROVEYA captain terms. Passengers pay the booking fee. The seat fare is mine.</Text>
            </Pressable>
            {show("agree") ? <Text style={styles.error}>{show("agree")}</Text> : null}
            <Text style={styles.lead}>Next you add photos of your licence, RC, insurance and car. ROVEYA checks them within 24 hours.</Text>
          </>
        ) : null}
        {failure ? <Text style={styles.error}>{failure}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Button label={step === STEPS.length - 1 ? (busy ? "Submitting…" : "Submit and add documents") : "Continue"} icon={step === STEPS.length - 1 ? "checkmark-circle-outline" : "arrow-forward"} loading={busy} onPress={() => void next()} />
      </View>

      <CitySheet visible={cityOpen} onClose={() => setCityOpen(false)} onPick={setCity} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  back: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell, alignItems: "center", justifyContent: "center" },
  kicker: { color: colors.gold, fontFamily: type.semibold, fontSize: 10.5, letterSpacing: 2 },
  title: { marginTop: 2, color: colors.cream, fontFamily: type.semibold, fontSize: 19 },
  progress: { flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingBottom: 6 },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.mist },
  barOn: { backgroundColor: colors.gold },
  label: { color: colors.muted, fontFamily: type.medium, fontSize: 12.5 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  error: { color: colors.danger, fontFamily: type.regular, fontSize: 12.5, lineHeight: 18 },
  section: { marginTop: 8, color: colors.gold, fontFamily: type.semibold, fontSize: 11, letterSpacing: 2 },
  lead: { color: colors.muted, fontFamily: type.regular, fontSize: 13.5, lineHeight: 20 },
  counts: { gap: 8 },
  count: { padding: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell },
  countOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  countTitle: { color: colors.cream, fontFamily: type.semibold, fontSize: 15 },
  countSeats: { color: colors.gold, fontFamily: type.medium, fontSize: 11.5 },
  countLine: { marginTop: 2, color: colors.faint, fontFamily: type.regular, fontSize: 11.5 },
  rename: { padding: 14, borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  note: { flexDirection: "row", gap: 8, padding: 12, borderRadius: 14, backgroundColor: "rgba(214,160,0,0.08)", borderWidth: 1, borderColor: colors.line },
  noteText: { flex: 1, color: colors.muted, fontFamily: type.regular, fontSize: 12.5, lineHeight: 18 },
  card: { padding: 16, borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  cardTitle: { color: colors.cream, fontFamily: type.semibold, fontSize: 16, marginBottom: 6 },
  agree: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.faint, alignItems: "center", justifyContent: "center", marginTop: 1 },
  boxOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  agreeText: { flex: 1, color: colors.cream, fontFamily: type.regular, fontSize: 13, lineHeight: 19 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.inkwell, borderTopWidth: 1, borderTopColor: colors.line },
});
