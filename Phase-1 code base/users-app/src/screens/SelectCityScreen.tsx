import { useEffect, useRef, useState } from "react";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { cities, cityById, landmarkCities } from "../data";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { UserStack } from "../navigation";

type Locate = "idle" | "fetching" | "found";

export function SelectCityScreen({ navigation }: NativeStackScreenProps<UserStack, "SelectCity">) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [locate, setLocate] = useState<Locate>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const needle = query.trim().toLowerCase();
  const places = cities.filter((city) => !needle || `${city.name} ${city.state}`.toLowerCase().includes(needle));
  const popular = landmarkCities.filter((item) => !needle || cityById(item.id).name.toLowerCase().includes(needle));

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const choose = (cityId: string) => {
    store.setCity(cityId);
    navigation.goBack();
  };

  // Static preview: pretends the phone's GPS answered from Hyderabad.
  const detect = () => {
    if (locate === "fetching") return;
    setLocate("fetching");
    timer.current = setTimeout(() => {
      setLocate("found");
      store.setCity("hyd");
      timer.current = setTimeout(() => navigation.goBack(), 700);
    }, 1600);
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 6 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.cream} />
        </Pressable>
        <Text style={styles.title}>Select City</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} stickyHeaderIndices={[0]}>
        <View style={styles.sticky}>
          <View style={styles.search}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search places"
              placeholderTextColor={colors.faint}
              selectionColor={colors.gold}
              style={styles.searchInput}
              returnKeyType="search"
            />
            {query ? (
              <Pressable accessibilityLabel="Clear" hitSlop={8} onPress={() => setQuery("")}>
                <Ionicons name="close-circle" size={18} color={colors.faint} />
              </Pressable>
            ) : (
              <Ionicons name="search" size={18} color={colors.gold} />
            )}
          </View>
          <Pressable disabled={locate !== "idle"} onPress={detect} style={({ pressed }) => [styles.detect, pressed && { backgroundColor: colors.mist }, locate === "found" && styles.detectFound]}>
            {locate === "fetching" ? <ActivityIndicator size="small" color={colors.gold} /> : <Ionicons name={locate === "found" ? "checkmark-circle" : "navigate"} size={18} color={locate === "found" ? colors.night : colors.gold} />}
            <Text style={[styles.detectText, locate === "found" && { color: colors.night }]}>
              {locate === "idle" ? "Detect My Location" : locate === "fetching" ? "Location fetching…" : `You are in ${cityById("hyd").name}`}
            </Text>
          </Pressable>
        </View>

        {popular.length ? (
          <>
            <Text style={styles.section}>Popular Cities</Text>
            <View style={styles.grid}>
              {popular.map((item) => {
                const city = cityById(item.id);
                const on = city.id === store.cityId;
                return (
                  <Pressable key={item.id} onPress={() => choose(item.id)} style={({ pressed }) => [styles.tile, on && styles.tileOn, pressed && { borderColor: colors.gold }]}>
                    <MaterialCommunityIcons name={item.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={30} color={on ? colors.night : colors.gold} />
                    <Text style={[styles.tileText, on && { color: colors.night }]} numberOfLines={2}>{city.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        <Text style={styles.section}>All Places</Text>
        <View style={styles.list}>
          {places.length ? (
            places.map((city, index) => {
              const on = city.id === store.cityId;
              return (
                <Pressable key={city.id} onPress={() => choose(city.id)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.inkwell }]}>
                  <MaterialCommunityIcons name="city-variant-outline" size={24} color={on ? colors.gold : colors.muted} />
                  <View style={[styles.rowBody, index < places.length - 1 && styles.rowLine]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowName, on && { color: colors.gold }]}>{city.name}</Text>
                      <Text style={styles.rowState}>{city.state}</Text>
                    </View>
                    {on ? <Ionicons name="checkmark-circle" size={20} color={colors.gold} /> : null}
                  </View>
                </Pressable>
              );
            })
          ) : (
            <Text style={styles.empty}>No ROVEYA cars from "{query.trim()}" yet. Try a nearby town.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  title: { color: colors.cream, fontFamily: type.semibold, fontSize: 18 },
  sticky: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6, gap: 12, backgroundColor: colors.night },
  search: { flexDirection: "row", alignItems: "center", gap: 10, height: 50, borderRadius: 25, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell, paddingHorizontal: 18 },
  searchInput: { flex: 1, height: 48, color: colors.cream, fontFamily: type.medium, fontSize: 15 },
  detect: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 50, borderRadius: 14, borderWidth: 1.2, borderColor: colors.gold, backgroundColor: "rgba(214,160,0,0.06)" },
  detectFound: { backgroundColor: colors.gold },
  detectText: { color: colors.gold, fontFamily: type.semibold, fontSize: 15 },
  section: { marginTop: 22, marginBottom: 12, paddingHorizontal: 16, color: colors.cream, fontFamily: type.semibold, fontSize: 18 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 16 },
  tile: { width: "22.5%", flexGrow: 1, aspectRatio: 0.95, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 4, borderRadius: 16, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  tileOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  tileText: { color: colors.cream, fontFamily: type.medium, fontSize: 12, textAlign: "center" },
  list: { paddingHorizontal: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingLeft: 6 },
  rowBody: { flex: 1, flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rowName: { color: colors.cream, fontFamily: type.medium, fontSize: 15.5 },
  rowState: { marginTop: 1, color: colors.faint, fontFamily: type.regular, fontSize: 12 },
  empty: { paddingVertical: 20, color: colors.muted, fontFamily: type.regular, fontSize: 13.5 },
});
