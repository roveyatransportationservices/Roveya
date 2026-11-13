import { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { BannerCarousel } from "../components/BannerCarousel";
import { CoverPhoto } from "../components/CoverPhoto";
import { art, slide } from "../banners";
import { api, live } from "../backend";
import { pickDocumentPhoto, uploadDocument } from "../documents";
import { captainFromServer, docsFromServer, isoDob, type ServerCaptain, type ServerDocument } from "../remote";
import { Field } from "../components/Field";
import { Group, Line, ListRow, PageShell, Pill, SectionTitle, page } from "../components/PageShell";
import { FlowCta, StepShell, type FlowIcon, type TrailItem } from "../components/StepShell";
import { cities, colorsList, DESK_PHONE, services, vehicleTitle } from "../data";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { CaptainStack } from "../navigation";
import type { DocKey, DocStatus, VehicleKind } from "../types";

const steps = ["Service", "City", "Details", "Vehicle", "Documents", "Bank", "Review"];

export const docInfo: Record<DocKey, { title: string; line: string; icon: FlowIcon }> = {
  dlFront: { title: "Driving licence · front", line: "Name, photo, and licence number clear", icon: "card-outline" },
  dlBack: { title: "Driving licence · back", line: "Vehicle classes and validity", icon: "card-outline" },
  rc: { title: "Vehicle RC", line: "Registration certificate of your vehicle", icon: "document-text-outline" },
  aadhaar: { title: "Aadhaar card", line: "Front side with your photo", icon: "finger-print-outline" },
  pan: { title: "PAN card", line: "For payouts and tax records", icon: "id-card-outline" },
  selfie: { title: "Profile selfie", line: "Face the camera in good light", icon: "camera-outline" },
};

const docOrder: DocKey[] = ["selfie", "dlFront", "dlBack", "rc", "aadhaar", "pan"];
const years = ["2026", "2025", "2024", "2023", "2022", "2021", "2020", "2019", "Older"];
const genders = ["Male", "Female", "Other"];
const plateRule = /^[A-Z]{2}\s?\d{1,2}\s?[A-Z]{0,3}\s?\d{3,4}$/;
const ifscRule = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const dobRule = /^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])\/(19|20)\d{2}$/;

function age(dob: string) {
  const [d, m, y] = dob.split("/").map(Number);
  const born = new Date(y, m - 1, d);
  const now = new Date();
  return now.getFullYear() - born.getFullYear() - (now < new Date(now.getFullYear(), m - 1, d) ? 1 : 0);
}

