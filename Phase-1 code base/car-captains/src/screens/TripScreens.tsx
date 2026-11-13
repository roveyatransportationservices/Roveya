import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CarSeats, SeatKey } from "../components/CarSeats";
import { Button, Chip, Header, Icon, Line, Sheet, Skeleton, SkeletonCard } from "../components/kit";
import { clock, dayLabel, inr, route } from "../format";
import { SosButton } from "../components/SosButton";
import { useLive } from "../hooks";
import { fromIst } from "../rules";
import { connectCall, finishCall } from "../safety";
import { service, type OfflineGender } from "../service";
import { startTripTracking, stopTripTracking, trackingTrip, type TrackingMode } from "../tracking";
import { colors, type } from "../theme";
import type { TripDetail, TripSummary } from "../types";
import type { CaptainStack, CaptainTabs } from "../navigation";

type ListProps = CompositeScreenProps<BottomTabScreenProps<CaptainTabs, "Trips">, NativeStackScreenProps<CaptainStack>>;

const statusText: Record<TripSummary["status"], string> = { scheduled: "Scheduled", on_trip: "On trip", completed: "Completed", cancelled: "Cancelled" };

export function TripsScreen({ navigation }: ListProps) {
  const [scope, setScope] = useState<"upcoming" | "past">("upcoming");
  const trips = useLive(() => service.trips(scope), null);
  const { reload, setData } = trips;

  useEffect(() => {
    void reload();
  }, [scope, reload]);

  const pick = (next: "upcoming" | "past") => {
    if (next === scope) return;
    setData(null);
    setScope(next);
  };

  return (
    <View style={styles.screen}>
      <Header title="My trips" subtitle="Seats update live as travellers book" right={<Button label="New" icon="add" onPress={() => navigation.navigate("Publish")} style={{ height: 38, paddingHorizontal: 14 }} />} />
      <View style={styles.scopes}>
        <Chip label="Upcoming" on={scope === "upcoming"} onPress={() => pick("upcoming")} />
        <Chip label="Past" on={scope === "past"} onPress={() => pick("past")} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 12 }} refreshControl={<RefreshControl refreshing={trips.refreshing} onRefresh={() => void trips.reload(true)} tintColor={colors.gold} colors={[colors.gold]} />}>
        {!trips.data ? (
          [0, 1, 2].map((index) => <SkeletonCard key={index} lines={3} />)
        ) : trips.data.length ? (
          trips.data.map((trip) => (
            <Pressable key={trip.id} onPress={() => navigation.navigate("Trip", { id: trip.id })} style={({ pressed }) => [styles.card, pressed && { borderColor: colors.gold }]}>
              <View style={styles.cardTop}>
                <Text style={styles.date}>{dayLabel(trip.date).toUpperCase()}</Text>
                <View style={[styles.pill, trip.status === "on_trip" && styles.pillLive, trip.status === "cancelled" && styles.pillOff]}>
                  <Text style={[styles.pillText, trip.status === "on_trip" && { color: colors.night }]}>{statusText[trip.status]}</Text>
                </View>
              </View>
              <Text style={styles.route}>{route(trip.fromId, trip.toId)}</Text>
              <View style={styles.times}>
                <Text style={styles.time}>{clock(trip.departAt)}</Text>
                <View style={styles.dash} />
                <Text style={styles.duration}>
                  {Math.floor(trip.durationMin / 60)}h {String(trip.durationMin % 60).padStart(2, "0")}m
                </Text>
                <View style={styles.dash} />
                <Text style={styles.time}>{clock(trip.arriveAt)}</Text>
              </View>
              <View style={styles.cardFoot}>
                <View style={styles.seatDots}>
                  {trip.seats.map((seat) => (
                    <View key={seat.id} style={[styles.seatDot, seat.state !== "available" && seat.state !== "female" && styles.seatDotOn]} />
                  ))}
                  <Text style={styles.small}>
                    {trip.booked} of {trip.seats.length} booked
                  </Text>
                </View>
                <Text style={styles.revenue}>{inr(trip.revenue)}</Text>
              </View>
            </Pressable>
          ))
        ) : (
          <View style={[styles.card, { alignItems: "center", paddingVertical: 28 }]}>
            <Icon name="mc:car-off" size={40} />
            <Text style={[styles.route, { marginTop: 10 }]}>{scope === "upcoming" ? "No trips coming up" : "No past trips yet"}</Text>
            {scope === "upcoming" ? <Button label="Publish a trip" icon="add" onPress={() => navigation.navigate("Publish")} style={{ marginTop: 14, alignSelf: "stretch" }} /> : null}
          </View>
        )}
        {trips.error ? <Text style={styles.error}>{trips.error}</Text> : null}
      </ScrollView>
    </View>
  );
}

