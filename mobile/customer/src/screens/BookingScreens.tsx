import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Image, Linking, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import { Avatar, Plate } from "../components/kit";
import { Chips, Empty, Group, HeadButton, Line, PageShell, Pill, RoutePair, SectionTitle, Stars, page } from "../components/PageShell";
import { DESK_PHONE, FlowCta, FlowGhost, type FlowIcon } from "../components/StepShell";
import { captains, fallbackHere, places, vehicleCopy } from "../data";
import { vehiclePhotos } from "../fleet";
import { fareParts, inr } from "../geo";
import { clock, dayLabel, duration } from "../pool";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { CustomerStack } from "../navigation";
import type { ParcelBooking, PastRide, PoolBooking } from "../types";

type Nav = NativeStackNavigationProp<CustomerStack>;

function share(message: string) {
  void Share.share({ message }).catch(() => undefined);
}

function useRebook() {
  const store = useStore();
  const navigation = useNavigation<Nav>();
  return (ride: PastRide) => {
    const known = [...places, ...store.recentDrops, ...store.recentPickups, fallbackHere];
    const find = (name: string) => known.find((place) => place.name === name);
    const pickup = find(ride.pickup);
    const drop = find(ride.drop);
    if (pickup) store.setPickup(pickup);
    if (drop) navigation.navigate("Options", { drop });
    else navigation.navigate("Search", { target: "drop" });
  };
}

function payLabel(payment?: string) {
  return payment === "wallet" ? "ROVEYA wallet" : "Cash";
}

type RideFilter = "all" | "Completed" | "Cancelled";

