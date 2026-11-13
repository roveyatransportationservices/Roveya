import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CitySheet, Toggle } from "../components/Form";
import { Button, Chip, Header, Skeleton } from "../components/kit";
import { cityName, clock, inr, nextDays } from "../format";
import { CITIES, fromIst, seatDeltaRupees } from "../rules";
import { service } from "../service";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { FareHint } from "../types";
import type { CaptainStack } from "../navigation";

const HOURS = Array.from({ length: 20 }, (_, index) => index + 4);
const MINUTES = [0, 15, 30, 45];
const pad = (value: number) => String(value).padStart(2, "0");

export function PublishScreen({ navigation }: NativeStackScreenProps<CaptainStack, "Publish">) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const car = store.profile?.car;
  const home = CITIES.find((city) => city.name === store.profile?.captain.city)?.id ?? "hyd";
  const days = useMemo(() => nextDays(14), []);
  const [fromId, setFromId] = useState(home);
  const [toId, setToId] = useState(home === "vja" ? "hyd" : "vja");
  const [picking, setPicking] = useState<"from" | "to" | null>(null);
  const [date, setDate] = useState(days[0].iso);
  const [hour, setHour] = useState(Math.min(23, Number(new Date(Date.now() + 330 * 60000 + 2 * 3600000).getUTCHours())));
  const [minute, setMinute] = useState(0);
  const [fare, setFare] = useState("");
  const [hint, setHint] = useState<FareHint | null>(null);
  const [boarding, setBoarding] = useState<string[]>([]);
  const [drops, setDrops] = useState<string[]>([]);
  const [womenFriendly, setWomenFriendly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setHint(null);
    service
      .fareHint(fromId, toId)
      .then((next) => {
        if (!alive) return;
        setHint(next);
        setFare(String(next.suggested));
        setBoarding(next.boarding.slice(0, 2).map((point) => point.id));
        setDrops(next.drops.slice(0, 1).map((point) => point.id));
      })
      .catch((failure: Error) => alive && setError(failure.message));
    return () => {
      alive = false;
    };
  }, [fromId, toId]);

  const time = `${pad(hour)}:${pad(minute)}`;
  const depart = fromIst(date, time);
  const tooSoon = !depart || depart.getTime() < Date.now() + 60 * 60000;
  const fareNumber = Number(fare);
  const fareBad = !hint || !(fareNumber >= hint.bounds.min && fareNumber <= hint.bounds.max);
  const ready = Boolean(hint) && !tooSoon && !fareBad && boarding.length > 0 && drops.length > 0 && fromId !== toId;

  const toggle = (list: string[], set: (next: string[]) => void, id: string) => set(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);

  const publish = async () => {
    if (!hint || !ready) return;
    setBusy(true);
    setError("");
    try {
      const pickup = boarding.map((id, index) => ({ ...hint.boarding.find((point) => point.id === id)!, offsetMin: index * 15 }));
      const lastBoard = (pickup.length - 1) * 15;
      const result = await service.publish({
        fromId,
        toId,
        date,
        time,
        fare: fareNumber,
        durationMin: hint.durationMin,
        boarding: pickup,
        drops: drops.map((id, index) => ({ ...hint.drops.find((point) => point.id === id)!, offsetMin: lastBoard + hint.durationMin - 20 + index * 10 })),
        womenFriendly,
      });
      navigation.replace("Trip", { id: result.trip.id });
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Header title="Publish a trip" subtitle={car ? `${car.makeModel} · ${car.seatCount} seats` : undefined} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 150, gap: 14 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Pressable onPress={() => setPicking("from")} style={styles.place}>
            <Ionicons name="navigate" size={18} color={colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={styles.placeLabel}>Leaving from</Text>
              <Text style={styles.placeValue}>{cityName(fromId)}</Text>
            </View>
          </Pressable>
          <View style={styles.rule} />
          <Pressable onPress={() => setPicking("to")} style={styles.place}>
            <Ionicons name="location" size={18} color={colors.rose} />
            <View style={{ flex: 1 }}>
              <Text style={styles.placeLabel}>Going to</Text>
              <Text style={styles.placeValue}>{cityName(toId)}</Text>
            </View>
          </Pressable>
          <Pressable
            accessibilityLabel="Swap cities"
            onPress={() => {
              setFromId(toId);
              setToId(fromId);
            }}
            style={styles.swap}
          >
            <Ionicons name="swap-vertical" size={18} color={colors.gold} />
          </Pressable>
        </View>

        <Text style={styles.section}>DATE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {days.map((day) => {
            const on = day.iso === date;
            return (
              <Pressable key={day.iso} onPress={() => setDate(day.iso)} style={[styles.day, on && styles.dayOn]}>
                <Text style={[styles.dayName, on && { color: colors.night }]}>{day.day}</Text>
                <Text style={[styles.dayNum, on && { color: colors.night }]}>{day.date}</Text>
                <Text style={[styles.dayName, on && { color: colors.night }]}>{day.month}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.section}>DEPARTURE · {clock(time)}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {HOURS.map((value) => (
            <Chip key={value} label={`${value % 12 || 12} ${value < 12 ? "AM" : "PM"}`} on={hour === value} onPress={() => setHour(value)} />
          ))}
        </ScrollView>
        <View style={styles.row}>
          {MINUTES.map((value) => (
            <Chip key={value} label={`:${pad(value)}`} on={minute === value} onPress={() => setMinute(value)} />
          ))}
        </View>
        {tooSoon ? <Text style={styles.error}>Pick a time at least 1 hour from now.</Text> : null}

        <Text style={styles.section}>SEAT FARE</Text>
        {hint ? (
          <View style={styles.card}>
            <View style={styles.fareRow}>
              <Text style={styles.rupee}>₹</Text>
              <TextInput value={fare} onChangeText={(text) => setFare(text.replace(/\D/g, "").slice(0, 5))} keyboardType="number-pad" selectionColor={colors.gold} style={styles.fareInput} />
              <Pressable onPress={() => setFare(String(hint.suggested))} style={styles.suggest}>
                <Text style={styles.suggestText}>Suggested {inr(hint.suggested)}</Text>
              </Pressable>
            </View>
            <Text style={[styles.small, fareBad && { color: colors.danger }]}>
              Allowed on this route: {inr(hint.bounds.min)} to {inr(hint.bounds.max)} · about {Math.floor(hint.durationMin / 60)}h {pad(hint.durationMin % 60)}m drive
            </Text>
            {car && !fareBad ? (
              <View style={styles.prices}>
                {car.seats.map((seat) => (
                  <View key={seat.id} style={styles.price}>
                    <Text style={styles.priceLabel}>{seat.label}</Text>
                    <Text style={styles.priceValue}>{inr(Math.max(99, fareNumber + seatDeltaRupees(seat, car.layout)))}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <Skeleton height={110} radius={18} />
        )}

        <Text style={styles.section}>BOARDING POINTS IN {cityName(fromId).toUpperCase()}</Text>
        <View style={styles.list}>
          {(hint?.boarding ?? []).map((point) => {
            const index = boarding.indexOf(point.id);
            const on = index >= 0;
            return (
              <Pressable key={point.id} onPress={() => toggle(boarding, setBoarding, point.id)} style={[styles.point, on && { backgroundColor: colors.mist }]}>
                <View style={[styles.check, on && styles.checkOn]}>{on ? <Ionicons name="checkmark" size={14} color={colors.night} /> : null}</View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pointName}>{point.name}</Text>
                  <Text style={styles.small}>{point.landmark}</Text>
                </View>
                {on ? <Text style={styles.offset}>{index === 0 ? clock(time) : `+${index * 15} min`}</Text> : null}
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.section}>DROP POINTS IN {cityName(toId).toUpperCase()}</Text>
        <View style={styles.list}>
          {(hint?.drops ?? []).map((point) => {
            const on = drops.includes(point.id);
            return (
              <Pressable key={point.id} onPress={() => toggle(drops, setDrops, point.id)} style={[styles.point, on && { backgroundColor: colors.mist }]}>
                <View style={[styles.check, on && styles.checkOn]}>{on ? <Ionicons name="checkmark" size={14} color={colors.night} /> : null}</View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pointName}>{point.name}</Text>
                  <Text style={styles.small}>{point.landmark}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Toggle label="Women friendly" sub="Shown to women travellers first. Turn on if you or a woman co-traveller will be in the car." on={womenFriendly} onPress={() => setWomenFriendly(!womenFriendly)} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Button label={busy ? "Publishing…" : `Publish ${cityName(fromId)} → ${cityName(toId)}`} icon="mc:car-arrow-right" loading={busy} disabled={!ready} onPress={() => void publish()} />
      </View>
      <CitySheet visible={picking !== null} onClose={() => setPicking(null)} exclude={picking === "from" ? toId : fromId} onPick={(id) => (picking === "from" ? setFromId(id) : setToId(id))} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  card: { padding: 16, borderRadius: 20, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, gap: 10 },
  place: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4, paddingRight: 50 },
  placeLabel: { color: colors.faint, fontFamily: type.regular, fontSize: 12 },
  placeValue: { marginTop: 1, color: colors.cream, fontFamily: type.semibold, fontSize: 17 },
  rule: { height: 1, backgroundColor: colors.hairline, marginLeft: 30 },
  swap: { position: "absolute", right: 16, top: 44, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  section: { marginTop: 4, color: colors.gold, fontFamily: type.semibold, fontSize: 11, letterSpacing: 2 },
  day: { width: 56, alignItems: "center", paddingVertical: 8, borderRadius: 14, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  dayOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  dayName: { color: colors.faint, fontFamily: type.regular, fontSize: 11 },
  dayNum: { color: colors.cream, fontFamily: type.semibold, fontSize: 17 },
  row: { flexDirection: "row", gap: 8 },
  error: { color: colors.danger, fontFamily: type.regular, fontSize: 12.5, lineHeight: 18 },
  fareRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  rupee: { color: colors.gold, fontFamily: type.bold, fontSize: 26 },
  fareInput: { flex: 1, minWidth: 0, height: 48, color: colors.cream, fontFamily: type.bold, fontSize: 26 },
  suggest: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: colors.line },
  suggestText: { color: colors.gold, fontFamily: type.medium, fontSize: 12 },
  small: { color: colors.faint, fontFamily: type.regular, fontSize: 12, lineHeight: 17 },
  prices: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.hairline },
  price: { minWidth: 62, alignItems: "center", paddingVertical: 6, paddingHorizontal: 8, borderRadius: 10, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.hairline },
  priceLabel: { color: colors.faint, fontFamily: type.medium, fontSize: 10.5 },
  priceValue: { color: colors.cream, fontFamily: type.semibold, fontSize: 13 },
  list: { borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  point: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.faint, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  pointName: { color: colors.cream, fontFamily: type.medium, fontSize: 14 },
  offset: { color: colors.gold, fontFamily: type.semibold, fontSize: 12 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.inkwell, borderTopWidth: 1, borderTopColor: colors.line },
});
