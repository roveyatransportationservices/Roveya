import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button, Header, Icon, Rating, Sheet, Skeleton, Tag, inr } from "../components/kit";
import { SeatLegend, SeatMap } from "../components/SeatMap";
import { bookingFeeForSeat, bookingFeeForSeats } from "../bookingFee";
import { formatInrPaise, percentRefundPaise } from "../refundPolicy";
import { amenityIcons, cancellationSlabs, cityById, departureDate, travelPolicy } from "../data";
import { useTrip } from "../remote";
import { dayLabel } from "../dates";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { Seat, StopPoint, Trip } from "../types";
import type { UserStack } from "../navigation";

const MAX_SEATS = 4;

type InfoTab = "ratings" | "boarding" | "drops" | "cancellation" | "policy" | "amenities";

const infoTabs: [InfoTab, string][] = [
  ["ratings", "Ratings"],
  ["boarding", "Boarding points"],
  ["drops", "Drop points"],
  ["cancellation", "Cancellation"],
  ["policy", "Travel policy"],
  ["amenities", "Amenities"],
];

export function SeatsScreen({ route, navigation }: NativeStackScreenProps<UserStack, "Seats">) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const { trip, loading, error } = useTrip(route.params.tripId);
  const [selected, setSelected] = useState<string[]>([]);
  const [senior, setSenior] = useState(false);
  const [info, setInfo] = useState<InfoTab | null>(null);
  const [note, setNote] = useState<{ tone: "women" | "info"; text: string } | null>(null);

  // Another traveller can take a seat while this one is choosing.
  useEffect(() => {
    if (!trip) return;
    const gone = selected.filter((id) => {
      const seat = trip.seats.find((item) => item.id === id);
      return !seat || seat.state === "booked" || seat.state === "bookedFemale";
    });
    if (!gone.length) return;
    setSelected((list) => list.filter((id) => !gone.includes(id)));
    setNote({ tone: "info", text: `Seat ${gone.map((id) => trip.seats.find((item) => item.id === id)?.label ?? id).join(", ")} was just booked by someone else. Pick another seat.` });
  }, [trip, selected]);

  if (!trip) {
    return (
      <View style={styles.screen}>
        <Header title={loading ? "Loading seats…" : "Trip not found"} onBack={() => navigation.goBack()} />
        {loading ? (
          <View style={[styles.mapSkeleton, { marginTop: 70 }]}>
            <Skeleton width={180} height={30} radius={18} style={{ alignSelf: "center" }} />
            {[0, 1, 2].map((row) => (
              <View key={row} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Skeleton width={66} height={72} radius={14} />
                <Skeleton width={66} height={72} radius={14} />
                <Skeleton width={66} height={72} radius={14} />
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.noteText, { padding: 24, textAlign: "center" }]}>{error || "This trip is no longer available."}</Text>
        )}
      </View>
    );
  }

  const chosen = trip.seats.filter((seat) => selected.includes(seat.id));
  const subtotal = chosen.reduce((sum, seat) => sum + seat.price, 0);
  const seniorOff = senior ? Math.round(subtotal * 0.1) : 0;
  const bill = bookingFeeForSeats(chosen.map((seat) => (senior ? Math.round(seat.price * 0.9) : seat.price)));

  const toggle = (seat: Seat) => {
    if (seat.state === "booked" || seat.state === "bookedFemale") {
      setNote({ tone: "info", text: `Seat ${seat.label} is already booked${seat.state === "bookedFemale" ? " by a woman traveller" : ""}. Pick a seat with a price on it.` });
      return;
    }
    if (selected.includes(seat.id)) {
      setSelected((list) => list.filter((id) => id !== seat.id));
      setNote(null);
      return;
    }
    if (selected.length >= MAX_SEATS) {
      setNote({ tone: "info", text: `You can book up to ${MAX_SEATS} seats in one booking.` });
      return;
    }
    setNote(seat.state === "female" ? { tone: "women", text: `Seat ${seat.label} is next to a woman traveller, so it is reserved for a woman. The traveller on this seat is set to Female on the next step.` } : null);
    setSelected((list) => [...list, seat.id]);
  };

  const proceed = () => {
    store.startDraft(trip, chosen.map((seat) => (senior ? { ...seat, price: Math.round(seat.price * 0.9) } : seat)));
    if (!store.user) {
      navigation.navigate("Login", { next: "Points" });
      return;
    }
    navigation.navigate("Points");
  };

  return (
    <View style={styles.screen}>
      <Header
        title={`${cityById(trip.fromId).name} → ${cityById(trip.toId).name}`}
        subtitle={`${dayLabel(trip.date)}, ${trip.departAt} · ${trip.operator}`}
        onBack={() => navigation.goBack()}
        right={
          <Pressable onPress={() => navigation.navigate("WomenZone")} style={styles.women}>
            <Icon name="mc:face-woman-outline" size={16} color={colors.rose} />
            <Text style={styles.womenText}>Women Zone</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 200 }}>
        <SeatLegend />
        <SeatMap trip={trip} selected={selected} onToggle={toggle} />
        {note ? (
          <View style={[styles.note, note.tone === "info" && styles.noteInfo]}>
            <Icon name={note.tone === "women" ? "mc:face-woman-outline" : "information-circle-outline"} size={17} color={note.tone === "women" ? colors.rose : colors.gold} />
            <Text style={styles.noteText}>{note.text}</Text>
          </View>
        ) : null}
        {store.live ? null : (
          <Pressable onPress={() => setSenior((value) => !value)} style={[styles.senior, senior && styles.seniorOn]}>
            <View style={[styles.radio, senior && styles.radioOn]}>{senior ? <Ionicons name="checkmark" size={12} color={colors.night} /> : null}</View>
            <Icon name="mc:human-cane" size={18} />
            <Text style={styles.seniorText}>Senior citizen · 10% off</Text>
          </Pressable>
        )}

        <View style={styles.detail}>
          <View style={styles.detailHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.operator}>{trip.operator}</Text>
              <Text style={styles.car}>{trip.car} · {trip.carClass} · AC · {trip.seats.length} seats</Text>
            </View>
            <Rating value={trip.rating} count={trip.reviews} />
          </View>
          <View style={styles.tagRow}>
            <Tag label={trip.carAge} icon="mc:star-four-points-outline" />
            {trip.womenFriendly ? <Tag label="Women friendly" icon="mc:face-woman-outline" /> : null}
            {trip.assured ? <Tag label="ROVEYA assured" icon="mc:shield-check-outline" /> : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 14 }}>
            {infoTabs.map(([key, label]) => (
              <Pressable key={key} onPress={() => setInfo(key)} style={styles.infoChip}>
                <Text style={styles.infoChipText}>{label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {chosen.length ? (
          <View style={styles.summary}>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryTitle}>{chosen.length} seat{chosen.length > 1 ? "s" : ""} · {chosen.map((seat) => seat.label).join(", ")}</Text>
              <Text style={styles.summarySub}>{senior ? `Senior saving ${inr(seniorOff)} · ` : ""}Seat {inr(bill.seatPrice)} · Booking fee {inr(bill.fee)} · GST {inr(bill.gst)}</Text>
            </View>
            <Text style={styles.summaryFare}>{inr(bill.passengerPays)}</Text>
          </View>
        ) : (
          <Text style={styles.pick}>Tap a seat in the car to select it</Text>
        )}
        <Button label={chosen.length ? "Select boarding and drop" : "Select seats"} icon="arrow-forward" disabled={!chosen.length} onPress={proceed} />
      </View>

      <Sheet visible={info !== null} onClose={() => setInfo(null)} title={infoTabs.find(([key]) => key === info)?.[1]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
          {infoTabs.map(([key, label]) => (
            <Pressable key={key} onPress={() => setInfo(key)} style={[styles.infoChip, info === key && styles.infoChipOn]}>
              <Text style={[styles.infoChipText, info === key && { color: colors.night }]}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {info ? <TripInfo trip={trip} tab={info} /> : null}
      </Sheet>
    </View>
  );
}

const ratingSplit = [0.68, 0.2, 0.07, 0.03, 0.02];
const praises = ["Clean car", "On time", "Polite captain", "Smooth driving", "Comfortable seats"];

function Points({ list }: { list: StopPoint[] }) {
  return (
    <View>
      {list.map((point, index) => (
        <View key={point.id} style={styles.stop}>
          <View style={{ width: 54 }}>
            <Text style={styles.stopTime}>{point.time}</Text>
            {point.dayOffset ? <Text style={styles.stopDay}>Next day</Text> : null}
          </View>
          <View style={styles.stopRail}>
            <View style={styles.stopDot} />
            {index < list.length - 1 ? <View style={styles.stopLine} /> : null}
          </View>
          <View style={{ flex: 1, paddingBottom: 16 }}>
            <Text style={styles.stopName}>{point.name}</Text>
            <Text style={styles.stopSub}>{point.landmark.toUpperCase()} · {point.phone}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function TripInfo({ trip, tab }: { trip: Trip; tab: InfoTab }) {
  if (tab === "ratings") {
    return (
      <View style={{ gap: 14 }}>
        <View style={styles.ratingCard}>
          <View style={{ alignItems: "center", width: 96 }}>
            <Text style={styles.ratingBig}>{trip.rating.toFixed(1)}</Text>
            <Text style={styles.ratingWord}>{trip.rating >= 4.5 ? "Excellent" : trip.rating >= 4 ? "Very good" : "Good"}</Text>
            <Text style={styles.ratingCount}>{trip.reviews} ratings</Text>
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            {ratingSplit.map((share, index) => (
              <View key={index} style={styles.barRow}>
                <Text style={styles.barLabel}>{5 - index}★</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${share * 100}%` }]} />
                </View>
              </View>
            ))}
          </View>
        </View>
        <Text style={styles.infoKicker}>WHAT TRAVELLERS FELT</Text>
        <View style={styles.tagRow}>
          {praises.map((praise) => (
            <Tag key={praise} label={praise} icon="thumbs-up-outline" />
          ))}
        </View>
        <View style={styles.partner}>
          <View style={styles.partnerAvatar}>
            <Text style={styles.partnerLetter}>{trip.operator[0]}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.operator}>{trip.operator}</Text>
            <Text style={styles.car}>Partner rating {trip.operatorRating.toFixed(1)} · {trip.operatorReviews.toLocaleString("en-IN")}+ reviews</Text>
          </View>
        </View>
      </View>
    );
  }
  if (tab === "boarding") return <Points list={trip.boarding} />;
  if (tab === "drops") return <Points list={trip.drops} />;
  if (tab === "cancellation") {
    const lowest = Math.min(...trip.seats.map((seat) => seat.price));
    const examplePaise = Math.round(bookingFeeForSeat(lowest).passengerPays * 100);
    const start = departureDate(trip);
    return (
      <View>
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHead]}>
            <Text style={styles.tableHeadText}>Cancellation time</Text>
            <Text style={styles.tableHeadText}>Refund per seat</Text>
          </View>
          {cancellationSlabs.map((slab) => (
            <View key={slab.label} style={styles.tableRow}>
              <Text style={styles.tableCell}>{slab.label}</Text>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.tableValue}>{formatInrPaise(percentRefundPaise(examplePaise, slab.refund))}</Text>
                <Text style={styles.tableSub}>{slab.refund}% of the refundable amount</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={styles.notice}>
          <Ionicons name="information-circle-outline" size={16} color={colors.gold} />
          <Text style={styles.noticeText}>Example for the lowest seat at {formatInrPaise(examplePaise)}, with no Secure your trip fee. The fee and GST are inside that amount. The secure fee is excluded when you buy it, and a cancel at least 6 hours ahead then refunds 100% of the rest. Counted from departure at {trip.departAt} on {start.getDate()} {start.toLocaleString("en-IN", { month: "short", timeZone: "Asia/Kolkata" })}. The whole booking is cancelled together.</Text>
        </View>
      </View>
    );
  }
  if (tab === "policy") {
    return (
      <View style={{ gap: 14 }}>
        {travelPolicy.map((item) => (
          <View key={item.q} style={styles.policy}>
            <Ionicons name="help-circle-outline" size={18} color={colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={styles.policyQ}>{item.q}</Text>
              <Text style={styles.policyA}>{item.a}</Text>
            </View>
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={styles.amenities}>
      {trip.amenities.map((amenity) => (
        <View key={amenity} style={styles.amenity}>
          <Ionicons name={amenityIcons[amenity] ?? "checkmark-circle-outline"} size={20} color={colors.gold} />
          <Text style={styles.amenityText}>{amenity}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  women: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 14, backgroundColor: "rgba(229,138,168,0.12)", borderWidth: 1, borderColor: "rgba(229,138,168,0.4)" },
  womenText: { color: colors.cream, fontFamily: type.medium, fontSize: 11.5 },
  mapSkeleton: { alignSelf: "center", width: 264, gap: 12, padding: 18, borderRadius: 44, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.inkwell },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginHorizontal: 16, marginTop: 14, padding: 12, borderRadius: 14, backgroundColor: "rgba(229,138,168,0.1)", borderWidth: 1, borderColor: "rgba(229,138,168,0.35)" },
  noteInfo: { backgroundColor: "rgba(214,160,0,0.08)", borderColor: colors.line },
  noteText: { flex: 1, color: colors.cream, fontFamily: type.regular, fontSize: 12.5, lineHeight: 18 },
  senior: { flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "center", marginTop: 16, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell },
  seniorOn: { borderColor: colors.gold },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.faint, alignItems: "center", justifyContent: "center" },
  radioOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  seniorText: { color: colors.cream, fontFamily: type.medium, fontSize: 13.5 },
  detail: { marginTop: 18, marginHorizontal: 16, borderRadius: 20, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, padding: 16 },
  detailHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  operator: { color: colors.cream, fontFamily: type.semibold, fontSize: 16 },
  car: { marginTop: 3, color: colors.muted, fontFamily: type.regular, fontSize: 12.5 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  infoChip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night },
  infoChipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  infoChipText: { color: colors.cream, fontFamily: type.medium, fontSize: 13 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, gap: 10, backgroundColor: colors.inkwell, borderTopWidth: 1, borderTopColor: colors.line },
  summary: { flexDirection: "row", alignItems: "center", gap: 10 },
  summaryTitle: { color: colors.cream, fontFamily: type.semibold, fontSize: 15 },
  summarySub: { marginTop: 2, color: colors.faint, fontFamily: type.regular, fontSize: 11.5 },
  summaryFare: { color: colors.gold, fontFamily: type.bold, fontSize: 21 },
  pick: { textAlign: "center", color: colors.muted, fontFamily: type.regular, fontSize: 13 },
  stop: { flexDirection: "row", gap: 10 },
  stopTime: { color: colors.cream, fontFamily: type.semibold, fontSize: 14 },
  stopDay: { color: colors.gold, fontFamily: type.regular, fontSize: 10.5 },
  stopRail: { width: 14, alignItems: "center", paddingTop: 4 },
  stopDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.gold, backgroundColor: colors.night },
  stopLine: { flex: 1, width: 1.5, backgroundColor: colors.line, marginTop: 2 },
  stopName: { color: colors.cream, fontFamily: type.semibold, fontSize: 14.5 },
  stopSub: { marginTop: 3, color: colors.faint, fontFamily: type.regular, fontSize: 11.5 },
  ratingCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 18, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line },
  ratingBig: { color: colors.gold, fontFamily: type.bold, fontSize: 34 },
  ratingWord: { color: colors.cream, fontFamily: type.semibold, fontSize: 13 },
  ratingCount: { color: colors.faint, fontFamily: type.regular, fontSize: 11 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  barLabel: { width: 24, color: colors.muted, fontFamily: type.medium, fontSize: 11.5 },
  barTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.mist, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.gold },
  infoKicker: { color: colors.gold, fontFamily: type.semibold, fontSize: 11, letterSpacing: 2 },
  partner: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line },
  partnerAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.burgundy, alignItems: "center", justifyContent: "center" },
  partnerLetter: { color: colors.cream, fontFamily: type.bold, fontSize: 18 },
  table: { borderRadius: 16, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  tableRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  tableHead: { backgroundColor: colors.mist },
  tableHeadText: { color: colors.gold, fontFamily: type.semibold, fontSize: 12 },
  tableCell: { flex: 1, color: colors.cream, fontFamily: type.regular, fontSize: 13 },
  tableValue: { color: colors.cream, fontFamily: type.semibold, fontSize: 14 },
  tableSub: { color: colors.faint, fontFamily: type.regular, fontSize: 11 },
  notice: { flexDirection: "row", gap: 8, marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: "rgba(214,160,0,0.08)", borderWidth: 1, borderColor: colors.line },
  noticeText: { flex: 1, color: colors.muted, fontFamily: type.regular, fontSize: 12, lineHeight: 18 },
  policy: { flexDirection: "row", gap: 10 },
  policyQ: { color: colors.cream, fontFamily: type.semibold, fontSize: 14 },
  policyA: { marginTop: 4, color: colors.muted, fontFamily: type.regular, fontSize: 13, lineHeight: 19 },
  amenities: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  amenity: { width: "30%", flexGrow: 1, alignItems: "center", gap: 6, paddingVertical: 14, borderRadius: 16, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line },
  amenityText: { color: colors.cream, fontFamily: type.medium, fontSize: 12, textAlign: "center" },
});
