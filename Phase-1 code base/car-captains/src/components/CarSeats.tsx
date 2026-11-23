import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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

function chairTone(cell: CarCell | null, driver = false) {
  if (driver) return { back: colors.gold, seat: colors.mist, edge: colors.gold, lip: "#3A1024", ink: colors.gold };
  if (!cell) return null;
  const booked = cell.status === "booked";
  const woman = cell.gender === "Female";
  const offline = cell.status === "offline";
  const held = cell.status === "held";
  if (booked) return { back: woman ? colors.rose : colors.gold, seat: woman ? ROSE_TINT : colors.plum, edge: woman ? colors.rose : colors.burgundy, lip: "#12060D", ink: colors.cream };
  if (offline) return { back: SKY, seat: SKY_TINT, edge: SKY, lip: "#12060D", ink: colors.cream };
  if (held) return { back: colors.gold, seat: "rgba(214,160,0,0.14)", edge: colors.gold, lip: "#12060D", ink: colors.gold };
  return { back: "rgba(246,241,220,0.62)", seat: "#14080E", edge: "rgba(246,241,220,0.32)", lip: "#0C0408", ink: colors.cream };
}

function Chair3D({ cell, driver, selected, picked, onPress }: { cell?: CarCell | null; driver?: boolean; selected?: boolean; picked?: boolean; onPress?: () => void }) {
  const tone = chairTone(cell ?? null, driver);
  if (!tone) return <View style={styles.pod} />;
  const back = selected || picked ? colors.gold : tone.back;
  return (
    <Pressable accessibilityRole={onPress ? "button" : undefined} disabled={!onPress} onPress={onPress} style={styles.pod}>
      <View style={styles.chair}>
        <View style={[styles.backWall, { backgroundColor: tone.lip }]} />
        <View style={[styles.back3, { backgroundColor: back }]}>
          <View style={styles.backSheen} />
        </View>
        <View style={[styles.cushion3, { backgroundColor: tone.seat, borderColor: selected || picked ? colors.gold : tone.edge }]}>
          {driver ? <MaterialCommunityIcons name="steering" size={16} color={colors.gold} /> : <Text style={[styles.cushionLabel, { color: tone.ink }]} numberOfLines={1}>{cell?.label}</Text>}
        </View>
        <View style={[styles.lip3, { backgroundColor: tone.lip }]} />
      </View>
    </Pressable>
  );
}

function Cabin3D({ cells, selected, picked, onPress, layout }: { cells: CarCell[]; selected?: string | null; picked: string[]; onPress?: (cell: CarCell) => void; layout?: string }) {
  const rows = Math.max(0, ...cells.map((cell) => cell.row)) + 1;
  const at = (row: number, col: number) => {
    const cell = cells.find((item) => item.row === row && item.col === col);
    return cell && layout && cell.chair === undefined ? { ...cell, chair: isCaptainChair(layout, cell.row) } : cell;
  };
  return (
    <View style={styles.shell}>
      <View style={styles.roof} />
      <LinearGradient colors={["rgba(143,180,232,0.5)", "rgba(143,180,232,0.08)"]} style={styles.glass}>
        <View style={styles.glassShine} />
        <Text style={styles.frontText}>FRONT</Text>
      </LinearGradient>
      <View style={styles.cabin3}>
        <View style={styles.windowRail} />
        <View style={styles.deck}>
          {Array.from({ length: rows }, (_, row) => (
            <View key={row} style={[styles.deckRow, { transform: [{ scale: 1 - row * 0.06 }] }]}>
              {[0, 1, 2].map((col) => {
                if (row === 0 && col === 2) return <Chair3D key={col} driver />;
                const cell = at(row, col);
                if (!cell) return <View key={col} style={styles.pod} />;
                return <Chair3D key={col} cell={cell} selected={selected === cell.id} picked={picked.includes(cell.id)} onPress={onPress ? () => onPress(cell) : undefined} />;
              })}
            </View>
          ))}
        </View>
        <View style={styles.windowRail} />
      </View>
      <View style={styles.boot}>
        <MaterialCommunityIcons name="bag-suitcase-outline" size={14} color={colors.faint} />
        <Text style={styles.bootText}>Boot · luggage</Text>
      </View>
    </View>
  );
}