function formatDob(text: string) {
  const digits = text.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function RegisterScreen({ route, navigation }: NativeStackScreenProps<CaptainStack, "Register">) {
  const store = useStore();
  const phone = route.params.phone;
  const [step, setStep] = useState(0);
  const [vehicle, setVehicle] = useState<VehicleKind | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [plate, setPlate] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [year, setYear] = useState<string | null>(null);
  const [docs, setDocs] = useState<Record<DocKey, DocStatus>>({ dlFront: "missing", dlBack: "missing", rc: "missing", aadhaar: "missing", pan: "missing", selfie: "missing" });
  const [uploading, setUploading] = useState<DocKey | null>(null);
  const [holder, setHolder] = useState("");
  const [account, setAccount] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [upi, setUpi] = useState("");
  const [agreed, setAgreed] = useState(false);

  const dobOk = dobRule.test(dob) && age(dob) >= 18;
  const emailOk = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const detailsOk = name.trim().length >= 3 && dobOk && Boolean(gender) && emailOk && emergencyName.trim().length >= 2 && /^[6-9]\d{9}$/.test(emergencyPhone);
  const plateOk = plateRule.test(plate.trim());
  const vehicleOk = plateOk && model.trim().length >= 2 && Boolean(color) && Boolean(year);
  const docsOk = docs.selfie !== "missing" && docs.dlFront !== "missing" && docs.dlBack !== "missing" && docs.rc !== "missing" && (docs.aadhaar !== "missing" || docs.pan !== "missing");
  const bankOk = holder.trim().length >= 3 && /^\d{9,18}$/.test(account) && account === confirm && ifscRule.test(ifsc);
  const ready = [Boolean(vehicle), Boolean(city), detailsOk, vehicleOk, docsOk, bankOk, agreed][step];

  const go = (next: number) => setStep(Math.max(0, Math.min(steps.length - 1, next)));
  const back = () => (step === 0 ? navigation.goBack() : go(step - 1));

  const [photos, setPhotos] = useState<Partial<Record<DocKey, string>>>({});
  const [docError, setDocError] = useState("");

  // Live builds keep the photo on the phone until the captain account exists, then upload it.
  const upload = async (doc: DocKey) => {
    if (uploading) return;
    setDocError("");
    if (live) {
      try {
        const uri = await pickDocumentPhoto(doc);
        if (!uri) return;
        setPhotos((all) => ({ ...all, [doc]: uri }));
        setDocs((all) => ({ ...all, [doc]: "uploaded" }));
      } catch (error) {
        setDocError(error instanceof Error ? error.message : "We could not open the camera.");
      }
      return;
    }
    setUploading(doc);
    setTimeout(() => {
      setDocs((all) => ({ ...all, [doc]: "uploaded" }));
      setUploading(null);
    }, 1100);
  };

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savingNote, setSavingNote] = useState("");

  const submit = async () => {
    if (!vehicle || !city || !gender || !color || !year) return;
    if (live) {
      setSaving(true);
      setSaveError("");
      try {
        const result = await api<{ captain: ServerCaptain }>("/captain/register", {
          body: {
            name: name.trim(),
            dob: isoDob(dob),
            gender,
            email: email.trim(),
            city,
            vehicle,
            vehicleNo: plate.trim().toUpperCase(),
            vehicleModel: model.trim(),
            vehicleColor: color,
            vehicleYear: year,
            bankHolder: holder.trim(),
            accountNumber: account,
            ifsc,
            upi: upi.trim(),
            emergencyName: emergencyName.trim(),
            emergencyPhone,
          },
        });
        const sent = { ...docs };
        const pending = (Object.entries(photos) as [DocKey, string][]).filter(([, uri]) => Boolean(uri));
        for (const [index, [doc, uri]] of pending.entries()) {
          setSavingNote(`Uploading documents ${index + 1} of ${pending.length}…`);
          await uploadDocument(doc, uri).catch(() => {
            sent[doc] = "missing";
          });
        }
        store.register({ ...captainFromServer(result.captain), docs: sent });
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "We could not submit your details. Try again.");
      } finally {
        setSaving(false);
        setSavingNote("");
      }
      return;
    }
    store.register({
      phone,
      name: name.trim(),
      dob,
      gender,
      email: email.trim(),
      city,
      vehicle,
      vehicleNo: plate.trim().toUpperCase(),
      vehicleModel: model.trim(),
      vehicleColor: color,
      vehicleYear: year,
      bankHolder: holder.trim(),
      bankLast4: account.slice(-4),
      ifsc,
      upi: upi.trim(),
      docs,
      status: "review",
      captainId: `RC${String(Date.now()).slice(-6)}`,
      joinedAt: Date.now(),
      emergencyName: emergencyName.trim(),
      emergencyPhone,
    });
  };

  const trail: TrailItem[] = [
    { step: 0, icon: "speedometer-outline", label: vehicle ? vehicleTitle[vehicle] : "Service" },
    { step: 1, icon: "location-outline", label: city ?? "City" },
    { step: 2, icon: "person-outline", label: name.trim().split(" ")[0] || "Details" },
    { step: 3, icon: "car-outline", label: plate.trim() || "Vehicle" },
    { step: 4, icon: "document-text-outline", label: "Documents" },
    { step: 5, icon: "card-outline", label: account ? `••${account.slice(-4)}` : "Bank" },
  ];

  const pickAndGo = (next: () => void) => {
    next();
    setTimeout(() => go(step + 1), 220);
  };

  return (
    <StepShell
      kicker="BECOME A CAPTAIN"
      steps={steps}
      step={step}
      trail={trail}
      onBack={back}
      onTrail={go}
      footer={<FlowCta label={step === steps.length - 1 ? (saving ? "Submitting…" : "Submit for verification") : "Continue"} icon={step === steps.length - 1 ? "checkmark" : "arrow-forward"} disabled={!ready || saving} onPress={step === steps.length - 1 ? () => void submit() : () => go(step + 1)} />}
    >
      {step === 0 ? (
        <>
          <BannerCarousel
            style={{ marginBottom: 18 }}
            slides={[
              slide(art.earn, "JOIN FREE", "Registration takes about 10 minutes"),
              slide(art.ride, "PAYOUTS", "Your earnings reach your bank twice a week"),
              slide(art.auto, "EVERY SERVICE", "Bike, auto, and cab captains are welcome"),
            ]}
          />
          <Text style={styles.title}>What will you drive?</Text>
          <Text style={styles.lead}>Pick the service you want ride requests for.</Text>
          <View style={{ gap: 12 }}>
            {services.map((item) => {
              const on = vehicle === item.kind;
              return (
                <Pressable key={item.kind} onPress={() => pickAndGo(() => setVehicle(item.kind))} style={[styles.service, on && styles.serviceOn]}>
                  <CoverPhoto source={item.photo} ratio={item.ratio} focus={0.4} focusX={item.focusX} style={styles.servicePhoto} />
                  <View style={{ flex: 1 }}>
                    <Text style={page.name}>{item.title} captain</Text>
                    <Text style={page.small}>{item.line}</Text>
                  </View>
                  <View style={[styles.radio, on && styles.radioOn]}>{on ? <Ionicons name="checkmark" size={14} color={colors.night} /> : null}</View>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : step === 1 ? (
        <>
          <Text style={styles.title}>Which city do you drive in?</Text>
          <Text style={styles.lead}>Ride requests come from the city you pick.</Text>
          <Group>
            {cities.map((item, index) => {
              const on = city === item;
              return (
                <Pressable key={item} onPress={() => pickAndGo(() => setCity(item))} style={[styles.row, index < cities.length - 1 && styles.rowLine, on && { backgroundColor: colors.mist }]}>
                  <View style={styles.rowIcon}>
                    <Ionicons name="location-outline" size={17} color={colors.gold} />
                  </View>
                  <Text style={[page.name, { flex: 1 }]}>{item}</Text>
                  <View style={[styles.radio, on && styles.radioOn]}>{on ? <Ionicons name="checkmark" size={14} color={colors.night} /> : null}</View>
                </Pressable>
              );
            })}
          </Group>
        </>
      ) : step === 2 ? (
        <>
          <Text style={styles.title}>Tell us about you</Text>
          <Text style={styles.lead}>Match the name on your driving licence.</Text>
          <View style={[page.card, { gap: 14 }]}>
            <Field label="Full name" value={name} onChangeText={setName} placeholder="As on your licence" autoCapitalize="words" />
            <Field label="Date of birth" value={dob} onChangeText={(text) => setDob(formatDob(text))} placeholder="DD/MM/YYYY" keyboardType="number-pad" error={dob.length === 10 && !dobOk ? "Captains must be 18 or older." : undefined} />
            <View>
              <Text style={page.label}>Gender</Text>
              <View style={styles.chips}>
                {genders.map((item) => (
                  <Pressable key={item} onPress={() => setGender(item)} style={[styles.chip, gender === item && styles.chipOn]}>
                    <Text style={[styles.chipText, gender === item && { color: colors.night }]}>{item}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <Field label="Email · optional" value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" error={!emailOk ? "Check the email format." : undefined} />
          </View>
          <SectionTitle>EMERGENCY CONTACT</SectionTitle>
          <View style={[page.card, { gap: 14 }]}>
            <Field label="Contact name" value={emergencyName} onChangeText={setEmergencyName} placeholder="Family member or friend" autoCapitalize="words" />
            <Field label="Contact mobile" prefix="+91" value={emergencyPhone} onChangeText={(text) => setEmergencyPhone(text.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile" keyboardType="phone-pad" />
          </View>
        </>
      ) : step === 3 ? (
        <>
          <Text style={styles.title}>Your {vehicle ? vehicleTitle[vehicle].toLowerCase() : "vehicle"}</Text>
          <Text style={styles.lead}>Passengers see the number plate before you arrive.</Text>
          <View style={[page.card, { gap: 14 }]}>
            <Field label="Number plate" value={plate} onChangeText={(text) => setPlate(text.toUpperCase().replace(/[^A-Z0-9 ]/g, "").slice(0, 13))} placeholder="TS09 AB 2146" autoCapitalize="characters" error={plate.length > 6 && !plateOk ? "Use the format TS09 AB 2146." : undefined} />
            <Field label="Make and model" value={model} onChangeText={setModel} placeholder={vehicle === "auto" ? "Bajaj RE" : vehicle === "cab" ? "Maruti Ertiga" : "Honda SP 125"} autoCapitalize="words" />
            <View>
              <Text style={page.label}>Colour</Text>
              <View style={styles.chips}>
                {colorsList.map((item) => (
                  <Pressable key={item} onPress={() => setColor(item)} style={[styles.chip, color === item && styles.chipOn]}>
                    <Text style={[styles.chipText, color === item && { color: colors.night }]}>{item}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View>
              <Text style={page.label}>Registration year</Text>
              <View style={styles.chips}>
                {years.map((item) => (
                  <Pressable key={item} onPress={() => setYear(item)} style={[styles.chip, year === item && styles.chipOn]}>
                    <Text style={[styles.chipText, year === item && { color: colors.night }]}>{item}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </>
      ) : step === 4 ? (
        <>
          <Text style={styles.title}>Upload documents</Text>
          <Text style={styles.lead}>Clear photos, all four corners in view. Aadhaar or PAN, one is enough.</Text>
          <View style={{ gap: 10 }}>
            {docOrder.map((doc) => (
              <DocTile key={doc} doc={doc} status={docs[doc]} busy={uploading === doc} photo={photos[doc]} onPress={() => void upload(doc)} />
            ))}
          </View>
          {docError ? <Text style={[page.small, { color: colors.goldBright }]}>{docError}</Text> : null}
          <View style={page.note}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.gold} />
            <Text style={page.noteText}>Documents are used only to verify you as a captain.</Text>
          </View>
        </>
      ) : step === 5 ? (
        <>
          <Text style={styles.title}>Where should we pay you?</Text>
          <Text style={styles.lead}>Wallet earnings are redeemed to this account.</Text>
          <View style={[page.card, { gap: 14 }]}>
            <Field label="Account holder name" value={holder} onChangeText={setHolder} placeholder="As on your passbook" autoCapitalize="words" />
            <Field label="Account number" value={account} onChangeText={(text) => setAccount(text.replace(/\D/g, "").slice(0, 18))} placeholder="9 to 18 digits" keyboardType="number-pad" secureTextEntry />
            <Field label="Confirm account number" value={confirm} onChangeText={(text) => setConfirm(text.replace(/\D/g, "").slice(0, 18))} placeholder="Type it again" keyboardType="number-pad" error={confirm.length >= 9 && confirm !== account ? "The numbers do not match." : undefined} />
            <Field label="IFSC" value={ifsc} onChangeText={(text) => setIfsc(text.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11))} placeholder="SBIN0001234" autoCapitalize="characters" error={ifsc.length === 11 && !ifscRule.test(ifsc) ? "Check the IFSC code." : undefined} />
            <Field label="UPI ID · optional" value={upi} onChangeText={setUpi} placeholder="name@bank" autoCapitalize="none" />
          </View>
        </>
      ) : (
        <>
          <Text style={styles.title}>Review and submit</Text>
          <Text style={styles.lead}>Tap a chip at the top to change anything.</Text>
          <View style={page.card}>
            <Line label="Service" value={vehicle ? `${vehicleTitle[vehicle]} captain` : "—"} />
            <Line label="City" value={city ?? "—"} />
            <Line label="Name" value={name.trim()} />
            <Line label="Mobile" value={`+91 ${phone}`} />
            <Line label="Date of birth" value={dob} />
            <Line label="Vehicle" value={`${model.trim()} · ${color ?? ""}`} />
            <Line label="Number plate" value={plate.trim()} />
            <Line label="Documents" value={`${Object.values(docs).filter((value) => value !== "missing").length} uploaded`} />
            <Line label="Bank" value={`••${account.slice(-4)} · ${ifsc}`} />
          </View>
          {saveError ? <Text style={[page.small, { marginTop: 12, color: colors.goldBright }]}>{saveError}</Text> : null}
          {savingNote ? <Text style={[page.small, { marginTop: 12 }]}>{savingNote}</Text> : null}
          <Pressable onPress={() => setAgreed((value) => !value)} style={styles.agree}>
            <View style={[styles.check, agreed && styles.checkOn]}>{agreed ? <Ionicons name="checkmark" size={14} color={colors.night} /> : null}</View>
            <Text style={[page.lead, { flex: 1 }]}>
              I am 18 or older, the details are mine, and I agree to the{" "}
              <Text style={{ color: colors.gold }} onPress={() => navigation.navigate("Terms")}>
                captain terms
              </Text>
              .
            </Text>
          </Pressable>
        </>
      )}
    </StepShell>
  );
}

function DocTile({ doc, status, busy, photo, onPress }: { doc: DocKey; status: DocStatus; busy: boolean; photo?: string; onPress: () => void }) {
  const info = docInfo[doc];
  const done = status !== "missing";
  return (
    <Pressable onPress={onPress} disabled={busy} style={({ pressed }) => [styles.doc, done && styles.docDone, pressed && { borderColor: colors.gold }]}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.docThumb} />
      ) : (
        <View style={[styles.docIcon, done && styles.docIconDone]}>
          {busy ? <ActivityIndicator size="small" color={colors.gold} /> : <Ionicons name={done ? "checkmark" : info.icon} size={18} color={done ? colors.night : colors.gold} />}
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={page.name}>{info.title}</Text>
        <Text style={page.small}>{busy ? "Uploading…" : done ? "Uploaded · tap to replace" : info.line}</Text>
      </View>
      {done ? <Pill label="Added" /> : <Ionicons name="cloud-upload-outline" size={20} color={colors.gold} />}
    </Pressable>
  );
}

const stages: { title: string; line: string; icon: FlowIcon }[] = [
  { title: "Account created", line: "Your number is verified", icon: "person-outline" },
  { title: "Documents submitted", line: "Licence, RC, ID, and selfie", icon: "document-text-outline" },
  { title: "Verification", line: "The team checks every document", icon: "shield-checkmark-outline" },
  { title: "Captain training", line: "4 short videos on safety and service", icon: "play-circle-outline" },
  { title: "Go on duty", line: "Start taking ride requests", icon: "speedometer-outline" },
];

const lessons = ["Taking a ride request", "Ride OTP and safety", "Passenger care", "Wallet and payouts"];

export function VerificationScreen({ navigation }: NativeStackScreenProps<CaptainStack, "Verification">) {
  const store = useStore();
  const captain = store.captain;
  const [watched, setWatched] = useState<string[]>([]);
  const [approving, setApproving] = useState(false);
  const trained = watched.length === lessons.length;
  const stateOf = (index: number) => (index < 2 || (index === 2 && approving) || (index === 3 && trained) ? "done" : index === 4 ? "next" : "now");

  useEffect(() => {
    if (!approving) return;
    const timer = setTimeout(() => store.approve(), 1800);
    return () => clearTimeout(timer);
  }, [approving]);

  const storeRef = useRef(store);
  storeRef.current = store;

  useEffect(() => {
    if (!live) return;
    const check = () =>
      void api<{ captain: ServerCaptain; documents: ServerDocument[] }>("/captain/me")
        .then((result) => {
          const latest = storeRef.current;
          const { docs, docNotes } = docsFromServer(result.documents);
          if (result.captain.status === "active") latest.approve();
          else if (JSON.stringify(docs) !== JSON.stringify(latest.captain?.docs) || JSON.stringify(docNotes) !== JSON.stringify(latest.captain?.docNotes ?? {})) latest.updateCaptain({ docs, docNotes });
        })
        .catch(() => undefined);
    check();
    const timer = setInterval(check, 8000);
    return () => clearInterval(timer);
  }, []);

  if (!captain) return null;
  return (
    <PageShell
      kicker="CAPTAIN ACCOUNT"
      title="Under verification"
      onBack={() => store.signOut()}
      footer={
        live ? (
          <FlowCta label={trained ? "Waiting for the ROVEYA desk to approve" : "Finish the training first"} icon="hourglass-outline" disabled onPress={() => undefined} />
        ) : (
          <FlowCta label={approving ? "Activating your account…" : trained ? "Activate my account" : "Finish the training first"} icon="checkmark" disabled={!trained || approving} onPress={() => setApproving(true)} />
        )
      }
    >
      <LinearGradient colors={[colors.burgundy, colors.plum, colors.inkwell]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[page.heroCard, { alignItems: "center" }]}>
        <View style={styles.reviewRing}>
          <View style={styles.reviewDisc}>{approving ? <ActivityIndicator color={colors.night} /> : <Ionicons name="hourglass-outline" size={30} color={colors.night} />}</View>
        </View>
        <Text style={[page.title, { marginTop: 14, textAlign: "center" }]}>Thanks, {captain.name.split(" ")[0]}.</Text>
        <Text style={[page.lead, { textAlign: "center", marginTop: 4 }]}>Your {vehicleTitle[captain.vehicle].toLowerCase()} captain account is in review. Finish the training while we check your documents.</Text>
        <View style={styles.idChip}>
          <Text style={styles.idText}>CAPTAIN ID {captain.captainId}</Text>
        </View>
      </LinearGradient>

      {live ? (
        <Pressable onPress={() => navigation.navigate("Documents")} style={[page.card, styles.docsLink]}>
          <Ionicons name={Object.values(captain.docs).includes("rejected") ? "alert-circle-outline" : "document-text-outline"} size={20} color={colors.gold} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={page.name}>{Object.values(captain.docs).includes("rejected") ? "The desk needs a fresh photo" : "Your documents"}</Text>
            <Text style={page.small} numberOfLines={2}>
              {Object.values(captain.docNotes ?? {})[0] ?? `${Object.values(captain.docs).filter((status) => status !== "missing").length} uploaded · tap to add or replace`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.faint} />
        </Pressable>
      ) : null}

      <BannerCarousel
        style={{ marginTop: 14 }}
        slides={[
          slide(art.ride, "WHILE YOU WAIT", "Watch the four training videos below"),
          slide(art.cab, "THE ROVEYA WAY", "Courteous, safe, and on time, every ride"),
          slide(art.earn, "FIRST PAYOUT", "Redeem your first earnings from ₹100"),
        ]}
      />
      <SectionTitle>YOUR PROGRESS</SectionTitle>
      <View style={page.card}>
        {stages.map((stage, index) => {
          const state = stateOf(index);
          return (
            <View key={stage.title} style={styles.stage}>
              <View style={styles.stageRail}>
                <View style={[styles.stageDot, state === "done" && styles.stageDone, state === "now" && styles.stageNow]}>
                  {state === "done" ? <Ionicons name="checkmark" size={13} color={colors.night} /> : <Ionicons name={stage.icon} size={13} color={state === "now" ? colors.gold : colors.faint} />}
                </View>
                {index < stages.length - 1 ? <View style={[styles.stageLine, state === "done" && { backgroundColor: colors.gold }]} /> : null}
              </View>
              <View style={{ flex: 1, paddingBottom: index < stages.length - 1 ? 18 : 0 }}>
                <Text style={[page.name, state === "next" && { color: colors.faint }]}>{stage.title}</Text>
                <Text style={page.small}>{state === "now" && index === 2 ? "In progress · usually within 24 hours" : state === "now" && index === 3 ? `${watched.length} of ${lessons.length} videos watched` : stage.line}</Text>
              </View>
            </View>
          );
        })}
      </View>

      <SectionTitle>CAPTAIN TRAINING</SectionTitle>
      <Group>
        {lessons.map((lesson, index) => {
          const done = watched.includes(lesson);
          return (
            <ListRow
              key={lesson}
              icon={done ? "checkmark-circle" : "play-circle-outline"}
              label={`${index + 1}. ${lesson}`}
              sub={done ? "Watched" : "3 min video · tap to watch"}
              last={index === lessons.length - 1}
              chevron={false}
              right={done ? <Pill label="Done" /> : <Ionicons name="play" size={16} color={colors.gold} />}
              onPress={() => setWatched((list) => (done ? list : [...list, lesson]))}
            />
          );
        })}
      </Group>

      <SectionTitle>NEED HELP?</SectionTitle>
      <Group>
        <ListRow icon="call-outline" label="Call the captain desk" sub="Daily, 5:00 AM to 11:00 PM" onPress={() => void Linking.openURL(DESK_PHONE)} />
        <ListRow icon="help-buoy-outline" label="Help and FAQs" sub="Documents, payouts, and rides" onPress={() => navigation.navigate("Help")} />
        <ListRow icon="log-out-outline" label="Log out" sub={`+91 ${captain.phone}`} last chevron={false} onPress={() => store.signOut()} />
      </Group>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.cream, fontFamily: type.display, fontSize: 25, lineHeight: 30, letterSpacing: -0.4 },
  lead: { marginTop: 6, marginBottom: 16, color: colors.muted, fontFamily: type.body, fontSize: 14, lineHeight: 20 },
  service: { flexDirection: "row", alignItems: "center", gap: 14, padding: 10, paddingRight: 14, borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  serviceOn: { borderColor: colors.gold, backgroundColor: colors.mist },
  servicePhoto: { width: 84, height: 72, borderRadius: 16 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: "rgba(246,241,220,0.25)", alignItems: "center", justifyContent: "center" },
  radioOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line },
  chipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipText: { color: colors.cream, fontFamily: type.label, fontSize: 13 },
  doc: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 20, backgroundColor: colors.inkwell, borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(214,160,0,0.4)" },
  docDone: { borderStyle: "solid", borderColor: colors.line },
  docIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  docThumb: { width: 42, height: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.gold },
  docsLink: { marginTop: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  docIconDone: { backgroundColor: colors.gold, borderColor: colors.gold },
  agree: { marginTop: 16, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  check: { marginTop: 2, width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: "rgba(246,241,220,0.3)", alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  reviewRing: { width: 96, height: 96, borderRadius: 48, borderWidth: 1, borderColor: colors.gold, alignItems: "center", justifyContent: "center" },
  reviewDisc: { width: 74, height: 74, borderRadius: 37, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  idChip: { marginTop: 14, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: "rgba(18,6,13,0.45)", borderWidth: 1, borderColor: colors.line },
  idText: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 11, letterSpacing: 1.6 },
  stage: { flexDirection: "row", gap: 12 },
  stageRail: { width: 26, alignItems: "center" },
  stageDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, alignItems: "center", justifyContent: "center" },
  stageDone: { backgroundColor: colors.gold, borderColor: colors.gold },
  stageNow: { borderColor: colors.gold, borderWidth: 1.5 },
  stageLine: { flex: 1, width: 1.5, backgroundColor: colors.line, marginVertical: 2 },
});
