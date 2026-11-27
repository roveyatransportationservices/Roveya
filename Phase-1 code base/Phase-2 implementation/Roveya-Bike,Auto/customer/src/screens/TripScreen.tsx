import { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, watch } from "../backend";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { CustomerStack } from "../navigation";
import { locationAfterCaptainChange, nextTripStatus, shouldReturnToSearching } from "../clientSync";
import type { ActiveTrip } from "../types";
import { FindingRide } from "./FindingRide";
import { LiveTrip } from "./LiveTrip";

type ServerRide = {
  status: string;
  otp: string | null;
  cancelledBy: string | null;
  captainUserId?: string | null;
  offRoute?: boolean;
  captain: {
    name: string;
    rating: number;
    trips: number;
    vehicleNo: string;
    vehicleName: string;
    location: { latitude: number; longitude: number; heading: number; updatedAt?: string | null } | null;
  } | null;
};

const emptyCaptain = { name: "Looking for a captain", rating: 0, vehicleNo: "", vehicleName: "", trips: 0 };

export function TripScreen({ navigation }: NativeStackScreenProps<CustomerStack, "Trip">) {
  const store = useStore();
  const trip = store.trip;
  const tripRef = useRef(trip);
  tripRef.current = trip;
  const [notice, setNotice] = useState("");

  const serverId = trip?.serverId;
  const syncing = Boolean(serverId) && trip?.status !== "rating" && trip?.status !== "done";

  useEffect(() => {
    if (!serverId || !syncing) return;
    let stopped = false;
    const pull = async () => {
      const ride = await api<ServerRide>(`/rides/${serverId}`).catch(() => null);
      const current = tripRef.current;
      if (stopped || !ride || !current) return;
      if (ride.status === "cancelled" || ride.status === "expired") {
        setNotice(ride.status === "expired" ? "No captain was free nearby. Please try again." : ride.cancelledBy === "captain" ? "The captain cancelled. Please book again." : "");
        store.cancelTrip();
        return;
      }
      if (shouldReturnToSearching(current.status, ride.status)) {
        setNotice("That captain dropped the ride. Still looking for the next one.");
        store.patchTrip({ status: "searching", progress: 0, captain: emptyCaptain, captainUserId: null, captainAt: undefined, otp: "" });
        return;
      }
      const next = nextTripStatus(current.status, ride.status);
      const patch: Partial<ActiveTrip> = {};
      if (next) patch.status = next;
      if (ride.otp) patch.otp = ride.otp;
      if (typeof ride.offRoute === "boolean") patch.offRoute = ride.offRoute;
      const nextCaptainId = ride.captainUserId ?? null;
      if (ride.captain) {
        patch.captainUserId = nextCaptainId;
        patch.captain = { ...current.captain, photo: undefined, name: ride.captain.name, rating: ride.captain.rating, trips: ride.captain.trips, vehicleNo: ride.captain.vehicleNo, vehicleName: ride.captain.vehicleName };
        if (ride.captain.location) {
          const incoming = {
            latitude: ride.captain.location.latitude,
            longitude: ride.captain.location.longitude,
            heading: ride.captain.location.heading ?? 0,
            updatedAt: ride.captain.location.updatedAt ?? null,
          };
          const kept = locationAfterCaptainChange(current.captainUserId, nextCaptainId, current.captainAt ?? null, incoming);
          if (kept) patch.captainAt = kept;
        } else if (nextCaptainId && current.captainUserId && nextCaptainId !== current.captainUserId) {
          patch.captainAt = undefined;
        }
      } else if (ride.status === "searching") {
        patch.captain = emptyCaptain;
        patch.captainUserId = null;
        patch.captainAt = undefined;
      }
      store.patchTrip(patch);
    };
    void pull();
    const timer = setInterval(() => void pull(), 3000);
    const unwatch = watch("trips", `id=eq.${serverId}`, () => void pull());
    return () => {
      stopped = true;
      clearInterval(timer);
      unwatch();
    };
  }, [serverId, syncing]);

  if (!trip) {
    return (
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <Ionicons name="navigate" size={22} color={colors.gold} />
        </View>
        <Text style={styles.emptyTitle}>{notice ? "Ride ended" : "No ride in progress"}</Text>
        <Text style={styles.emptyBody}>{notice || "Book a bike or auto from the Ride tab."}</Text>
        <Pressable onPress={() => navigation.navigate("Tabs")} style={styles.emptyButton}>
          <Text style={styles.emptyButtonText}>Back to Ride</Text>
        </Pressable>
      </View>
    );
  }

  const leave = () => navigation.navigate("Tabs");
  const cancel = (reason?: string) => {
    const message = store.cancelTrip(reason);
    if (message && trip.status === "onTrip") {
      Alert.alert("Ride in progress", message);
      return;
    }
    if (trip.serverId) void api(`/rides/${trip.serverId}/cancel`, { body: { reason: reason || "Cancelled by passenger" } }).catch(() => undefined);
    if (message) Alert.alert("Ride cancelled", message);
    leave();
  };

  if (trip.status === "searching") return <FindingRide trip={trip} onCancel={cancel} />;
  return <LiveTrip trip={trip} onCancel={cancel} onDone={leave} onSafety={() => navigation.navigate("Safety")} />;
}

const styles = StyleSheet.create({
  empty: { flex: 1, backgroundColor: colors.night, alignItems: "center", justifyContent: "center", padding: 24, gap: 10 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { color: colors.cream, fontFamily: type.display, fontSize: 20 },
  emptyBody: { color: colors.muted, fontFamily: type.body, fontSize: 13.5, textAlign: "center" },
  emptyButton: { marginTop: 8, height: 50, paddingHorizontal: 28, borderRadius: 25, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  emptyButtonText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 15.5 },
});
