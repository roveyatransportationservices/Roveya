import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { isCaptainChair } from "../rules";
import { colors, type } from "../theme";

export type CarCell = {
  id: string;
  label: string;
  row: number;
  col: number;
  window: boolean;
  chair?: boolean;
  price?: number;
  status?: "available" | "held" | "booked" | "offline";
  gender?: "Male" | "Female" | null;
  passenger?: { name: string } | null;
  boarded?: boolean;
};

const ROSE_TINT = "rgba(229,138,168,0.16)";
const SKY = "#8FB4E8";
const SKY_TINT = "rgba(143,180,232,0.14)";

function Cell({ cell, selected, picked, onPress, edit }: { cell: CarCell; selected: boolean; picked: boolean; onPress?: () => void; edit: boolean }) {
  const booked = cell.status === "booked";
  const held = cell.status === "held";
  const offline = cell.status === "offline";
  const woman = cell.gender === "Female";
  const box = edit
    ? selected
      ? { backgroundColor: colors.gold, borderColor: colors.gold }
      : { backgroundColor: colors.night, borderColor: "rgba(246,241,220,0.35)" }
    : picked
      ? { backgroundColor: "rgba(214,160,0,0.18)", borderColor: colors.gold }
      : booked
        ? { backgroundColor: woman ? ROSE_TINT : colors.plum, borderColor: woman ? colors.rose : colors.burgundy }
        : offline
          ? { backgroundColor: woman ? ROSE_TINT : SKY_TINT, borderColor: woman ? colors.rose : SKY }
          : held
            ? { backgroundColor: "rgba(214,160,0,0.08)", borderColor: colors.gold, borderStyle: "dashed" as const }
            : { backgroundColor: colors.night, borderColor: "rgba(246,241,220,0.35)" };
  const ink = edit && selected ? colors.night : colors.cream;
  const sub = edit && selected ? "rgba(18,6,13,0.7)" : picked ? colors.gold : booked ? (woman ? colors.rose : colors.goldBright) : offline ? (woman ? colors.rose : SKY) : held ? colors.gold : colors.faint;
  const status = booked ? `booked by ${cell.passenger?.name ?? "a traveller"}` : offline ? "taken by a passenger outside the app" : held ? "payment in progress" : "free";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: selected || picked }}
      accessibilityLabel={`Seat ${cell.label}${cell.chair ? ", captain seat" : ""}, ${status}`}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.seat, box, pressed && { transform: [{ scale: 0.96 }] }]}
    >
      {cell.boarded ? (
        <View style={styles.corner}>
          <MaterialCommunityIcons name="check-circle" size={15} color={colors.success} />
        </View>
      ) : picked ? (
        <View style={styles.corner}>
          <MaterialCommunityIcons name="checkbox-marked-circle" size={15} color={colors.gold} />
        </View>
      ) : booked || offline ? (
        <View style={styles.corner}>
          <MaterialCommunityIcons name={offline ? "account-cash" : woman ? "face-woman" : "account"} size={13} color={sub} />
        </View>
      ) : null}
      {cell.chair ? (
        <>
          <View style={[styles.armrest, styles.armLeft, { backgroundColor: edit && selected ? "rgba(18,6,13,0.35)" : "rgba(214,160,0,0.45)" }]} />
          <View style={[styles.armrest, styles.armRight, { backgroundColor: edit && selected ? "rgba(18,6,13,0.35)" : "rgba(214,160,0,0.45)" }]} />
        </>
      ) : null}
      <Text style={[styles.label, { color: ink }]} numberOfLines={1}>
        {cell.label}
      </Text>
      <Text style={[styles.sub, { color: sub }]} numberOfLines={1}>
        {edit
          ? cell.chair
            ? "Captain seat"
            : cell.window
              ? "Window"
              : "Middle"
          : picked
            ? "Selected"
            : booked
              ? (cell.passenger?.name.split(" ")[0] ?? "Booked")
              : offline
                ? "Outside"
                : held
                  ? "Paying…"
                  : cell.price
                    ? `₹${cell.price}`
                    : "Free"}
      </Text>
      <View style={[styles.backrest, { backgroundColor: edit && selected ? "rgba(18,6,13,0.45)" : booked ? (woman ? colors.rose : colors.gold) : offline ? SKY : "rgba(246,241,220,0.22)" }]} />
    </Pressable>
  );
}

