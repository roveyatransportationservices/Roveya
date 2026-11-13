import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { MapFrame, type Point } from "../components/MapFrame";
import { Header, Skeleton } from "../components/kit";
import { SosButton } from "../components/SosButton";
import { api, live } from "../backend";
import { cityById, departureDate } from "../data";
import { SAFETY_DESK } from "../safety";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { UserStack } from "../navigation";

type Track = {
  trip: { code: string; status: string; from: string; to: string; departAt: string; arriveAt: string; fromPoint: Point | null; toPoint: Point | null };
  car: { name: string; plate: string; color: string } | null;
  captain: { firstName: string } | null;
  position: (Point & { heading: number; speedKmh: number; at: string }) | null;
  shareUrl?: string;
};

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

function ago(iso: string) {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return seconds < 60 ? `${seconds} s ago` : seconds < 3600 ? `${Math.round(seconds / 60)} min ago` : `${Math.round(seconds / 3600)} h ago`;
}

export function TrackScreen({ route, navigation }: NativeStackScreenProps<UserStack, "Track">) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const booking = store.bookings.find((item) => item.pnr === route.params.pnr);
  const [data, setData] = useState<Track | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!booking) return;
    let alive = true;
    const load = async () => {
      try {
        if (live && booking.id) {
          const next = await api<Track>(`/seats/bookings/${booking.id}/track`);
          if (alive) setData(next);
        } else {
          // Preview: the car moves from the first city towards the second over the trip.
          const from = cityById(booking.trip.fromId);
          const to = cityById(booking.trip.toId);
          const start = departureDate(booking.trip).getTime();
          const share = Math.min(1, Math.max(0, (Date.now() - start) / (booking.trip.durationMin * 60000)));
          if (alive)
            setData({
              trip: { code: "RVT-PREVIEW", status: share > 0 ? "on_trip" : "scheduled", from: from.name, to: to.name, departAt: new Date(start).toISOString(), arriveAt: new Date(start + booking.trip.durationMin * 60000).toISOString(), fromPoint: { latitude: from.lat, longitude: from.lng }, toPoint: { latitude: to.lat, longitude: to.lng } },
              car: { name: booking.trip.car, plate: "TS 09 EZ 4821", color: "White" },
              captain: { firstName: "Ravi" },
              position: { latitude: from.lat + (to.lat - from.lat) * share, longitude: from.lng + (to.lng - from.lng) * share, heading: 0, speedKmh: share > 0 && share < 1 ? 68 : 0, at: new Date().toISOString() },
            });
        }
        if (alive) setError("");
      } catch (failure) {
        if (alive) setError((failure as Error).message);
      }
    };
    void load();
    const timer = setInterval(load, 10000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [booking?.pnr]);

  if (!booking) return null;
  const center = data?.position ?? data?.trip.fromPoint ?? null;
  const shareText = data?.shareUrl ? `Follow my ROVEYA trip live: ${data.shareUrl}` : `I'm travelling with ROVEYA, PNR ${booking.pnr}, in ${booking.trip.car}.`;

  return (
    <View style={styles.screen}>
      <Header title="Track your car" subtitle={`${cityById(booking.trip.fromId).name} → ${cityById(booking.trip.toId).name} · PNR ${booking.pnr}`} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom, 16) + 24, gap: 14 }}>
        {center ? <MapFrame center={center} marker={Boolean(data?.position)} height={320} /> : <Skeleton height={320} radius={22} />}
        {data ? (
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={[styles.dot, { backgroundColor: data.trip.status === "on_trip" ? colors.success : colors.gold }]} />
              <Text style={styles.status}>{data.trip.status === "on_trip" ? "On the road" : data.trip.status === "completed" ? "Trip completed" : `Leaves at ${clock(data.trip.departAt)}`}</Text>
              <Text style={styles.small}>{data.position ? `Updated ${ago(data.position.at)}` : "Location appears near departure"}</Text>
            </View>
            {data.car ? (
              <Text style={styles.car}>
                {data.car.name} · {data.car.color} · <Text style={{ color: colors.gold }}>{data.car.plate}</Text>
              </Text>
            ) : null}
            <Text style={styles.small}>
              Captain {data.captain?.firstName ?? ""} · arrives about {clock(data.trip.arriveAt)}
              {data.position?.speedKmh ? ` · ${Math.round(data.position.speedKmh)} km/h` : ""}
            </Text>
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable onPress={() => void Share.share({ message: shareText })} style={styles.share}>
          <Ionicons name="share-social-outline" size={18} color={colors.gold} />
          <View style={{ flex: 1 }}>
            <Text style={styles.shareTitle}>Share live trip with family</Text>
            <Text style={styles.small}>They see the car on a map until you reach. No app needed.</Text>
          </View>
        </Pressable>

        <SosButton context={{ bookingId: booking.id }} />
        <View style={styles.row}>
          <Pressable onPress={() => void Linking.openURL("tel:112")} style={styles.quick}>
            <Ionicons name="call" size={16} color={colors.danger} />
            <Text style={styles.quickText}>Call 112</Text>
          </Pressable>
          <Pressable onPress={() => void Linking.openURL(`tel:${SAFETY_DESK}`)} style={styles.quick}>
            <Ionicons name="headset" size={16} color={colors.gold} />
            <Text style={styles.quickText}>24×7 safety desk</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  card: { padding: 16, gap: 8, borderRadius: 20, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  status: { flex: 1, color: colors.cream, fontFamily: type.semibold, fontSize: 15 },
  car: { color: colors.cream, fontFamily: type.medium, fontSize: 14 },
  small: { color: colors.faint, fontFamily: type.regular, fontSize: 12, lineHeight: 17 },
  error: { color: colors.danger, fontFamily: type.regular, fontSize: 12.5, textAlign: "center" },
  share: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell },
  shareTitle: { color: colors.cream, fontFamily: type.semibold, fontSize: 14 },
  quick: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell },
  quickText: { color: colors.cream, fontFamily: type.medium, fontSize: 13.5 },
});