// layout lets the editor mark captain chairs before a trip exists.
export function CarSeats({ cells, selected, picked = [], onPress, edit = false, layout, depth = false, onAdd, onRemove }: { cells: CarCell[]; selected?: string | null; picked?: string[]; onPress?: (cell: CarCell) => void; edit?: boolean; layout?: string; depth?: boolean; onAdd?: () => void; onRemove?: () => void }) {
  const cabin = depth ? <Cabin3D cells={cells} selected={selected} picked={picked} onPress={onPress} layout={layout} /> : null;
  if (depth && (onAdd || onRemove)) {
    return (
      <View style={styles.stage}>
        {cabin}
        <View style={styles.stepper}>
          <Pressable accessibilityRole="button" accessibilityLabel="Add a seat" disabled={!onAdd} onPress={onAdd} style={[styles.plus, !onAdd && styles.stepOff]}>
            <Text style={styles.plusText}>+</Text>
          </Pressable>
          <Text style={styles.stepCount}>{cells.length}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Remove a seat" disabled={!onRemove} onPress={onRemove} style={[styles.minus, !onRemove && styles.stepOff]}>
            <Text style={styles.minusText}>−</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  if (depth) return cabin;
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
  stage: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, alignSelf: "center" },
  stepper: { alignItems: "center", gap: 8 },
  plus: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  plusText: { color: colors.night, fontFamily: type.semibold, fontSize: 22, lineHeight: 24 },
  minus: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  minusText: { color: colors.cream, fontFamily: type.semibold, fontSize: 14, lineHeight: 16 },
  stepCount: { color: colors.muted, fontFamily: type.semibold, fontSize: 12 },
  stepOff: { opacity: 0.35 },
  shell: { width: 248, borderRadius: 40, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.inkwell, overflow: "hidden" },
  roof: { height: 10, marginHorizontal: 54, marginTop: 8, borderTopLeftRadius: 10, borderTopRightRadius: 10, backgroundColor: "#1A0A12", borderWidth: 1, borderBottomWidth: 0, borderColor: colors.line },
  glass: { height: 42, marginHorizontal: 22, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, borderWidth: 1, borderColor: "rgba(143,180,232,0.4)", alignItems: "center", justifyContent: "flex-end", paddingBottom: 5, overflow: "hidden" },
  glassShine: { position: "absolute", top: 0, left: 18, width: 36, height: 42, backgroundColor: "rgba(246,241,220,0.16)", transform: [{ skewX: "-18deg" }] },
  cabin3: { flexDirection: "row", backgroundColor: "#10060C" },
  windowRail: { width: 7, marginVertical: 8, borderRadius: 4, backgroundColor: "rgba(143,180,232,0.16)", borderWidth: 1, borderColor: "rgba(143,180,232,0.22)" },
  deck: { flex: 1, gap: 0, paddingHorizontal: 6, paddingTop: 8, paddingBottom: 10, transform: [{ perspective: 700 }, { rotateX: "14deg" }] },
  deckRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  pod: { width: 72, height: 68, alignItems: "center", justifyContent: "flex-end" },
  chair: { width: 62, alignItems: "center" },
  backWall: { position: "absolute", top: 6, width: 44, height: 28, borderRadius: 6, transform: [{ translateY: -3 }] },
  back3: { width: 46, height: 24, borderTopLeftRadius: 9, borderTopRightRadius: 9, overflow: "hidden", marginBottom: -7, zIndex: 1 },
  backSheen: { height: 6, backgroundColor: "rgba(246,241,220,0.32)" },
  cushion3: { width: 60, height: 30, borderRadius: 8, borderWidth: 1.5, alignItems: "center", justifyContent: "center", zIndex: 2 },
  cushionLabel: { fontFamily: type.semibold, fontSize: 11 },
  lip3: { width: 52, height: 8, borderBottomLeftRadius: 7, borderBottomRightRadius: 7, marginTop: -1, zIndex: 1 },
  key: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 12 },
  keyItem: { alignItems: "center", gap: 5 },
  keyBox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5 },
  keyText: { color: colors.muted, fontFamily: type.regular, fontSize: 10.5 },
});
