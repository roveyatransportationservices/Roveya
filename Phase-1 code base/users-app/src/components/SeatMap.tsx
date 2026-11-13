import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, type } from "../theme";
import type { Seat, SeatState, Trip } from "../types";

type Look = SeatState | "selected";

const legendItems: { state: Look; label: string }[] = [
  { state: "available", label: "Available" },
  { state: "female", label: "Women only" },
  { state: "selected", label: "Selected" },
  { state: "bookedFemale", label: "Booked (woman)" },
  { state: "booked", label: "Booked" },
];

const ROSE_TINT = "rgba(229,138,168,0.12)";

function look(state: Look) {
  switch (state) {
    case "selected":
      return { box: { backgroundColor: colors.gold, borderColor: colors.gold }, ink: colors.night, sub: "rgba(18,6,13,0.7)" };
    case "female":
      return { box: { backgroundColor: ROSE_TINT, borderColor: colors.rose }, ink: colors.cream, sub: colors.rose };
    case "male":
      return { box: { backgroundColor: "rgba(143,180,232,0.1)", borderColor: colors.sky }, ink: colors.cream, sub: colors.sky };
    case "booked":
      return { box: { backgroundColor: colors.mist, borderColor: colors.mist }, ink: colors.faint, sub: colors.faint };
    case "bookedFemale":
      return { box: { backgroundColor: "rgba(229,138,168,0.22)", borderColor: "rgba(229,138,168,0.22)" }, ink: colors.rose, sub: colors.rose };
    default:
      return { box: { backgroundColor: colors.night, borderColor: "rgba(246,241,220,0.35)" }, ink: colors.cream, sub: colors.faint };
  }
}

