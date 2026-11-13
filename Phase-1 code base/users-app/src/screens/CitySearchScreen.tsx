import { useRef, useState } from "react";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Icon } from "../components/kit";
import { cities, cityById, popularCityIds } from "../data";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { UserStack } from "../navigation";

const nearby = [
  { label: "KPHB", cityId: "hyd" },
  { label: "Gachibowli", cityId: "hyd" },
  { label: "LB Nagar", cityId: "hyd" },
  { label: "Ameerpet", cityId: "hyd" },
];

export function CitySearchScreen({ route, navigation }: NativeStackScreenProps<UserStack, "CitySearch">) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const [field, setField] = useState(route.params.field);
  const [fromText, setFromText] = useState(route.params.field === "from" ? "" : cityById(store.search.fromId).name);
  const [toText, setToText] = useState(route.params.field === "to" ? "" : cityById(store.search.toId).name);
  const toInput = useRef<TextInput>(null);
  const query = (field === "from" ? fromText : toText).trim().toLowerCase();
  const otherId = field === "from" ? store.search.toId : store.search.fromId;
  const matches = cities.filter((city) => city.id !== otherId && (!query || `${city.name} ${city.state}`.toLowerCase().includes(query)));

  const choose = (cityId: string) => {
    const name = cityById(cityId).name;
    if (field === "from") {
      store.setSearch({ fromId: cityId, ...(cityId === store.search.toId ? { toId: store.search.fromId } : null) });
      setFromText(name);
      if (route.params.field === "from") {
        setField("to");
        setToText("");
        setTimeout(() => toInput.current?.focus(), 80);
        return;
      }
    } else {
      store.setSearch({ toId: cityId, ...(cityId === store.search.fromId ? { fromId: store.search.toId } : null) });
      setToText(name);
    }
    navigation.goBack();
  };

  return (
    <View style={[styles.screen, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
      <View style={styles.inputs}>
        <Pressable accessibilityLabel="Back" hitSlop={10} onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="arrow-back" size={20} color={colors.cream} />
        </Pressable>
        <View style={{ flex: 1, gap: 10 }}>
          <View style={[styles.field, field === "from" && styles.fieldOn]}>
            <Ionicons name="navigate" size={16} color={colors.gold} />
            <TextInput
              value={fromText}
              onFocus={() => setField("from")}
              onChangeText={setFromText}
              placeholder="Leaving from, search by city"
              placeholderTextColor={colors.faint}
              selectionColor={colors.gold}
              style={styles.text}
              autoFocus={route.params.field === "from"}
            />
          </View>
          <View style={[styles.field, field === "to" && styles.fieldOn]}>
            <Ionicons name="location" size={16} color={colors.rose} />
            <TextInput
              ref={toInput}
              value={toText}
              onFocus={() => setField("to")}
              onChangeText={setToText}
              placeholder="Going to, search by city"
              placeholderTextColor={colors.faint}
              selectionColor={colors.gold}
              style={styles.text}
              autoFocus={route.params.field === "to"}
            />
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {query ? (
          <View style={styles.list}>
            {matches.length ? (
              matches.map((city, index) => (
                <Pressable key={city.id} onPress={() => choose(city.id)} style={[styles.row, index < matches.length - 1 && styles.rowLine]}>
                  <View style={styles.rowIcon}>
                    <Icon name={city.icon} size={18} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{city.name}</Text>
                    <Text style={styles.rowSub}>{city.state}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.faint} />
                </Pressable>
              ))
            ) : (
              <Text style={styles.empty}>No ROVEYA cars from "{query}" yet. Try a nearby city.</Text>
            )}
          </View>
        ) : (
          <>
            {field === "from" ? (
              <>
                <Text style={styles.kicker}>NEARBY PICKUP POINTS</Text>
                <View style={styles.chips}>
                  {nearby.map((spot) => (
                    <Pressable key={spot.label} onPress={() => choose(spot.cityId)} style={styles.chip}>
                      <MaterialCommunityIcons name="car-seat" size={15} color={colors.gold} />
                      <Text style={styles.chipText}>{spot.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.rule} />
              </>
            ) : null}
            <Text style={styles.kicker}>POPULAR CITIES</Text>
            <View style={styles.grid}>
              {popularCityIds
                .filter((id) => id !== otherId)
                .map((id) => {
                  const city = cityById(id);
                  return (
                    <Pressable key={id} onPress={() => choose(id)} style={({ pressed }) => [styles.tile, pressed && { borderColor: colors.gold }]}>
                      <Icon name={city.icon} size={24} />
                      <Text style={styles.tileText} numberOfLines={1}>{city.name}</Text>
                    </Pressable>
                  );
                })}
            </View>
            <Text style={[styles.kicker, { marginTop: 22 }]}>ALL CITIES</Text>
            <View style={styles.list}>
              {matches.map((city, index) => (
                <Pressable key={city.id} onPress={() => choose(city.id)} style={[styles.row, index < matches.length - 1 && styles.rowLine]}>
                  <Text style={styles.rowName}>{city.name}</Text>
                  <Text style={[styles.rowSub, { marginLeft: "auto" }]}>{city.state}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  inputs: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  back: { width: 40, height: 48, alignItems: "center", justifyContent: "center" },
  field: { flexDirection: "row", alignItems: "center", gap: 10, height: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell, paddingHorizontal: 16 },
  fieldOn: { borderColor: colors.gold },
  text: { flex: 1, height: 46, color: colors.cream, fontFamily: type.medium, fontSize: 15 },
  kicker: { color: colors.gold, fontFamily: type.semibold, fontSize: 11, letterSpacing: 2, marginBottom: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  chipText: { color: colors.cream, fontFamily: type.medium, fontSize: 13 },
  rule: { height: 1, backgroundColor: colors.hairline, marginVertical: 18 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { width: "22%", flexGrow: 1, alignItems: "center", gap: 8, paddingVertical: 14, borderRadius: 16, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  tileText: { color: colors.cream, fontFamily: type.medium, fontSize: 12 },
  list: { borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.night, alignItems: "center", justifyContent: "center" },
  rowName: { color: colors.cream, fontFamily: type.semibold, fontSize: 14.5 },
  rowSub: { color: colors.faint, fontFamily: type.regular, fontSize: 12 },
  empty: { padding: 16, color: colors.muted, fontFamily: type.regular, fontSize: 13.5 },
});