// layout lets the editor mark captain chairs before a trip exists.
export function CarSeats({ cells, selected, picked = [], onPress, edit = false, layout }: { cells: CarCell[]; selected?: string | null; picked?: string[]; onPress?: (cell: CarCell) => void; edit?: boolean; layout?: string }) {
  const rows = Math.max(0, ...cells.map((cell) => cell.row)) + 1;
  const at = (row: number, col: number) => {
    const cell = cells.find((item) => item.row === row && item.col === col);
    return cell && layout && cell.chair === undefined ? { ...cell, chair: isCaptainChair(layout, cell.row) } : cell;
  };
  return (
    <View style={styles.car}>
      <View style={styles.front}>
        <View style={styles.windshield} />
        <Text style={styles.frontText}>FRONT</Text>
      </View>
      <View style={styles.cabin}>
        {Array.from({ length: rows }, (_, row) => (
          <View key={row} style={styles.row}>
            {[0, 1, 2].map((col) => {
              if (row === 0 && col === 2) {
                return (
                  <View key={col} style={[styles.seat, styles.driver]}>
                    <MaterialCommunityIcons name="steering" size={22} color={colors.gold} />
                    <Text style={styles.driverText}>You</Text>
                  </View>
                );
              }
              const cell = at(row, col);
              if (!cell) {
                const chairs = [0, 2].some((side) => at(row, side)?.chair);
                return (
                  <View key={col} style={styles.aisle}>
                    {chairs ? <Text style={styles.aisleText}>AISLE</Text> : null}
                  </View>
                );
              }
              return <Cell key={col} cell={cell} edit={edit} selected={selected === cell.id} picked={picked.includes(cell.id)} onPress={onPress ? () => onPress(cell) : undefined} />;
            })}
          </View>
        ))}
      </View>
      <View style={styles.boot}>
        <MaterialCommunityIcons name="bag-suitcase-outline" size={14} color={colors.faint} />
        <Text style={styles.bootText}>Boot · luggage</Text>
      </View>
    </View>
  );
}

export function SeatKey() {
  const items: [string, object][] = [
    ["Free", { backgroundColor: colors.night, borderColor: "rgba(246,241,220,0.35)" }],
    ["Paying", { backgroundColor: "rgba(214,160,0,0.08)", borderColor: colors.gold, borderStyle: "dashed" }],
    ["App", { backgroundColor: colors.plum, borderColor: colors.burgundy }],
    ["Outside", { backgroundColor: SKY_TINT, borderColor: SKY }],
    ["Woman", { backgroundColor: ROSE_TINT, borderColor: colors.rose }],
  ];
  return (
    <View style={styles.key}>
      {items.map(([label, box]) => (
        <View key={label} style={styles.keyItem}>
          <View style={[styles.keyBox, box]} />
          <Text style={styles.keyText}>{label}</Text>
        </View>
      ))}
      <View style={styles.keyItem}>
        <MaterialCommunityIcons name="check-circle" size={16} color={colors.success} />
        <Text style={styles.keyText}>Boarded</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  car: { alignSelf: "center", width: 264, borderRadius: 44, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.inkwell, overflow: "hidden" },
  front: { alignItems: "center", paddingTop: 14 },
  windshield: { width: 180, height: 28, borderTopLeftRadius: 36, borderTopRightRadius: 36, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, backgroundColor: "rgba(143,180,232,0.1)", borderWidth: 1, borderColor: "rgba(143,180,232,0.22)" },
  frontText: { marginTop: 6, color: colors.faint, fontFamily: type.semibold, fontSize: 9, letterSpacing: 2 },
  cabin: { gap: 12, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 22 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  seat: { width: 66, height: 72, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center", paddingBottom: 6, paddingHorizontal: 4 },
  aisle: { width: 66, height: 72, alignItems: "center", justifyContent: "center" },
  aisleText: { color: colors.faint, fontFamily: type.semibold, fontSize: 8, letterSpacing: 2, transform: [{ rotate: "-90deg" }] },
  corner: { position: "absolute", top: 4, right: 4 },
  armrest: { position: "absolute", top: 18, width: 3, height: 34, borderRadius: 2 },
  armLeft: { left: 3 },
  armRight: { right: 3 },
  driver: { borderColor: colors.line, backgroundColor: colors.mist, gap: 2 },
  driverText: { color: colors.gold, fontFamily: type.semibold, fontSize: 10 },
  label: { fontFamily: type.semibold, fontSize: 14 },
  sub: { marginTop: 2, fontFamily: type.medium, fontSize: 10 },
  backrest: { position: "absolute", bottom: 6, width: 36, height: 4, borderRadius: 2 },
  boot: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.hairline, backgroundColor: colors.mist },
  bootText: { color: colors.faint, fontFamily: type.medium, fontSize: 11 },
  key: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 12 },
  keyItem: { alignItems: "center", gap: 5 },
  keyBox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5 },
  keyText: { color: colors.muted, fontFamily: type.regular, fontSize: 10.5 },
});