export function TripScreen({ route: params, navigation }: NativeStackScreenProps<CaptainStack, "Trip">) {
  const insets = useSafeAreaInsets();
  const id = params.params.id;
  const live = useLive(() => service.trip(id), id);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [seat, setSeat] = useState<string | null>(null);
  const [tracking, setTracking] = useState<TrackingMode | null>(null);
  const [callNote, setCallNote] = useState("");
  const [marking, setMarking] = useState(false);
  const [picks, setPicks] = useState<string[]>([]);
  const [outside, setOutside] = useState(false);
  const [outsideGender, setOutsideGender] = useState<OfflineGender>(null);
  const [outsideNote, setOutsideNote] = useState("");
  const detail = live.data;

  const status = live.data?.trip.status;
  const departAt = live.data ? fromIst(live.data.trip.date, live.data.trip.departAt) : null;

  // Location goes out from 90 minutes before departure until the trip ends.
  useEffect(() => {
    if (!status) return;
    const soon = departAt ? departAt.getTime() - Date.now() < 90 * 60000 : false;
    if (status === "on_trip" || (status === "scheduled" && soon)) {
      void startTripTracking(id).then((mode) => setTracking(mode));
    } else if (status === "completed" || status === "cancelled") {
      void trackingTrip().then((current) => (current === id ? stopTripTracking() : undefined));
      setTracking(null);
    }
  }, [status, id, departAt?.getTime()]);

  const callTraveller = async (bookingId: string) => {
    setBusy(`call-${bookingId}`);
    setError("");
    try {
      setCallNote(finishCall(await connectCall(bookingId)));
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const run = async (key: string, work: () => Promise<TripDetail>) => {
    setBusy(key);
    setError("");
    try {
      live.setData(await work());
      return true;
    } catch (failure) {
      setError((failure as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (!detail) {
    return (
      <View style={styles.screen}>
        <Header title="Trip" onBack={() => navigation.goBack()} />
        <View style={{ padding: 16, gap: 12 }}>
          <Skeleton height={300} radius={40} width={264} style={{ alignSelf: "center" }} />
          <SkeletonCard lines={3} />
          {live.error ? <Text style={styles.error}>{live.error}</Text> : null}
        </View>
      </View>
    );
  }

  const { trip, seats, bookings, totals } = detail;
  const open = trip.status === "scheduled" || trip.status === "on_trip";
  const picked = seats.find((item) => item.id === seat);
  const pickedBooking = picked?.pnr ? bookings.find((booking) => booking.pnr === picked.pnr) : null;
  const confirmed = bookings.filter((booking) => booking.status !== "cancelled");
  const offlineSeats = seats.filter((item) => item.status === "offline");
  const freeCount = seats.filter((item) => item.status === "available").length;

  const tapSeat = (cell: { id: string }) => {
    if (!marking) return setSeat(cell.id);
    const target = seats.find((item) => item.id === cell.id);
    if (target?.status !== "available") {
      setError(target?.status === "offline" ? `Seat ${target.label} is already marked as sold outside.` : `Seat ${target?.label} is taken in the app. Pick a free seat.`);
      return;
    }
    setError("");
    setPicks((list) => (list.includes(cell.id) ? list.filter((item) => item !== cell.id) : [...list, cell.id]));
  };

  const openOutside = (ids: string[]) => {
    setPicks(ids);
    setOutsideGender(null);
    setOutsideNote("");
    setSeat(null);
    setOutside(true);
  };

  const markOutside = async () => {
    const ok = await run("outside", () => service.block(trip.id, picks, outsideGender, outsideNote));
    if (ok) {
      setOutside(false);
      setMarking(false);
      setPicks([]);
    }
  };

  const freeSeat = async (id: string) => {
    if (await run(`free-${id}`, () => service.unblock(trip.id, [id]))) setSeat(null);
  };

  return (
    <View style={styles.screen}>
      <Header title={route(trip.fromId, trip.toId)} subtitle={`${dayLabel(trip.date)} · ${clock(trip.departAt)} · ${trip.code}`} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ paddingBottom: open ? 170 : 40 }} refreshControl={<RefreshControl refreshing={live.refreshing} onRefresh={() => void live.reload(true)} tintColor={colors.gold} colors={[colors.gold]} />}>
        <View style={styles.summary}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              {totals.booked + offlineSeats.length}/{totals.seats}
            </Text>
            <Text style={styles.summaryLabel}>{offlineSeats.length ? `Taken · ${offlineSeats.length} outside` : "Seats booked"}</Text>
          </View>
          <View style={styles.summaryRule} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{inr(totals.earning)}</Text>
            <Text style={styles.summaryLabel}>You earn</Text>
          </View>
          <View style={styles.summaryRule} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: trip.status === "on_trip" ? colors.success : trip.status === "cancelled" ? colors.danger : colors.cream }]}>{statusText[trip.status]}</Text>
            <Text style={styles.summaryLabel}>Status</Text>
          </View>
        </View>

        <SeatKey />
        <CarSeats cells={seats} selected={seat} picked={marking ? picks : []} onPress={tapSeat} />
        <Text style={styles.tapHint}>{marking ? "Tap the free seats your outside passengers are sitting in" : "Tap a seat to see who is sitting there"}</Text>
        {open && (freeCount > 0 || marking) ? (
          <View style={styles.outsideBar}>
            {marking ? (
              <>
                <Button label="Done" tone="ghost" onPress={() => (setMarking(false), setPicks([]), setError(""))} style={{ flex: 1 }} />
                <Button label={picks.length ? `Mark ${picks.length} sold outside` : "Pick seats"} icon="mc:account-cash" disabled={!picks.length} onPress={() => openOutside(picks)} style={{ flex: 1.6 }} />
              </>
            ) : (
              <Button label="Seats sold outside the app" icon="mc:account-cash" tone="ghost" onPress={() => (setMarking(true), setPicks([]), setError(""))} style={{ flex: 1 }} />
            )}
          </View>
        ) : null}
        {offlineSeats.length ? (
          <Text style={styles.outsideNote}>
            {offlineSeats.map((item) => item.label).join(", ")} {offlineSeats.length === 1 ? "is" : "are"} marked as sold outside. Travellers in the app see {offlineSeats.length === 1 ? "it" : "them"} as booked.
          </Text>
        ) : null}

        <View style={{ paddingHorizontal: 16, gap: 12, marginTop: 8 }}>
          <Text style={styles.section}>TRAVELLERS · {confirmed.reduce((sum, booking) => sum + booking.travellers.length, 0)}</Text>
          {confirmed.length ? (
            confirmed.map((booking) => (
              <View key={booking.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.pnr}>PNR {booking.pnr}</Text>
                  <Text style={styles.revenueSmall}>{inr(booking.fare)}</Text>
                </View>
                {booking.travellers.map((traveller) => (
                  <View key={traveller.seatId} style={styles.traveller}>
                    <View style={[styles.seatTag, traveller.gender === "Female" && { borderColor: colors.rose }]}>
                      <Text style={styles.seatTagText}>{seats.find((item) => item.id === traveller.seatId)?.label ?? traveller.seatId}</Text>
                    </View>
                    <Text style={styles.travellerName}>{traveller.name}</Text>
                    <Text style={styles.small}>
                      {traveller.age} · {traveller.gender === "Female" ? "F" : "M"}
                    </Text>
                  </View>
                ))}
                <View style={styles.point}>
                  <Icon name="mc:map-marker-up" size={16} />
                  <Text style={styles.pointText}>
                    {booking.boarding.time ? `${clock(booking.boarding.time)} · ` : ""}
                    {booking.boarding.name}
                  </Text>
                </View>
                <View style={styles.point}>
                  <Icon name="mc:map-marker-down" size={16} color={colors.rose} />
                  <Text style={styles.pointText}>{booking.drop.name}</Text>
                </View>
                {booking.status === "confirmed" && open ? (
                  <View style={styles.actions}>
                    <Pressable disabled={busy === `call-${booking.id}`} onPress={() => void callTraveller(booking.id)} style={styles.callBtn}>
                      <Ionicons name="call" size={15} color={colors.gold} />
                      <Text style={styles.callText}>{busy === `call-${booking.id}` ? "Calling…" : "Call"}</Text>
                    </Pressable>
                    <Pressable disabled={busy === booking.id} onPress={() => void run(booking.id, () => service.board(trip.id, booking.id, !booking.boarded))} style={[styles.boardBtn, booking.boarded && styles.boardBtnOn]}>
                      <Ionicons name={booking.boarded ? "checkmark-circle" : "log-in-outline"} size={16} color={booking.boarded ? colors.night : colors.cream} />
                      <Text style={[styles.boardText, booking.boarded && { color: colors.night }]}>{booking.boarded ? "Boarded" : "Mark boarded"}</Text>
                    </Pressable>
                  </View>
                ) : booking.status === "completed" ? (
                  <View style={styles.rateRow}>
                    <Text style={[styles.small, { flex: 1 }]}>{booking.myRating ? "You rated these travellers" : "Rate these travellers"}</Text>
                    {[1, 2, 3, 4, 5].map((value) => (
                      <Pressable key={value} accessibilityLabel={`Rate ${value} star${value > 1 ? "s" : ""}`} hitSlop={4} disabled={busy === `rate-${booking.id}`} onPress={() => void run(`rate-${booking.id}`, () => service.rateTraveller(trip.id, booking.id, value))}>
                        <Ionicons name={value <= (booking.myRating ?? 0) ? "star" : "star-outline"} size={22} color={colors.gold} />
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.small}>{booking.boarded ? "Boarded" : ""}</Text>
                )}
              </View>
            ))
          ) : (
            <View style={[styles.card, { alignItems: "center" }]}>
              <Icon name="mc:seat-passenger" size={30} />
              <Text style={[styles.small, { textAlign: "center", marginTop: 8 }]}>No bookings yet. You get a notification the moment someone books.</Text>
            </View>
          )}

          <Text style={styles.section}>ROUTE</Text>
          <View style={styles.card}>
            {trip.boarding.map((stop) => (
              <Line key={stop.id} label={`Pickup · ${stop.name}`} value={clock(stop.time)} />
            ))}
            {trip.drops.map((stop) => (
              <Line key={stop.id} label={`Drop · ${stop.name}`} value={clock(stop.time)} />
            ))}
          </View>
          <View style={styles.card}>
            <Line label="Seat fares" value={inr(totals.fare)} />
            <Line label="ROVEYA commission (10%)" value={`−${inr(totals.commission)}`} />
            <Line label="Credited to your wallet" value={inr(totals.earning)} strong />
            <Text style={styles.small}>Added when you complete the trip, then paid on your payout cycle.</Text>
          </View>
          {trip.cancelReason ? <Text style={styles.small}>Cancelled: {trip.cancelReason}</Text> : null}
          {callNote ? <Text style={styles.small}>{callNote}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </ScrollView>

      {open ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {tracking ? (
            <View style={styles.trackRow}>
              <View style={[styles.trackDot, tracking === "off" && { backgroundColor: colors.danger }]} />
              <Text style={styles.trackText}>{tracking === "off" ? "Location is off. Allow location so travellers and the safety desk can see the car." : tracking === "background" ? "Sharing live location, even with the app closed" : "Sharing live location while the app is open"}</Text>
            </View>
          ) : null}
          {trip.status === "scheduled" ? (
            <>
              <View style={styles.footRow}>
                <Button label="Start trip" icon="mc:steering" loading={busy === "start"} onPress={() => void run("start", () => service.action(trip.id, "start"))} style={{ flex: 1 }} />
                <SosButton context={{ tripId: trip.id }} compact />
              </View>
              <Pressable onPress={() => setCancelling(true)} hitSlop={8}>
                <Text style={styles.cancel}>Cancel this trip</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.footRow}>
              <Button label="Complete trip" icon="mc:flag-checkered" loading={busy === "complete"} onPress={() => void run("complete", () => service.action(trip.id, "complete"))} style={{ flex: 1 }} />
              <SosButton context={{ tripId: trip.id }} compact />
            </View>
          )}
        </View>
      ) : null}

      <Sheet visible={Boolean(picked)} onClose={() => setSeat(null)} title={picked ? `Seat ${picked.label}` : ""}>
        {picked ? (
          <View style={{ gap: 6 }}>
            <Line label="Position" value={`${picked.row === 0 ? "Front" : picked.row === 1 ? "Middle row" : "Back row"} · ${picked.chair ? "captain seat" : picked.window ? "window" : "middle"}`} />
            <Line label="Fare in the app" value={inr(picked.price)} />
            <Line label="Status" value={picked.status === "booked" ? (picked.boarded ? "Boarded" : "Booked in the app") : picked.status === "held" ? "Traveller is paying" : picked.status === "offline" ? "Sold outside the app" : "Free"} />
            {picked.passenger ? <Line label="Traveller" value={`${picked.passenger.name} · ${picked.passenger.age} · ${picked.passenger.gender}`} /> : null}
            {picked.status === "offline" && picked.gender ? <Line label="Passenger" value={picked.gender} /> : null}
            {picked.status === "offline" && picked.offlineNote ? <Line label="Your note" value={picked.offlineNote} /> : null}
            {pickedBooking ? <Line label="Boarding" value={pickedBooking.boarding.name} /> : null}
            {picked.pnr ? <Line label="PNR" value={picked.pnr} /> : null}
            {open && picked.status === "available" ? (
              <Button label="A passenger paid me directly" icon="mc:account-cash" tone="ghost" onPress={() => openOutside([picked.id])} style={{ marginTop: 10 }} />
            ) : null}
            {open && picked.status === "offline" ? (
              <>
                <Button label="Free this seat for the app" icon="mc:seat-outline" tone="ghost" loading={busy === `free-${picked.id}`} onPress={() => void freeSeat(picked.id)} style={{ marginTop: 10 }} />
                <Text style={styles.small}>The seat opens for booking in the ROVEYA app straight away.</Text>
              </>
            ) : null}
          </View>
        ) : null}
      </Sheet>

      <Sheet
        visible={outside}
        onClose={() => setOutside(false)}
        title={`Sold outside · ${picks.map((id) => seats.find((item) => item.id === id)?.label ?? id).join(", ")}`}
        footer={<Button label={`Mark ${picks.length} seat${picks.length > 1 ? "s" : ""} as taken`} loading={busy === "outside"} disabled={!picks.length} onPress={() => void markOutside()} />}
      >
        <Text style={styles.lead}>For passengers who booked with you directly. These seats show as booked in the ROVEYA app, so no traveller can book them. ROVEYA does not charge commission on them.</Text>
        <Text style={styles.label}>Passenger</Text>
        <View style={styles.chipRow}>
          <Chip label="Not set" on={outsideGender === null} onPress={() => setOutsideGender(null)} />
          <Chip label="Male" on={outsideGender === "Male"} onPress={() => setOutsideGender("Male")} />
          <Chip label="Female" on={outsideGender === "Female"} onPress={() => setOutsideGender("Female")} />
        </View>
        <Text style={styles.small}>Mark Female if a woman sits here, so the seat beside her is kept for women in the app.</Text>
        <TextInput value={outsideNote} onChangeText={(text) => setOutsideNote(text.slice(0, 160))} placeholder="Note for yourself (optional), like Ravi, pickup at Miyapur" placeholderTextColor={colors.faint} selectionColor={colors.gold} style={styles.input} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Sheet>

      <Sheet
        visible={cancelling}
        onClose={() => setCancelling(false)}
        title="Cancel this trip?"
        footer={
          <Button
            label="Cancel trip and refund travellers"
            tone="burgundy"
            loading={busy === "cancel"}
            disabled={reason.trim().length < 4}
            onPress={async () => {
              if (await run("cancel", () => service.action(trip.id, "cancel", reason.trim()))) setCancelling(false);
            }}
          />
        }
      >
        <Text style={styles.lead}>Every traveller gets a full refund to ROVEYA Cash and a message with your reason. Frequent cancellations lower your rating.</Text>
        <TextInput value={reason} onChangeText={setReason} placeholder="Reason, like car breakdown" placeholderTextColor={colors.faint} selectionColor={colors.gold} style={styles.input} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  scopes: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  card: { padding: 16, borderRadius: 20, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, gap: 8 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  date: { color: colors.gold, fontFamily: type.semibold, fontSize: 10.5, letterSpacing: 1.5 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: colors.mist },
  pillLive: { backgroundColor: colors.success },
  pillOff: { backgroundColor: "rgba(232,133,127,0.15)" },
  pillText: { color: colors.muted, fontFamily: type.semibold, fontSize: 11 },
  route: { color: colors.cream, fontFamily: type.semibold, fontSize: 16 },
  times: { flexDirection: "row", alignItems: "center", gap: 8 },
  time: { color: colors.cream, fontFamily: type.semibold, fontSize: 15 },
  dash: { flex: 1, height: 1, backgroundColor: colors.line },
  duration: { color: colors.muted, fontFamily: type.medium, fontSize: 11.5 },
  cardFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.hairline },
  seatDots: { flexDirection: "row", alignItems: "center", gap: 4 },
  seatDot: { width: 10, height: 10, borderRadius: 3, borderWidth: 1.2, borderColor: colors.faint },
  seatDotOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  small: { marginLeft: 4, color: colors.faint, fontFamily: type.regular, fontSize: 12, lineHeight: 17 },
  revenue: { color: colors.gold, fontFamily: type.bold, fontSize: 17 },
  revenueSmall: { color: colors.gold, fontFamily: type.semibold, fontSize: 14 },
  error: { color: colors.danger, fontFamily: type.regular, fontSize: 12.5 },
  summary: { flexDirection: "row", alignItems: "center", margin: 16, marginBottom: 0, paddingVertical: 14, borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  summaryItem: { flex: 1, alignItems: "center", gap: 3 },
  summaryValue: { color: colors.cream, fontFamily: type.semibold, fontSize: 16 },
  summaryLabel: { color: colors.faint, fontFamily: type.regular, fontSize: 11 },
  summaryRule: { width: 1, height: 30, backgroundColor: colors.line },
  tapHint: { marginTop: 10, textAlign: "center", color: colors.faint, fontFamily: type.regular, fontSize: 11.5 },
  outsideBar: { flexDirection: "row", gap: 10, paddingHorizontal: 16, marginTop: 12 },
  outsideNote: { marginTop: 10, marginHorizontal: 16, textAlign: "center", color: "#8FB4E8", fontFamily: type.regular, fontSize: 12, lineHeight: 17 },
  label: { marginTop: 4, marginBottom: 8, color: colors.muted, fontFamily: type.medium, fontSize: 12.5 },
  chipRow: { flexDirection: "row", gap: 8, marginBottom: 6 },
  section: { marginTop: 10, color: colors.gold, fontFamily: type.semibold, fontSize: 11, letterSpacing: 2 },
  pnr: { color: colors.cream, fontFamily: type.semibold, fontSize: 13.5, letterSpacing: 0.5 },
  traveller: { flexDirection: "row", alignItems: "center", gap: 10 },
  seatTag: { minWidth: 40, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: colors.gold, alignItems: "center" },
  seatTagText: { color: colors.cream, fontFamily: type.semibold, fontSize: 11.5 },
  travellerName: { flex: 1, color: colors.cream, fontFamily: type.medium, fontSize: 14 },
  point: { flexDirection: "row", alignItems: "center", gap: 8 },
  pointText: { flex: 1, color: colors.muted, fontFamily: type.regular, fontSize: 12.5 },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  rateRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.hairline },
  callBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.line },
  callText: { color: colors.cream, fontFamily: type.medium, fontSize: 13 },
  boardBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 40, borderRadius: 12, backgroundColor: colors.plum, borderWidth: 1, borderColor: colors.line },
  boardBtnOn: { backgroundColor: colors.success, borderColor: colors.success },
  boardText: { color: colors.cream, fontFamily: type.semibold, fontSize: 13 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.inkwell, borderTopWidth: 1, borderTopColor: colors.line },
  cancel: { textAlign: "center", color: colors.danger, fontFamily: type.medium, fontSize: 13 },
  footRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  trackRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  trackDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  trackText: { flex: 1, color: colors.muted, fontFamily: type.regular, fontSize: 12 },
  lead: { color: colors.muted, fontFamily: type.regular, fontSize: 13.5, lineHeight: 20, marginBottom: 12 },
  input: { height: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, paddingHorizontal: 14, color: colors.cream, fontFamily: type.medium, fontSize: 15 },
});