export function ActivityScreen({ navigation }: NativeStackScreenProps<CustomerStack, "Activity">) {
  const store = useStore();
  const rebook = useRebook();
  const [filter, setFilter] = useState<RideFilter>("all");
  const done = store.rides.filter((ride) => ride.status === "Completed");
  const spent = done.reduce((sum, ride) => sum + ride.fare, 0);
  const km = done.reduce((sum, ride) => sum + (ride.distanceKm ?? 0), 0);
  const list = filter === "all" ? store.rides : store.rides.filter((ride) => ride.status === filter);
  const cancelled = store.rides.length - done.length;

  return (
    <PageShell kicker="BOOKINGS" title="My rides" onBack={() => navigation.goBack()}>
      <LinearGradient colors={[colors.burgundy, colors.plum, colors.inkwell]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={page.heroCard}>
        <Text style={page.kicker}>YOUR ROVEYA RIDES</Text>
        <View style={styles.stats}>
          <Stat value={String(done.length)} label="Completed" />
          <View style={styles.statLine} />
          <Stat value={inr(spent)} label="Spent" />
          <View style={styles.statLine} />
          <Stat value={`${km.toFixed(1)} km`} label="Travelled" />
        </View>
      </LinearGradient>

      <View style={{ marginTop: 18 }}>
        <Chips
          items={[
            { key: "all", label: `All · ${store.rides.length}` },
            { key: "Completed", label: `Completed · ${done.length}` },
            { key: "Cancelled", label: `Cancelled · ${cancelled}` },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </View>

      <View style={{ marginTop: 14, gap: 12 }}>
        {list.length ? (
          list.map((ride) => <RideCard key={`${ride.id}-${ride.when}`} ride={ride} onOpen={() => navigation.navigate("Receipt", { id: ride.id })} onRebook={() => rebook(ride)} />)
        ) : (
          <Empty
            icon="bicycle-outline"
            title={filter === "Cancelled" ? "No cancelled rides" : "No rides yet"}
            line={filter === "Cancelled" ? "Every ride you booked went ahead." : "Your bike, auto, and cab trips show up here with receipts."}
            action={filter === "Cancelled" ? undefined : "Book a ride"}
            onAction={() => navigation.navigate("Tabs", { screen: "Home" })}
          />
        )}
      </View>

      <SectionTitle>MORE BOOKINGS</SectionTitle>
      <View style={styles.twin}>
        <MiniLink icon="people-outline" title="Taxipool" sub={store.poolBookings.length ? `${store.poolBookings.length} booked` : "City to city"} onPress={() => navigation.navigate("PoolTrips")} />
        <MiniLink icon="cube-outline" title="Parcels" sub={store.parcels.length ? `${store.parcels.length} sent` : "Send and receive"} onPress={() => navigation.navigate("Parcels")} />
      </View>
    </PageShell>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MiniLink({ icon, title, sub, onPress }: { icon: FlowIcon; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.mini, pressed && { borderColor: colors.gold }]}>
      <View style={styles.miniIcon}>
        <Ionicons name={icon} size={17} color={colors.night} />
      </View>
      <Text style={page.name}>{title}</Text>
      <Text style={page.small}>{sub}</Text>
    </Pressable>
  );
}

function RideCard({ ride, onOpen, onRebook }: { ride: PastRide; onOpen: () => void; onRebook: () => void }) {
  const cancelled = ride.status === "Cancelled";
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [page.card, pressed && { borderColor: colors.gold }]}>
      <View style={styles.rideHead}>
        <Image source={vehiclePhotos[ride.vehicle]} style={styles.thumb} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={page.name}>
            {vehicleCopy[ride.vehicle].title} <Text style={styles.rideId}>· {ride.id}</Text>
          </Text>
          <Text style={page.small}>{ride.when}</Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 5 }}>
          <Text style={[styles.fare, cancelled && { color: colors.faint }]}>{cancelled ? inr(0) : inr(ride.fare)}</Text>
          <Pill label={cancelled ? "Cancelled" : "Completed"} tone={cancelled ? "muted" : "gold"} />
        </View>
      </View>
      <View style={page.rule} />
      <RoutePair from={ride.pickup} to={ride.drop} />
      <View style={page.rule} />
      <View style={styles.rideFoot}>
        {cancelled ? (
          <Text style={page.small}>Cancelled before pickup · No charge</Text>
        ) : ride.rating ? (
          <View style={styles.rated}>
            <Stars value={ride.rating} />
            <Text style={page.small}>You rated {ride.rating}</Text>
          </View>
        ) : (
          <Text style={page.small}>{payLabel(ride.payment)}</Text>
        )}
        <Pressable accessibilityRole="button" onPress={onRebook} hitSlop={8} style={({ pressed }) => [styles.rebook, pressed && { backgroundColor: colors.plum }]}>
          <Ionicons name="refresh" size={13} color={colors.gold} />
          <Text style={styles.rebookText}>Rebook</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

export function ReceiptScreen({ route, navigation }: NativeStackScreenProps<CustomerStack, "Receipt">) {
  const store = useStore();
  const rebook = useRebook();
  const ride = store.rides.find((item) => item.id === route.params.id);
  if (!ride) {
    return (
      <PageShell kicker="RIDE RECEIPT" title="Receipt" onBack={() => navigation.goBack()}>
        <Empty icon="receipt-outline" title="Receipt not found" line="This ride is no longer on this phone." action="My rides" onAction={() => navigation.navigate("Activity")} />
      </PageShell>
    );
  }
  const cancelled = ride.status === "Cancelled";
  const captain = captains[ride.vehicle];
  const km = ride.distanceKm ?? 0;
  const parts = fareParts(ride.vehicle, km, ride.fare);
  const summary = `ROVEYA receipt ${ride.id}\n${ride.pickup} to ${ride.drop}\n${ride.when} · ${vehicleCopy[ride.vehicle].title}\n${cancelled ? "Cancelled before pickup · No charge" : `Fare ${inr(ride.fare)} · ${payLabel(ride.payment)}`}`;

  return (
    <PageShell
      kicker="RIDE RECEIPT"
      title={ride.id}
      onBack={() => navigation.goBack()}
      right={<HeadButton icon="share-outline" label="Share receipt" onPress={() => share(summary)} />}
      footer={
        <>
          <FlowGhost label="Get help" icon="help-buoy-outline" onPress={() => navigation.navigate("Claims", { rideId: ride.id })} />
          <FlowCta label="Book again" icon="refresh" onPress={() => rebook(ride)} />
        </>
      }
    >
      <LinearGradient colors={cancelled ? [colors.plum, colors.inkwell] : [colors.burgundy, colors.plum, colors.inkwell]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={page.heroCard}>
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={page.kicker}>{cancelled ? "RIDE CANCELLED" : "RIDE COMPLETE"}</Text>
            <Text style={[page.big, { marginTop: 6 }]}>{cancelled ? inr(0) : inr(ride.fare)}</Text>
            <Text style={page.lead}>{cancelled ? "Cancelled before pickup · No charge" : `Paid by ${payLabel(ride.payment).toLowerCase()}`}</Text>
          </View>
          <Image source={vehiclePhotos[ride.vehicle]} style={styles.heroPhoto} />
        </View>
        <View style={styles.heroMeta}>
          <Meta icon="calendar-outline" text={ride.when} />
          <Meta icon={ride.vehicle === "bike" ? "bicycle-outline" : "car-outline"} text={vehicleCopy[ride.vehicle].title} />
          {km ? <Meta icon="navigate-outline" text={`${km.toFixed(1)} km`} /> : null}
        </View>
      </LinearGradient>

      <SectionTitle>TRIP</SectionTitle>
      <View style={page.card}>
        <RoutePair from={ride.pickup} fromSub="Pickup" to={ride.drop} toSub="Drop" />
      </View>

      <SectionTitle>CAPTAIN</SectionTitle>
      <View style={[page.card, styles.captain]}>
        <Avatar source={captain.photo} size={48} name={captain.name} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={page.name}>{captain.name}</Text>
          <View style={styles.rated}>
            <Ionicons name="star" size={12} color={colors.gold} />
            <Text style={page.small}>
              {captain.rating.toFixed(2)} · {captain.vehicleName}
            </Text>
          </View>
        </View>
        <Plate value={captain.vehicleNo} />
      </View>

      {!cancelled ? (
        <>
          <SectionTitle>FARE</SectionTitle>
          <View style={page.card}>
            <Line label="Base fare" value={inr(parts.base)} />
            {km ? <Line label={`Distance · ${km.toFixed(1)} km × ₹${parts.perKm}`} value={inr(parts.distance)} /> : null}
            {parts.extra > 0 ? <Line label="Time and traffic" value={inr(parts.extra)} /> : null}
            {parts.extra < 0 ? <Line label="Minimum fare adjustment" value={`−${inr(-parts.extra)}`} /> : null}
            <View style={page.rule} />
            <Line label="Total" value={inr(ride.fare)} strong />
            <Line label="Paid with" value={payLabel(ride.payment)} />
          </View>

          {ride.rating ? (
            <>
              <SectionTitle>YOUR RATING</SectionTitle>
              <View style={[page.card, styles.ratingCard]}>
                <Stars value={ride.rating} size={20} />
                <Text style={page.small}>Thanks for rating {captain.name.split(" ")[0]}.</Text>
              </View>
            </>
          ) : null}
        </>
      ) : null}

      <View style={page.note}>
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.gold} />
        <Text style={page.noteText}>Fare or lost item? Tap Get help and the ROVEYA desk picks it up with your captain.</Text>
      </View>
    </PageShell>
  );
}

function Meta({ icon, text }: { icon: FlowIcon; text: string }) {
  return (
    <View style={styles.meta}>
      <Ionicons name={icon} size={12} color={colors.gold} />
      <Text style={styles.metaText}>{text}</Text>
    </View>
  );
}

type TimeFilter = "upcoming" | "past";

export function PoolTripsScreen({ navigation }: NativeStackScreenProps<CustomerStack, "PoolTrips">) {
  const store = useStore();
  const [filter, setFilter] = useState<TimeFilter>("upcoming");
  const now = Date.now();
  const upcoming = store.poolBookings.filter((booking) => booking.arriveAt >= now);
  const past = store.poolBookings.filter((booking) => booking.arriveAt < now);
  const list = filter === "upcoming" ? upcoming : past;

  return (
    <PageShell
      kicker="BOOKINGS"
      title="Taxipool bookings"
      onBack={() => navigation.goBack()}
      footer={store.poolBookings.length ? <FlowCta label="Book a new seat" icon="add" onPress={() => navigation.navigate("PoolFlow")} /> : undefined}
    >
      {store.poolBookings.length ? (
        <>
          <Chips
            items={[
              { key: "upcoming", label: `Upcoming · ${upcoming.length}` },
              { key: "past", label: `Past · ${past.length}` },
            ]}
            value={filter}
            onChange={setFilter}
          />
          <View style={{ marginTop: 14, gap: 14 }}>
            {list.length ? (
              list.map((booking) => <PoolCard key={booking.id} booking={booking} />)
            ) : (
              <Empty icon="calendar-outline" title={filter === "past" ? "No past journeys" : "No upcoming journeys"} line={filter === "past" ? "Finished journeys move here." : "Your next city-to-city seat shows here."} />
            )}
          </View>
        </>
      ) : (
        <Empty icon="people-outline" title="No seats booked yet" line="Book a seat city to city. Four riders a car, fare shown before you leave." action="Book a seat" onAction={() => navigation.navigate("PoolFlow")} />
      )}
    </PageShell>
  );
}

function PoolCard({ booking }: { booking: PoolBooking }) {
  const minutes = Math.round((booking.arriveAt - booking.departAt) / 60000);
  return (
    <View style={page.card}>
      <View style={styles.ticketHead}>
        <View style={styles.dayChip}>
          <Ionicons name="calendar" size={12} color={colors.night} />
          <Text style={styles.dayText}>{dayLabel(booking.departAt)}</Text>
        </View>
        <Text style={styles.rideId}>{booking.id}</Text>
      </View>

      <View style={styles.legs}>
        <View style={{ flex: 1 }}>
          <Text style={styles.legTime}>{clock(booking.departAt)}</Text>
          <Text style={page.name} numberOfLines={1}>{booking.from}</Text>
          <Text style={page.small} numberOfLines={2}>{booking.boarding}</Text>
        </View>
        <View style={styles.legMid}>
          <Text style={styles.legDur}>{duration(minutes)}</Text>
          <View style={styles.legLine}>
            <View style={styles.legDot} />
            <View style={styles.legDash} />
            <Ionicons name="car-sport" size={14} color={colors.gold} />
            <View style={styles.legDash} />
            <View style={styles.legDot} />
          </View>
        </View>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={styles.legTime}>{clock(booking.arriveAt)}</Text>
          <Text style={[page.name, { textAlign: "right" }]} numberOfLines={1}>{booking.to}</Text>
          <Text style={[page.small, { textAlign: "right" }]} numberOfLines={2}>{booking.dropPoint}</Text>
        </View>
      </View>

      <View style={styles.tear}>
        <View style={[styles.notch, { left: -27 }]} />
        <View style={styles.dash} />
        <View style={[styles.notch, { right: -27 }]} />
      </View>

      <View style={styles.codeRow}>
        <View>
          <Text style={page.kicker}>BOARDING CODE</Text>
          <Text style={styles.code}>{booking.code.split("").join(" ")}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.fare}>{inr(booking.total)}</Text>
          <Text style={page.small}>
            {booking.seats} seat{booking.seats > 1 ? "s" : ""} · {booking.payment === "wallet" ? "Paid" : "Pay at boarding"}
          </Text>
        </View>
      </View>
      <View style={page.rule} />
      <View style={styles.captain}>
        <View style={styles.carIcon}>
          <Ionicons name="car-sport-outline" size={18} color={colors.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={page.name}>{booking.captain}</Text>
          <Text style={page.small}>{booking.car}</Text>
        </View>
        <Plate value={booking.plate} />
      </View>
      <View style={page.actions}>
        <Pressable onPress={() => void Linking.openURL(DESK_PHONE)} style={({ pressed }) => [page.action, pressed && { borderColor: colors.gold }]}>
          <Ionicons name="call-outline" size={15} color={colors.gold} />
          <Text style={page.actionText}>Call desk</Text>
        </Pressable>
        <Pressable
          onPress={() => share(`My ROVEYA taxipool seat: ${booking.from} to ${booking.to}, ${dayLabel(booking.departAt)} at ${clock(booking.departAt)}. Board at ${booking.boarding}. Car ${booking.car} ${booking.plate}.`)}
          style={({ pressed }) => [page.action, pressed && { borderColor: colors.gold }]}
        >
          <Ionicons name="share-social-outline" size={15} color={colors.gold} />
          <Text style={page.actionText}>Share</Text>
        </Pressable>
      </View>
    </View>
  );
}

const parcelIcons: Record<string, FlowIcon> = {
  Documents: "document-text-outline",
  Food: "fast-food-outline",
  Clothes: "shirt-outline",
  Electronics: "phone-portrait-outline",
  Keys: "key-outline",
  Medicines: "medkit-outline",
};

export function ParcelsScreen({ navigation }: NativeStackScreenProps<CustomerStack, "Parcels">) {
  const store = useStore();
  return (
    <PageShell
      kicker="BOOKINGS"
      title="Parcels"
      onBack={() => navigation.goBack()}
      footer={store.parcels.length ? <FlowCta label="Send a new parcel" icon="add" onPress={() => navigation.navigate("ParcelFlow")} /> : undefined}
    >
      {store.parcels.length ? (
        <View style={{ gap: 14 }}>
          {store.parcels.map((parcel) => (
            <ParcelCard key={parcel.id} parcel={parcel} />
          ))}
        </View>
      ) : (
        <Empty icon="cube-outline" title="No parcels yet" line="Send documents, food, keys, and more across the city by bike or auto." action="Send a parcel" onAction={() => navigation.navigate("ParcelFlow")} />
      )}
    </PageShell>
  );
}

function ParcelCard({ parcel }: { parcel: ParcelBooking }) {
  return (
    <View style={page.card}>
      <View style={styles.rideHead}>
        <View style={styles.parcelIcon}>
          <Ionicons name={parcelIcons[parcel.item] ?? "cube-outline"} size={22} color={colors.gold} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={page.name}>
            {parcel.item} <Text style={styles.rideId}>· {parcel.id}</Text>
          </Text>
          <Text style={page.small}>
            By {parcel.vehicle} · {parcel.distanceKm.toFixed(1)} km
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 5 }}>
          <Text style={styles.fare}>{inr(parcel.fare)}</Text>
          <Pill label="Booked" />
        </View>
      </View>
      <View style={page.rule} />
      <RoutePair from={parcel.pickup} fromSub={`${parcel.sender.name} · ${parcel.sender.phone}`} to={parcel.drop} toSub={`${parcel.receiver.name} · ${parcel.receiver.phone}`} />
      <View style={styles.codes}>
        <View style={styles.codeBox}>
          <Text style={page.kicker}>PICKUP CODE</Text>
          <Text style={styles.codeSmall}>{parcel.pickupCode}</Text>
          <Text style={page.small}>Sender shares it</Text>
        </View>
        <View style={styles.codeBox}>
          <Text style={page.kicker}>DELIVERY CODE</Text>
          <Text style={styles.codeSmall}>{parcel.deliveryCode}</Text>
          <Text style={page.small}>Receiver shares it</Text>
        </View>
      </View>
      <View style={page.rule} />
      <View style={styles.captain}>
        <View style={styles.carIcon}>
          <Ionicons name={parcel.vehicle === "bike" ? "bicycle-outline" : "car-outline"} size={18} color={colors.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={page.name}>{parcel.captain}</Text>
          <Text style={page.small}>{parcel.payment === "wallet" ? "Paid from wallet" : "Cash at pickup"}</Text>
        </View>
        <Plate value={parcel.vehicleNo} />
      </View>
      <View style={page.actions}>
        <Pressable onPress={() => void Linking.openURL(DESK_PHONE)} style={({ pressed }) => [page.action, pressed && { borderColor: colors.gold }]}>
          <Ionicons name="call-outline" size={15} color={colors.gold} />
          <Text style={page.actionText}>Call desk</Text>
        </Pressable>
        <Pressable
          onPress={() => share(`ROVEYA parcel ${parcel.id} is on its way to you from ${parcel.pickup}. Share delivery code ${parcel.deliveryCode} with the captain when it arrives.`)}
          style={({ pressed }) => [page.action, pressed && { borderColor: colors.gold }]}
        >
          <Ionicons name="paper-plane-outline" size={15} color={colors.gold} />
          <Text style={page.actionText}>Send code to receiver</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { marginTop: 14, flexDirection: "row", alignItems: "center", paddingVertical: 12, borderRadius: 18, backgroundColor: "rgba(18,6,13,0.45)", borderWidth: 1, borderColor: colors.hairline },
  statValue: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 17 },
  statLabel: { marginTop: 2, color: colors.faint, fontFamily: type.label, fontSize: 11.5 },
  statLine: { width: 1, height: 28, backgroundColor: colors.line },
  twin: { flexDirection: "row", gap: 10 },
  mini: { flex: 1, padding: 14, borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, gap: 2 },
  miniIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  rideHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  thumb: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.paper },
  rideId: { color: colors.faint, fontFamily: type.label, fontSize: 12.5 },
  fare: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 17 },
  rideFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  rated: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  rebook: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night },
  rebookText: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 12.5 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroPhoto: { width: 84, height: 84, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  heroMeta: { marginTop: 14, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  meta: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: "rgba(18,6,13,0.45)", borderWidth: 1, borderColor: colors.hairline },
  metaText: { color: colors.cream, fontFamily: type.label, fontSize: 12 },
  captain: { flexDirection: "row", alignItems: "center", gap: 12 },
  ratingCard: { alignItems: "center", gap: 8 },
  ticketHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dayChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: colors.gold },
  dayText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 12 },
  legs: { marginTop: 16, flexDirection: "row", alignItems: "flex-start", gap: 8 },
  legTime: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 18, marginBottom: 2 },
  legMid: { width: 88, alignItems: "center", paddingTop: 4 },
  legDur: { color: colors.faint, fontFamily: type.label, fontSize: 11.5, marginBottom: 6 },
  legLine: { flexDirection: "row", alignItems: "center", gap: 3, width: "100%" },
  legDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gold },
  legDash: { flex: 1, height: 1.5, backgroundColor: colors.line },
  tear: { marginVertical: 16, flexDirection: "row", alignItems: "center" },
  notch: { position: "absolute", width: 22, height: 22, borderRadius: 11, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line },
  dash: { flex: 1, borderTopWidth: 1.5, borderStyle: "dashed", borderColor: colors.line },
  codeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  code: { marginTop: 4, color: colors.cream, fontFamily: type.labelStrong, fontSize: 26, letterSpacing: 4 },
  carIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  parcelIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  codes: { marginTop: 14, flexDirection: "row", gap: 10 },
  codeBox: { flex: 1, padding: 12, borderRadius: 16, backgroundColor: "rgba(214,160,0,0.08)", borderWidth: 1, borderColor: colors.line },
  codeSmall: { marginVertical: 4, color: colors.cream, fontFamily: type.labelStrong, fontSize: 22, letterSpacing: 4 },
});
