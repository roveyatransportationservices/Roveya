import { useState } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { page } from "./PageShell";
import { colors, type } from "../theme";

export function Field({ label, hint, error, prefix, ...input }: TextInputProps & { label: string; hint?: string; error?: string; prefix?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View>
      <Text style={page.label}>{label}</Text>
      <View style={[styles.box, focused && page.inputFocus, error ? styles.boxError : null]}>
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          placeholderTextColor={colors.faint}
          selectionColor={colors.gold}
          {...input}
          onFocus={(event) => {
            setFocused(true);
            input.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            input.onBlur?.(event);
          }}
          style={styles.input}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: 52, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 },
  boxError: { borderColor: colors.goldBright },
  prefix: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 15 },
  input: { flex: 1, height: 50, color: colors.cream, fontFamily: type.label, fontSize: 15, paddingVertical: 0 },
  hint: { marginTop: 6, color: colors.faint, fontFamily: type.body, fontSize: 12 },
  error: { marginTop: 6, color: colors.goldBright, fontFamily: type.label, fontSize: 12 },
});
