import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { fallbackHere, places } from "../data";
import { hasPoint, nearbyAddresses, resolvePlace, searchAddresses } from "../geocode";
import { distanceKm } from "../geo";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { CustomerStack } from "../navigation";
import type { Place } from "../types";

export function SearchScreen({ route, navigation }: NativeStackScreenProps<CustomerStack, "Search">) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const isPickup = route.params.target === "pickup";
  const pickup = store.pickup ?? fallbackHere;
  const [near, setNear] = useState(pickup);
  const [nearby, setNearby] = useState<Place[]>([]);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState("");
  const needle = query.trim();
  const recent = isPickup ? store.recentPickups : store.recentDrops;

  // Bias OSM results to the phone GPS (not Hyderabad demo defaults) for Madhira / field tests.
  useEffect(() => {
    let cancelled = false;
    void Location.getCurrentPositionAsync({})
      .then((position) => {
        if (cancelled) return;
        const spot = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setNear(spot);
        return nearbyAddresses(spot).then((rows) => {
          if (!cancelled) setNearby(rows);
        });
      })
      .catch(() => {
        if (cancelled) return;
        void nearbyAddresses(pickup).then((rows) => {
          if (!cancelled) setNearby(rows);
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (needle.length < 2) {
      setFound([]);
      setSearching(false);
      return;
    }
    const local = places
      .filter((place) => `${place.name} ${place.subtitle}`.toLowerCase().includes(needle.toLowerCase()))
      .filter((place) => distanceKm(near, place) < 80)
      .sort((a, b) => distanceKm(near, a) - distanceKm(near, b));
    setFound(local);
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchAddresses(needle, near, controller.signal)
        .then((remote) => {
          const names = new Set(local.map((place) => place.name.toLowerCase()));
          setFound([...local, ...remote.filter((place) => !names.has(place.name.toLowerCase()))]);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [needle, near.latitude, near.longitude]);

  const [resolving, setResolving] = useState(false);
  const choose = async (picked: Place) => {
    if (resolving) return;
    let place = picked;
    if (!hasPoint(picked)) {
      setResolving(true);
      try {
        place = await resolvePlace(picked);
      } catch {
        setNote("We could not open that place. Try another search.");
        return;
      } finally {
        setResolving(false);
      }
    }
    if (isPickup) {
      store.setPickup(place);
      navigation.goBack();
      return;
    }
    store.rememberDrop(place);
    navigation.navigate("Options", { drop: place });
  };
  const kmTo = (place: Place) => (hasPoint(place) ? distanceKm(near, place) : undefined);

  const locate = async () => {
    setLocating(true);
    setNote("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setNote("Location is off. Search for your pickup instead.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      store.setPickup({ id: "gps", name: "Current location", subtitle: "From this phone", latitude: position.coords.latitude, longitude: position.coords.longitude });
      navigation.goBack();
    } catch {
      setNote("Your location is taking a moment. Search for your pickup instead.");
    } finally {
      setLocating(false);
    }
  };

  const list = needle.length >= 2 ? found : [];
  const saved = [
    store.home ? { place: store.home, label: "Home", icon: "home-outline" as const } : null,
    store.work ? { place: store.work, label: "Work", icon: "briefcase-outline" as const } : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 6 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => navigation.goBack()} style={({ pressed }) => [styles.circle, pressed && { backgroundColor: colors.plum }]}>
          <Ionicons name="arrow-back" size={18} color={colors.cream} />
        </Pressable>
        <Text style={styles.title}>{isPickup ? "Pickup location" : "Where to?"}</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.search}>
          <View style={[styles.dot, { backgroundColor: isPickup ? colors.gold : colors.burgundy, borderColor: isPickup ? colors.night : colors.goldBright }]} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder={isPickup ? "Search pickup area or apartment" : "Search drop location"}
            placeholderTextColor={colors.faint}
            style={styles.input}
            returnKeyType="search"
            autoCorrect={false}
            spellCheck={false}
            selectionColor={colors.gold}
          />
          {searching || resolving ? <ActivityIndicator size="small" color={colors.gold} /> : null}
          {query ? (
            <Pressable accessibilityLabel="Clear" hitSlop={10} onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={18} color={colors.faint} />
            </Pressable>
          ) : null}
        </View>

        {!isPickup && !needle ? (
          <View style={styles.from}>
            <Ionicons name="radio-button-on" size={12} color={colors.gold} />
            <Text style={styles.fromText} numberOfLines={1}>
              From <Text style={styles.fromPlace}>{pickup.name}</Text>
            </Text>
          </View>
        ) : null}

        {isPickup && !needle ? (
          <Pressable onPress={() => void locate()} style={({ pressed }) => [styles.locate, pressed && { backgroundColor: colors.mist }]}>
            <View style={styles.locateIcon}>{locating ? <ActivityIndicator size="small" color={colors.night} /> : <Ionicons name="navigate" size={17} color={colors.night} />}</View>
            <Text style={styles.locateTitle}>{locating ? "Finding you…" : "Use my current location"}</Text>
          </Pressable>
        ) : null}

        {note ? <Text style={styles.note}>{note}</Text> : null}

        {!needle && saved.length ? (
          <>
            <Text style={styles.section}>SAVED PLACES</Text>
            <View style={styles.card}>
              {saved.map((item, index) => (
                <PlaceRow
                  key={item.label}
                  place={{ ...item.place, name: item.label, subtitle: item.place.name }}
                  icon={item.icon}
                  km={isPickup ? undefined : kmTo(item.place)}
                  last={index === saved.length - 1}
                  onPress={() => void choose(item.place)}
                />
              ))}
            </View>
          </>
        ) : null}

        {!needle && nearby.length ? (
          <>
            <Text style={styles.section}>NEAR YOU</Text>
            <View style={styles.card}>
              {nearby.map((place, index) => (
                <PlaceRow key={place.id} place={place} icon="navigate-outline" km={kmTo(place)} last={index === nearby.length - 1} onPress={() => void choose(place)} />
              ))}
            </View>
          </>
        ) : null}

        {needle ? (
          needle.length < 2 ? (
            <Text style={styles.hint}>Keep typing to search…</Text>
          ) : list.length ? (
            <View style={styles.card}>
              {list.map((place, index) => (
                <PlaceRow key={place.id} place={place} icon="location-outline" km={kmTo(place)} last={index === list.length - 1} onPress={() => void choose(place)} />
              ))}
            </View>
          ) : !searching ? (
            <View style={[styles.card, styles.empty]}>
              <Text style={styles.emptyTitle}>No match for "{needle}"</Text>
              <Text style={styles.rowSub}>Try an area, street, or landmark nearby.</Text>
            </View>
          ) : null
        ) : recent.length ? (
          <>
            <Text style={styles.section}>{isPickup ? "RECENT PICKUPS" : "RECENT DROPS"}</Text>
            <View style={styles.card}>
              {recent.map((place, index) => (
                <PlaceRow key={place.id} place={place} icon="time-outline" km={isPickup ? undefined : kmTo(place)} last={index === recent.length - 1} onPress={() => void choose(place)} />
              ))}
            </View>
          </>
        ) : (
          <Text style={styles.hint}>{isPickup ? "Search for your pickup point." : "Search for your destination. Your recent drops will show here."}</Text>
        )}
      </ScrollView>
    </View>
  );
}

function PlaceRow({ place, icon, km, last, onPress }: { place: Place; icon: keyof typeof Ionicons.glyphMap; km?: number; last: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, !last && styles.rowLine, pressed && { backgroundColor: colors.mist }]}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={16} color={colors.gold} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{place.name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>{place.subtitle}</Text>
      </View>
      {km !== undefined ? <Text style={styles.km}>{km < 1 ? "Nearby" : `${km.toFixed(1)} km`}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  circle: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, color: colors.cream, fontFamily: type.display, fontSize: 20, lineHeight: 25, letterSpacing: -0.3 },
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 28 },
  search: { flexDirection: "row", alignItems: "center", gap: 12, height: 54, paddingHorizontal: 18, borderRadius: 27, backgroundColor: colors.inkwell, borderWidth: 1.5, borderColor: colors.gold },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  input: { flex: 1, height: 24, color: colors.cream, fontFamily: type.label, fontSize: 15.5, paddingVertical: 0 },
  from: { marginTop: 12, marginLeft: 6, flexDirection: "row", alignItems: "center", gap: 8 },
  fromText: { flex: 1, color: colors.faint, fontFamily: type.body, fontSize: 13 },
  fromPlace: { color: colors.cream, fontFamily: type.labelStrong },
  locate: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 20, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  locateIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  locateTitle: { flex: 1, color: colors.cream, fontFamily: type.labelStrong, fontSize: 15 },
  note: { marginTop: 12, color: colors.gold, fontFamily: type.label, fontSize: 13 },
  hint: { marginTop: 22, textAlign: "center", color: colors.faint, fontFamily: type.body, fontSize: 13.5, lineHeight: 20 },
  section: { marginTop: 22, marginBottom: 10, color: colors.gold, fontFamily: type.labelStrong, fontSize: 10, letterSpacing: 2.4 },
  card: { marginTop: 14, borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 14 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  rowTitle: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15, overflow: "hidden" },
  rowSub: { marginTop: 2, color: colors.faint, fontFamily: type.body, fontSize: 12.5, overflow: "hidden" },
  km: { color: colors.muted, fontFamily: type.label, fontSize: 12.5 },
  empty: { padding: 22, alignItems: "center", gap: 6 },
  emptyTitle: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15, textAlign: "center" },
});
