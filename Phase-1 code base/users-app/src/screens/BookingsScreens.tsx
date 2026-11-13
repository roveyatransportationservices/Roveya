import { useCallback, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Linking, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useFocusEffect, type CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button, Card, Chip, Header, Icon, Line, Sheet, SkeletonCard, inr, useLoading } from "../components/kit";
import { SosButton } from "../components/SosButton";
import { reviewRemote } from "../remote";
import { connectCall, finishCall } from "../safety";
import { DESK_PHONE, cancellationSlabs, cityById, clockOf, departureDate, refundPercent } from "../data";
import { dayLabel } from "../dates";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { Booking, BookingStatus } from "../types";
import type { UserStack, UserTabs } from "../navigation";

type Props = CompositeScreenProps<BottomTabScreenProps<UserTabs, "Bookings">, NativeStackScreenProps<UserStack>>;

const tabs: BookingStatus[] = ["Upcoming", "Completed", "Cancelled"];

export function BookingsScreen({ navigation }: Props) {
  const store = useStore();
  const [tab, setTab] = useState<BookingStatus>("Upcoming");
  const [refreshing, setRefreshing] = useState(false);
  const loading = useLoading(700, [tab, store.user?.phone]);
  const list = store.bookings.filter((booking) => booking.status === tab);
  const { reloadBookings } = store;
  const refresh = () => {
    setRefreshing(true);
    if (store.live) void reloadBookings().catch(() => undefined).finally(() => setRefreshing(false));
    else setTimeout(() => setRefreshing(false), 900);
  };

  useFocusEffect(
    useCallback(() => {
      void reloadBookings().catch(() => undefined);
    }, [reloadBookings]),
  );

  if (!store.user) {
    return (
      <View style={styles.screen}>
        <Header title="My bookings" />
        <View style={styles.empty}>
          <Ionicons name="ticket-outline" size={44} color={colors.gold} />
          <Text style={styles.emptyTitle}>Log in to see your trips</Text>
          <Text style={styles.emptyLine}>Tickets, captain details, and cancellations live here.</Text>
          <Button label="Login with OTP" onPress={() => navigation.navigate("Login")} style={{ marginTop: 18, alignSelf: "stretch" }} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header title="My bookings" subtitle={`${store.bookings.length} trips with ROVEYA`} />
      <View style={styles.tabs}>
        {tabs.map((value) => (
          <Chip key={value} label={`${value} · ${store.bookings.filter((booking) => booking.status === value).length}`} on={tab === value} onPress={() => setTab(value)} />
        ))}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.gold} colors={[colors.gold]} />}>
        {loading ? (
          [0, 1, 2].map((index) => <SkeletonCard key={index} lines={3} style={{ marginBottom: 0 }} />)
        ) : list.length ? (
          list.map((booking) => <BookingCard key={booking.pnr} booking={booking} onPress={() => navigation.navigate("Ticket", { pnr: booking.pnr })} />)
        ) : (
          <View style={styles.empty}>
            <Icon name="mc:car-side" size={44} />
            <Text style={styles.emptyTitle}>No {tab.toLowerCase()} trips</Text>
            <Text style={styles.emptyLine}>{tab === "Upcoming" ? "Book a seat and it shows up here with your ticket." : "Your past trips show up here."}</Text>
            {tab === "Upcoming" ? <Button label="Search cars" icon="search" onPress={() => navigation.navigate("Tabs", { screen: "Home" })} style={{ marginTop: 18, alignSelf: "stretch" }} /> : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function BookingCard({ booking, onPress }: { booking: Booking; onPress: () => void }) {
  const { trip } = booking;
  return (
    <Card onPress={onPress}>
      <View style={styles.cardTop}>
        <Text style={styles.cardDate}>{dayLabel(trip.date).toUpperCase()}</Text>
        <View style={[styles.status, booking.status === "Upcoming" && styles.statusOn, booking.status === "Cancelled" && styles.statusOff]}>
          <Text style={[styles.statusText, booking.status === "Upcoming" && { color: colors.night }]}>{booking.status}</Text>
        </View>
      </View>
      <View style={styles.cardRoute}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTime}>{booking.boarding.time}</Text>
          <Text style={styles.cardCity}>{cityById(trip.fromId).name}</Text>
        </View>
        <Ionicons name="arrow-forward" size={16} color={colors.gold} />
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={styles.cardTime}>{booking.drop.time}</Text>
          <Text style={styles.cardCity}>{cityById(trip.toId).name}</Text>
        </View>
      </View>
      <Text style={styles.cardMeta}>{trip.operator} · {trip.car} · Seats {booking.seats.map((seat) => seat.label).join(", ")}</Text>
      <View style={styles.cardFoot}>
        <Text style={styles.cardPnr}>PNR {booking.pnr}</Text>
        <Text style={styles.cardFare}>{booking.status === "Cancelled" ? `Refund ${inr(booking.refund ?? 0)}` : inr(booking.total)}</Text>
      </View>
    </Card>
  );
}

function FakeCode({ seed }: { seed: string }) {
  let state = 0;
  for (const char of seed) state = (state * 31 + char.charCodeAt(0)) >>> 0;
  const cells = Array.from({ length: 17 * 17 }, (_, index) => {
    state = (state * 1103515245 + 12345) >>> 0;
    const row = Math.floor(index / 17);
    const col = index % 17;
    const finder = (row < 5 && col < 5) || (row < 5 && col > 11) || (row > 11 && col < 5);
    if (finder) return (row % 4 === 0 || col % 4 === 0 || (row % 4 === 2 && col % 4 === 2)) && !(row === 4 || col === 4 || row === 12 || col === 12);
    return (state >>> 16) % 2 === 0;
  });
  return (
    <View style={styles.code}>
      {cells.map((dark, index) => (
        <View key={index} style={[styles.codeCell, dark && { backgroundColor: colors.night }]} />
      ))}
    </View>
  );
}

export function TicketScreen({ route, navigation }: NativeStackScreenProps<UserStack, "Ticket">) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const booking = store.bookings.find((item) => item.pnr === route.params.pnr);
  const [cancelling, setCancelling] = useState(false);
  const [refund, setRefund] = useState<number | null>(null);
  const [stars, setStars] = useState(0);
  const [note, setNote] = useState("");
  const [rated, setRated] = useState(false);
  const [sendingRating, setSendingRating] = useState(false);
  const [rateError, setRateError] = useState("");
  const [working, setWorking] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [callNote, setCallNote] = useState("");
  if (!booking) return null;
  const { trip } = booking;
  const percent = booking.refundQuote?.percent ?? refundPercent(trip);
  const estimate = booking.refundQuote?.amount ?? Math.round((booking.total * percent) / 100);
  const hoursLeft = (departureDate(trip).getTime() - Date.now()) / 3600000;
  const captainReady = booking.status !== "Upcoming" || hoursLeft <= 2;

  const share = () =>
    void Share.share({ message: `ROVEYA ticket ${booking.pnr}: ${cityById(trip.fromId).name} to ${cityById(trip.toId).name}, ${dayLabel(trip.date)} ${booking.boarding.time} from ${booking.boarding.name}. Seats ${booking.seats.map((seat) => seat.label).join(", ")}.` }).catch(() => undefined);

  return (
    <View style={styles.screen}>
      <Header title={`Ticket ${booking.pnr}`} subtitle={booking.status} onBack={() => navigation.goBack()} right={<Pressable onPress={share} hitSlop={8}><Ionicons name="share-social-outline" size={20} color={colors.gold} /></Pressable>} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={styles.ticket}>
          <View style={styles.ticketTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ticketKicker}>{dayLabel(trip.date).toUpperCase()}</Text>
              <Text style={styles.ticketRoute}>{cityById(trip.fromId).name} → {cityById(trip.toId).name}</Text>
              <Text style={styles.ticketMeta}>{trip.operator} · {trip.car} · AC</Text>
            </View>
            {booking.status !== "Cancelled" ? <FakeCode seed={booking.pnr} /> : null}
          </View>
          <View style={styles.tear}>
            <View style={styles.notchLeft} />
            <View style={styles.tearLine} />
            <View style={styles.notchRight} />
          </View>
          <View style={{ padding: 16 }}>
            <View style={styles.stopRow}>
              <View style={styles.stopDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.stopTime}>{booking.boarding.time} · Boarding</Text>
                <Text style={styles.stopName}>{booking.boarding.name}</Text>
                <Text style={styles.stopSub}>{booking.boarding.landmark}</Text>
              </View>
            </View>
            <View style={styles.stopRail} />
            <View style={styles.stopRow}>
              <View style={[styles.stopDot, { borderColor: colors.rose }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.stopTime}>{booking.drop.time} · Drop</Text>
                <Text style={styles.stopName}>{booking.drop.name}</Text>
                <Text style={styles.stopSub}>{booking.drop.landmark}</Text>
              </View>
            </View>
            <View style={styles.rule} />
            {booking.travellers.map((traveller) => (
              <Line key={traveller.seatId} label={`${traveller.name || "Traveller"} · ${traveller.age} · ${traveller.gender ?? ""}`} value={`Seat ${traveller.seatId}`} />
            ))}
            <View style={styles.rule} />
            <Line label="Paid" value={`${inr(booking.total)} · ${booking.paidWith}`} />
            {booking.secured ? <Line label="Trip security" value="Included" tone="success" /> : null}
            {booking.status === "Cancelled" ? <Line label="Refunded to ROVEYA Cash" value={inr(booking.refund ?? 0)} tone="gold" /> : null}
          </View>
        </View>

        {booking.status !== "Cancelled" ? (
          <Card style={{ marginTop: 14 }}>
            <Text style={styles.cardKicker}>YOUR CAPTAIN</Text>
            {captainReady ? (
              <View style={styles.captain}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>R</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.captainName}>{booking.captain ? `${booking.captain.name} · ${booking.captain.rating.toFixed(1)} ★` : "Ravi Kumar · 4.8 ★"}</Text>
                  <Text style={styles.captainSub}>{booking.captain ? `${booking.captain.car} · ${booking.captain.plate}` : `${trip.car} · TS 09 EZ 4821`}</Text>
                </View>
                <Pressable
                  onPress={async () => {
                    if (!booking.id) return Linking.openURL(`tel:${DESK_PHONE.replace(/\s/g, "")}`);
                    try {
                      setCallNote(finishCall(await connectCall(booking.id)));
                    } catch (failure) {
                      setCallNote((failure as Error).message);
                    }
                  }}
                  style={styles.callBtn}
                >
                  <Ionicons name="call" size={16} color={colors.night} />
                </Pressable>
              </View>
            ) : (
              <Text style={styles.captainWait}>The captain's name, photo, phone, and car number arrive by SMS and here at {clockOf(Number(booking.boarding.time.slice(0, 2)) * 60 + Number(booking.boarding.time.slice(3)) - 120)} on the day, 2 hours before boarding.</Text>
            )}
          </Card>
        ) : null}

        {booking.status === "Upcoming" ? (
          <View style={styles.actions}>
            <Button label="Track car" icon="navigate-outline" tone="ghost" onPress={() => navigation.navigate("Track", { pnr: booking.pnr })} style={{ flex: 1 }} disabled={!captainReady} />
            <Button label="Cancel" icon="close-circle-outline" tone="burgundy" onPress={() => setCancelling(true)} style={{ flex: 1 }} />
          </View>
        ) : null}
        {callNote ? <Text style={[styles.captainSub, { marginTop: 10, textAlign: "center" }]}>{callNote}</Text> : null}
        {booking.status === "Upcoming" && hoursLeft <= 6 ? (
          <View style={{ marginTop: 12, gap: 6 }}>
            <SosButton context={{ bookingId: booking.id }} />
            <Text style={styles.sosHint}>Hold for 2 seconds. The safety desk, your emergency contacts and 112 are one tap away.</Text>
          </View>
        ) : null}

        {booking.status === "Completed" ? (
          <Card style={{ marginTop: 14, alignItems: "center" }}>
            <Text style={styles.cardKicker}>RATE THIS TRIP</Text>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((value) => (
                <Pressable key={value} onPress={() => !rated && setStars(value)} hitSlop={6} disabled={rated}>
                  <Ionicons name={value <= stars ? "star" : "star-outline"} size={30} color={colors.gold} />
                </Pressable>
              ))}
            </View>
            {rated ? (
              <Text style={styles.captainSub}>Thanks for rating {trip.operator}. The ROVEYA team reads every review.</Text>
            ) : stars ? (
              <View style={{ alignSelf: "stretch", gap: 10 }}>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Tell us about the car, the captain, the comfort (optional)"
                  placeholderTextColor={colors.faint}
                  multiline
                  maxLength={600}
                  style={styles.reviewInput}
                />
                {rateError ? <Text style={[styles.captainSub, { color: colors.danger }]}>{rateError}</Text> : null}
                <Button
                  label={sendingRating ? "Sending…" : "Send rating"}
                  loading={sendingRating}
                  onPress={async () => {
                    setSendingRating(true);
                    setRateError("");
                    try {
                      if (store.live && booking.id) await reviewRemote(booking.id, stars, note.trim());
                      else await new Promise((resolve) => setTimeout(resolve, 700));
                      setRated(true);
                    } catch (failure) {
                      setRateError((failure as Error).message);
                    } finally {
                      setSendingRating(false);
                    }
                  }}
                />
              </View>
            ) : null}
          </Card>
        ) : null}

        <Pressable onPress={() => void Linking.openURL(`tel:${DESK_PHONE.replace(/\s/g, "")}`)} style={styles.help}>
          <Ionicons name="headset-outline" size={18} color={colors.gold} />
          <Text style={styles.helpText}>Need help with this trip? Call the ROVEYA desk</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.faint} />
        </Pressable>
      </ScrollView>

      <Sheet
        visible={cancelling}
        onClose={() => {
          setCancelling(false);
          setRefund(null);
        }}
        title={refund === null ? "Cancel this booking?" : "Booking cancelled"}
        footer={
          refund === null ? (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="Keep trip" tone="ghost" onPress={() => setCancelling(false)} style={{ flex: 1 }} />
              <Button
                label={working ? "Cancelling…" : `Cancel · refund ${inr(estimate)}`}
                tone="burgundy"
                loading={working}
                onPress={async () => {
                  setWorking(true);
                  setCancelError("");
                  try {
                    if (!store.live) await new Promise((resolve) => setTimeout(resolve, 1000));
                    setRefund(await store.cancel(booking.pnr));
                  } catch (failure) {
                    setCancelError((failure as Error).message);
                  } finally {
                    setWorking(false);
                  }
                }}
                style={{ flex: 1.6 }}
              />
            </View>
          ) : (
            <Button label="Done" onPress={() => { setCancelling(false); setRefund(null); }} />
          )
        }
      >
        {refund === null ? (
          <>
            <Text style={styles.sheetLead}>Departure is in {Math.max(0, Math.floor(hoursLeft))} hours, so you get {percent}% back.</Text>
            {cancelError ? <Text style={[styles.sheetLead, { color: colors.danger }]}>{cancelError}</Text> : null}
            {cancellationSlabs.map((slab) => (
              <View key={slab.label} style={[styles.slab, slab.refund === percent && styles.slabOn]}>
                <Text style={styles.slabLabel}>{slab.label}</Text>
                <Text style={styles.slabValue}>{slab.refund}%</Text>
              </View>
            ))}
          </>
        ) : (
          <Text style={styles.sheetLead}>{inr(refund)} is back in your ROVEYA Cash now. Use it on your next seat.</Text>
        )}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  empty: { alignItems: "center", margin: 16, padding: 28, borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  emptyTitle: { marginTop: 14, color: colors.cream, fontFamily: type.semibold, fontSize: 18 },
  emptyLine: { marginTop: 6, textAlign: "center", color: colors.muted, fontFamily: type.regular, fontSize: 13.5, lineHeight: 20 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardDate: { color: colors.gold, fontFamily: type.semibold, fontSize: 11, letterSpacing: 2 },
  status: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: colors.mist },
  statusOn: { backgroundColor: colors.gold },
  statusOff: { backgroundColor: "rgba(232,133,127,0.15)" },
  statusText: { color: colors.muted, fontFamily: type.semibold, fontSize: 11 },
  cardRoute: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  cardTime: { color: colors.cream, fontFamily: type.semibold, fontSize: 18 },
  cardCity: { color: colors.muted, fontFamily: type.regular, fontSize: 13 },
  cardMeta: { marginTop: 10, color: colors.faint, fontFamily: type.regular, fontSize: 12.5 },
  cardFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.hairline },
  cardPnr: { color: colors.muted, fontFamily: type.medium, fontSize: 12.5, letterSpacing: 1 },
  cardFare: { color: colors.gold, fontFamily: type.bold, fontSize: 16 },
  ticket: { borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  ticketTop: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, backgroundColor: colors.plum },
  ticketKicker: { color: colors.gold, fontFamily: type.semibold, fontSize: 11, letterSpacing: 2 },
  ticketRoute: { marginTop: 6, color: colors.cream, fontFamily: type.semibold, fontSize: 19 },
  ticketMeta: { marginTop: 4, color: colors.muted, fontFamily: type.regular, fontSize: 12.5 },
  code: { width: 86, height: 86, padding: 4, borderRadius: 8, backgroundColor: colors.cream, flexDirection: "row", flexWrap: "wrap" },
  codeCell: { width: 78 / 17, height: 78 / 17 },
  tear: { flexDirection: "row", alignItems: "center", height: 20 },
  notchLeft: { width: 20, height: 20, borderRadius: 10, marginLeft: -10, backgroundColor: colors.night },
  notchRight: { width: 20, height: 20, borderRadius: 10, marginRight: -10, backgroundColor: colors.night },
  tearLine: { flex: 1, height: 1, borderTopWidth: 1, borderStyle: "dashed", borderColor: colors.line },
  stopRow: { flexDirection: "row", gap: 12 },
  stopDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2.5, borderColor: colors.gold, marginTop: 3 },
  stopRail: { width: 2, height: 18, backgroundColor: colors.line, marginLeft: 6, marginVertical: 2 },
  stopTime: { color: colors.gold, fontFamily: type.semibold, fontSize: 12.5 },
  stopName: { marginTop: 2, color: colors.cream, fontFamily: type.semibold, fontSize: 15 },
  stopSub: { color: colors.faint, fontFamily: type.regular, fontSize: 12 },
  rule: { height: 1, backgroundColor: colors.hairline, marginVertical: 12 },
  cardKicker: { color: colors.gold, fontFamily: type.semibold, fontSize: 11, letterSpacing: 2 },
  captain: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.burgundy, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.gold },
  avatarText: { color: colors.cream, fontFamily: type.bold, fontSize: 18 },
  captainName: { color: colors.cream, fontFamily: type.semibold, fontSize: 15 },
  captainSub: { marginTop: 2, color: colors.muted, fontFamily: type.regular, fontSize: 12.5 },
  captainWait: { marginTop: 8, color: colors.muted, fontFamily: type.regular, fontSize: 13, lineHeight: 19 },
  callBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  sosHint: { textAlign: "center", color: colors.faint, fontFamily: type.regular, fontSize: 11.5, lineHeight: 16 },
  stars: { flexDirection: "row", gap: 10, marginVertical: 12 },
  reviewInput: { minHeight: 84, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, color: colors.cream, fontFamily: type.regular, fontSize: 14, textAlignVertical: "top" },
  help: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, padding: 14, borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  helpText: { flex: 1, color: colors.cream, fontFamily: type.medium, fontSize: 13.5 },
  sheetLead: { color: colors.muted, fontFamily: type.regular, fontSize: 14, lineHeight: 21, marginBottom: 12 },
  slab: { flexDirection: "row", justifyContent: "space-between", padding: 12, borderRadius: 12, marginBottom: 6, backgroundColor: colors.night },
  slabOn: { borderWidth: 1, borderColor: colors.gold },
  slabLabel: { color: colors.cream, fontFamily: type.regular, fontSize: 13 },
  slabValue: { color: colors.gold, fontFamily: type.semibold, fontSize: 13 },
});
