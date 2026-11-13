import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MAX_CONTACTS, useStore } from "../store";
import { colors, type } from "../theme";

export function EmergencyContactsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [focus, setFocus] = useState<"name" | "phone" | null>(null);
  const [saved, setSaved] = useState("");
  const full = store.contacts.length >= MAX_CONTACTS;
  const duplicate = store.contacts.some((contact) => contact.phone === phone);
  const valid = name.trim().length >= 2 && /^[6-9]\d{9}$/.test(phone) && !duplicate && phone !== store.user?.phone;

  useEffect(() => {
    if (!visible) {
      setName("");
      setPhone("");
      setSaved("");
    }
  }, [visible]);

  const save = () => {
    if (!valid) return;
    store.saveContact({ name: name.trim(), phone });
    setSaved(`${name.trim().split(" ")[0]} will get your live location when you tap SOS.`);
    setName("");
    setPhone("");
  };

  const hint = phone.length === 10 && !/^[6-9]\d{9}$/.test(phone)
    ? "Enter a valid 10-digit mobile number."
    : duplicate
      ? "This number is already saved."
      : phone && phone === store.user?.phone
        ? "Add someone other than yourself."
        : "";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.stage} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.card, { marginBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Emergency Contacts</Text>
              <Text style={styles.sub}>Add trusted contacts for instant alerts</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={onClose} style={styles.close}>
              <Ionicons name="close" size={16} color={colors.night} />
            </Pressable>
          </View>
          <View style={styles.rule} />

          <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {store.contacts.map((contact, index) => (
              <View key={contact.phone} style={styles.saved}>
                <View style={styles.savedAvatar}>
                  <Text style={styles.savedLetter}>{contact.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.savedLabel}>Emergency contact {index + 1}</Text>
                  <Text style={styles.savedName}>{contact.name}</Text>
                  <Text style={styles.savedPhone}>+91 {contact.phone.slice(0, 5)} {contact.phone.slice(5)}</Text>
                </View>
                <Pressable accessibilityLabel={`Remove ${contact.name}`} hitSlop={8} onPress={() => store.removeContact(contact.phone)} style={styles.remove}>
                  <Ionicons name="trash-outline" size={17} color={colors.danger} />
                </Pressable>
              </View>
            ))}

            {saved ? (
              <View style={styles.done}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text style={styles.doneText}>{saved}</Text>
              </View>
            ) : null}

            {full ? (
              <Text style={styles.note}>You have added all {MAX_CONTACTS} emergency contacts. Remove one to add someone new.</Text>
            ) : (
              <>
                <Text style={styles.label}>Emergency contact {store.contacts.length + 1}</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  onFocus={() => setFocus("name")}
                  onBlur={() => setFocus(null)}
                  placeholder="Full Name"
                  placeholderTextColor={colors.faint}
                  autoCapitalize="words"
                  selectionColor={colors.gold}
                  style={[styles.field, focus === "name" && styles.fieldOn]}
                />
                <TextInput
                  value={phone}
                  onChangeText={(text) => setPhone(text.replace(/\D/g, "").slice(0, 10))}
                  onFocus={() => setFocus("phone")}
                  onBlur={() => setFocus(null)}
                  placeholder="Mobile No."
                  placeholderTextColor={colors.faint}
                  keyboardType="number-pad"
                  selectionColor={colors.gold}
                  style={[styles.field, focus === "phone" && styles.fieldOn, hint ? { borderColor: colors.danger } : null]}
                />
                {hint ? <Text style={styles.hint}>{hint}</Text> : null}
                <Text style={styles.note}>You can add up to {MAX_CONTACTS} emergency contacts</Text>
              </>
            )}
          </ScrollView>

          {!full ? (
            <Pressable accessibilityRole="button" disabled={!valid} onPress={save} style={[styles.save, valid && styles.saveOn]}>
              <Text style={[styles.saveText, valid && { color: colors.night }]}>Save</Text>
            </Pressable>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 10 },
  card: { width: "100%", maxWidth: 420, alignSelf: "center", borderRadius: 30, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, padding: 22 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  title: { color: colors.cream, fontFamily: type.semibold, fontSize: 19 },
  sub: { marginTop: 4, color: colors.muted, fontFamily: type.regular, fontSize: 13 },
  close: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.faint, alignItems: "center", justifyContent: "center", marginTop: 2 },
  rule: { height: 1, backgroundColor: colors.line, marginVertical: 14 },
  label: { marginBottom: 12, color: colors.cream, fontFamily: type.semibold, fontSize: 14.5 },
  field: { height: 58, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, paddingHorizontal: 18, marginBottom: 14, color: colors.cream, fontFamily: type.regular, fontSize: 16 },
  fieldOn: { borderColor: colors.gold },
  hint: { marginTop: -6, marginBottom: 10, color: colors.danger, fontFamily: type.regular, fontSize: 12.5 },
  note: { marginTop: 4, marginBottom: 4, color: colors.muted, fontFamily: type.regular, fontSize: 13.5, lineHeight: 19 },
  saved: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line, marginBottom: 10 },
  savedAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.burgundy, alignItems: "center", justifyContent: "center" },
  savedLetter: { color: colors.cream, fontFamily: type.bold, fontSize: 16 },
  savedLabel: { color: colors.gold, fontFamily: type.medium, fontSize: 11 },
  savedName: { marginTop: 1, color: colors.cream, fontFamily: type.semibold, fontSize: 14.5 },
  savedPhone: { color: colors.faint, fontFamily: type.regular, fontSize: 12.5 },
  remove: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(232,133,127,0.1)" },
  done: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 12, backgroundColor: "rgba(127,199,154,0.08)", marginBottom: 12 },
  doneText: { flex: 1, color: colors.cream, fontFamily: type.regular, fontSize: 12.5 },
  save: { marginTop: 18, height: 54, borderRadius: 14, backgroundColor: colors.mist, alignItems: "center", justifyContent: "center" },
  saveOn: { backgroundColor: colors.gold },
  saveText: { color: colors.faint, fontFamily: type.semibold, fontSize: 16 },
});
