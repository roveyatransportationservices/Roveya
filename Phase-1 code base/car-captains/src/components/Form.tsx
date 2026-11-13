import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from "react-native";
import { CITIES } from "../rules";
import { colors, type } from "../theme";
import { Sheet } from "./kit";

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  error,
  hint,
  maxLength,
  secure,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "words" | "characters" | "sentences";
  error?: string;
  hint?: string;
  maxLength?: number;
  secure?: boolean;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={[styles.label, focus && { color: colors.gold }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        maxLength={maxLength}
        secureTextEntry={secure}
        selectionColor={colors.gold}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={[styles.input, focus && styles.inputFocus, error ? styles.inputBad : null]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Picker({ label, value, placeholder, onPress, error }: { label: string; value: string; placeholder: string; onPress: () => void; error?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={onPress} style={[styles.input, styles.picker, error ? styles.inputBad : null]}>
        <Text style={[styles.pickerText, !value && { color: colors.faint }]}>{value || placeholder}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.gold} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function CitySheet({ visible, onClose, onPick, exclude }: { visible: boolean; onClose: () => void; onPick: (id: string) => void; exclude?: string }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = CITIES.filter((city) => city.id !== exclude && (!needle || city.name.toLowerCase().includes(needle)));
  return (
    <Sheet visible={visible} onClose={onClose} title="Pick a city">
      <TextInput value={query} onChangeText={setQuery} placeholder="Search cities" placeholderTextColor={colors.faint} selectionColor={colors.gold} style={[styles.input, { marginBottom: 10 }]} />
      <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
        {shown.map((city) => (
          <Pressable
            key={city.id}
            onPress={() => {
              onPick(city.id);
              setQuery("");
              onClose();
            }}
            style={({ pressed }) => [styles.cityRow, pressed && { backgroundColor: colors.mist }]}
          >
            <Text style={styles.cityName}>{city.name}</Text>
            <Text style={styles.cityState}>{city.state}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Sheet>
  );
}

export function Toggle({ label, sub, on, onPress }: { label: string; sub?: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.toggle, on && { borderColor: colors.gold }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {sub ? <Text style={styles.hint}>{sub}</Text> : null}
      </View>
      <View style={[styles.switch, on && styles.switchOn]}>
        <View style={[styles.knob, on && styles.knobOn]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { color: colors.muted, fontFamily: type.medium, fontSize: 12.5 },
  input: { height: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, paddingHorizontal: 14, color: colors.cream, fontFamily: type.medium, fontSize: 15 },
  inputFocus: { borderColor: colors.gold },
  inputBad: { borderColor: colors.danger },
  error: { color: colors.danger, fontFamily: type.regular, fontSize: 12 },
  hint: { color: colors.faint, fontFamily: type.regular, fontSize: 12, lineHeight: 17 },
  picker: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pickerText: { color: colors.cream, fontFamily: type.medium, fontSize: 15 },
  cityRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 13, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  cityName: { color: colors.cream, fontFamily: type.medium, fontSize: 15 },
  cityState: { color: colors.faint, fontFamily: type.regular, fontSize: 12 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night },
  toggleLabel: { color: colors.cream, fontFamily: type.medium, fontSize: 14.5 },
  switch: { width: 46, height: 26, borderRadius: 13, backgroundColor: colors.mist, padding: 3, justifyContent: "center" },
  switchOn: { backgroundColor: colors.gold },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.cream },
  knobOn: { alignSelf: "flex-end", backgroundColor: colors.night },
});