export function SeatLegend() {
  return (
    <View style={styles.legend}>
      {legendItems.map((item) => {
        const { box, sub } = look(item.state);
        return (
          <View key={item.label} style={styles.legendItem}>
            <View style={[styles.legendBox, box]}>
              {item.state === "selected" ? <MaterialCommunityIcons name="check" size={12} color={colors.night} /> : null}
              {item.state === "female" || item.state === "bookedFemale" ? <MaterialCommunityIcons name="face-woman" size={12} color={colors.rose} /> : null}
              {item.state === "booked" ? <MaterialCommunityIcons name="account" size={12} color={sub} /> : null}
            </View>
            <Text style={styles.legendText}>{item.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function SeatCell({ seat, on, onPress }: { seat: Seat; on: boolean; onPress: () => void }) {
  const taken = seat.state === "booked" || seat.state === "bookedFemale";
  const state: Look = on ? "selected" : seat.state;
  const { box, ink, sub } = look(state);
  const women = seat.state === "female" || seat.state === "bookedFemale";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled: taken }}
      accessibilityLabel={`Seat ${seat.label}${seat.chair ? ", captain seat" : ""}${taken ? ", booked" : `, ₹${seat.price}`}${seat.state === "female" ? ", women only" : ""}`}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.seat, box, pressed && !taken && { transform: [{ scale: 0.96 }] }]}
    >
      {on ? (
        <View style={styles.corner}>
          <MaterialCommunityIcons name="check-circle" size={15} color={colors.night} />
        </View>
      ) : seat.state === "female" ? (
        <View style={styles.corner}>
          <MaterialCommunityIcons name="face-woman" size={14} color={colors.rose} />
        </View>
      ) : seat.chair && !taken ? (
        <View style={styles.cornerLeft}>
          <MaterialCommunityIcons name="seat-recline-extra" size={13} color={colors.gold} />
        </View>
      ) : null}
      {seat.chair ? (
        <>
          <View style={[styles.armrest, styles.armLeft, { backgroundColor: on ? "rgba(18,6,13,0.35)" : "rgba(214,160,0,0.45)" }]} />
          <View style={[styles.armrest, styles.armRight, { backgroundColor: on ? "rgba(18,6,13,0.35)" : "rgba(214,160,0,0.45)" }]} />
        </>
      ) : null}
      {taken ? (
        <>
          <MaterialCommunityIcons name={seat.state === "bookedFemale" ? "face-woman" : "account"} size={20} color={ink} />
          <Text style={[styles.bookedText, { color: sub }]}>Booked</Text>
        </>
      ) : (
        <>
          <Text style={[styles.price, { color: ink }]}>₹{seat.price}</Text>
          <Text style={[styles.seatId, { color: sub }]}>
            {seat.label}
            {seat.chair ? " · Captain" : seat.window ? " · Window" : ""}
          </Text>
        </>
      )}
      <View style={[styles.backrest, { backgroundColor: on ? "rgba(18,6,13,0.45)" : women ? colors.rose : taken ? "rgba(246,241,220,0.12)" : "rgba(246,241,220,0.25)" }]} />
    </Pressable>
  );
}

export function SeatMap({ trip, selected, onToggle }: { trip: Trip; selected: string[]; onToggle: (seat: Seat) => void }) {
  const rows = Math.max(...trip.seats.map((seat) => seat.row)) + 1;
  const cell = (row: number, col: number) => trip.seats.find((seat) => seat.row === row && seat.col === col);
  return (
    <View style={styles.car}>
      <View style={styles.front}>
        <View style={styles.windshield} />
        <Text style={styles.frontText}>FRONT</Text>
      </View>
      <View style={styles.mirrors} pointerEvents="none">
        <View style={styles.mirror} />
        <View style={styles.mirror} />
      </View>
      <View style={styles.cabin}>
        {Array.from({ length: rows }, (_, row) => (
          <View key={row} style={styles.row}>
            {[0, 1, 2].map((col) => {
              if (row === 0 && col === 2) {
                return (
                  <View key={col} style={[styles.seat, styles.driver]}>
                    <MaterialCommunityIcons name="steering" size={24} color={colors.faint} />
                    <Text style={styles.driverText}>Captain</Text>
                  </View>
                );
              }
              const seat = cell(row, col);
              if (!seat) {
                const chairs = trip.seats.some((item) => item.row === row && item.chair);
                return (
                  <View key={col} style={styles.aisle}>
                    {chairs ? <Text style={styles.aisleText}>AISLE</Text> : null}
                  </View>
                );
              }
              return <SeatCell key={col} seat={seat} on={selected.includes(seat.id)} onPress={() => onToggle(seat)} />;
            })}
          </View>
        ))}
      </View>
      <View style={styles.boot}>
        <MaterialCommunityIcons name="bag-suitcase-outline" size={15} color={colors.faint} />
        <Text style={styles.bootText}>Boot · luggage</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 },
  legendItem: { flex: 1, alignItems: "center", gap: 6 },
  legendBox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  legendText: { color: colors.muted, fontFamily: type.regular, fontSize: 10.5, textAlign: "center" },
  car: { alignSelf: "center", width: 264, borderRadius: 44, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.inkwell, overflow: "hidden" },
  front: { alignItems: "center", paddingTop: 14 },
  windshield: { width: 180, height: 30, borderTopLeftRadius: 36, borderTopRightRadius: 36, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, backgroundColor: "rgba(143,180,232,0.1)", borderWidth: 1, borderColor: "rgba(143,180,232,0.22)" },
  frontText: { marginTop: 6, color: colors.faint, fontFamily: type.semibold, fontSize: 9, letterSpacing: 2 },
  mirrors: { position: "absolute", top: 54, left: -4, right: -4, flexDirection: "row", justifyContent: "space-between" },
  mirror: { width: 10, height: 20, borderRadius: 4, backgroundColor: colors.plum },
  cabin: { gap: 12, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 22 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  seat: { width: 66, height: 72, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center", paddingBottom: 6 },
  aisle: { width: 66, height: 72, alignItems: "center", justifyContent: "center" },
  aisleText: { color: colors.faint, fontFamily: type.semibold, fontSize: 8, letterSpacing: 2, transform: [{ rotate: "-90deg" }] },
  corner: { position: "absolute", top: 4, right: 4 },
  cornerLeft: { position: "absolute", top: 5, left: 5 },
  armrest: { position: "absolute", top: 18, width: 3, height: 34, borderRadius: 2 },
  armLeft: { left: 3 },
  armRight: { right: 3 },
  driver: { borderColor: colors.hairline, backgroundColor: colors.mist, gap: 2 },
  driverText: { color: colors.faint, fontFamily: type.medium, fontSize: 10 },
  backrest: { position: "absolute", bottom: 6, width: 36, height: 4, borderRadius: 2 },
  price: { fontFamily: type.semibold, fontSize: 14.5 },
  seatId: { marginTop: 2, fontFamily: type.medium, fontSize: 9.5 },
  bookedText: { marginTop: 2, fontFamily: type.medium, fontSize: 10 },
  boot: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.hairline, backgroundColor: colors.mist },
  bootText: { color: colors.faint, fontFamily: type.medium, fontSize: 11 },
});
