import { useState, type ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button, Icon, Sheet } from "../components/kit";
import { EmergencyContactsSheet } from "../components/EmergencyContactsSheet";
import { NotificationsSheet } from "../components/NotificationsSheet";
import { cityById } from "../data";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { Glyph } from "../types";
import type { UserStack, UserTabs } from "../navigation";

type Props = CompositeScreenProps<BottomTabScreenProps<UserTabs, "Account">, NativeStackScreenProps<UserStack>>;

type Panel = "profile" | "notifications" | "contacts" | null;

function Group({ children }: { children: ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

function Row({ icon, label, sub, onPress, last }: { icon: Glyph; label: string; sub?: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.mist }]}>
      <View style={styles.rowIcon}>
        <Icon name={icon} size={19} />
      </View>
      <View style={[styles.rowBody, !last && styles.rowLine]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>{label}</Text>
          {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.faint} />
      </View>
    </Pressable>
  );
}

export function AccountScreen({ navigation }: Props) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const [panel, setPanel] = useState<Panel>(null);
  const [name, setName] = useState("");
  const user = store.user;
  const close = () => setPanel(null);
  const needLogin = (next: Panel) => (user ? setPanel(next) : navigation.navigate("Login"));
  const upcoming = user ? store.bookings.filter((booking) => booking.status === "Upcoming").length : 0;

  return (
    <View style={styles.screen}>
      <Pressable
        onPress={() => {
          if (!user) return navigation.navigate("Login");
          setName(user.name);
          setPanel("profile");
        }}
        style={[styles.head, { paddingTop: Math.max(insets.top, 12) + 8 }]}
      >
        <View style={styles.avatar}>
          {user?.name ? <Text style={styles.avatarText}>{user.name.slice(0, 1).toUpperCase()}</Text> : <Ionicons name="person" size={24} color={colors.faint} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headTitle}>{user ? user.name || "User" : "Login"}</Text>
          <Text style={styles.headSub}>{user ? "Edit Profile" : "Sign in to book a seat"}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.cream} />
      </Pressable>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130, gap: 12 }} showsVerticalScrollIndicator={false}>
        <Group>
          <Row icon="mc:city-variant-outline" label="Current City" sub={cityById(store.cityId).name} onPress={() => navigation.navigate("SelectCity")} last />
        </Group>

        <Group>
          <Row icon="mc:ticket-confirmation-outline" label="Cancel Booking" sub={upcoming ? `${upcoming} upcoming trip${upcoming > 1 ? "s" : ""}` : undefined} onPress={() => navigation.navigate("CancelBooking")} />
          <Row icon="mc:bell-outline" label="Notifications" onPress={() => setPanel("notifications")} last />
        </Group>

        <Group>
          <Row icon="mc:phone-alert-outline" label="Emergency Contacts" sub={store.contacts.length ? `${store.contacts.length} trusted contact${store.contacts.length > 1 ? "s" : ""}` : "Add trusted contacts for instant alerts"} onPress={() => needLogin("contacts")} last />
        </Group>

        <Group>
          <Row icon="mc:newspaper-variant-outline" label="News & Blog" onPress={() => navigation.navigate("News")} />
          <Row icon="mc:message-text-outline" label="Write Feedback" onPress={() => navigation.navigate("Feedback")} />
          <Row icon="mc:help-circle-outline" label="FAQs" onPress={() => navigation.navigate("Faqs")} />
          <Row icon="mc:file-document-outline" label="Terms & Conditions" onPress={() => navigation.navigate("Policy", { kind: "terms" })} />
          <Row icon="mc:shield-lock-outline" label="Privacy Policy" onPress={() => navigation.navigate("Policy", { kind: "privacy" })} />
          <Row icon="mc:information-outline" label="About Us" onPress={() => navigation.navigate("About")} />
          <Row icon="mc:headset" label="Contact Us" onPress={() => navigation.navigate("Contact")} last />
        </Group>

        {user ? <Button label="Log out" icon="log-out-outline" tone="ghost" onPress={store.signOut} style={{ marginTop: 6 }} /> : null}
        <Text style={styles.version}>ROVEYA · v1.0.0</Text>
      </ScrollView>

      <Sheet
        visible={panel === "profile"}
        onClose={close}
        title="Your profile"
        footer={
          <Button
            label="Save"
            disabled={name.trim().length < 2}
            onPress={() => {
              store.setName(name.trim());
              close();
            }}
          />
        }
      >
        <View style={{ gap: 10 }}>
          <Text style={styles.rowSub}>Name on your tickets</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={colors.faint} autoCapitalize="words" selectionColor={colors.gold} style={styles.field} />
          <Text style={styles.rowSub}>Mobile number · +91 {user?.phone ?? ""}</Text>
        </View>
      </Sheet>

      <NotificationsSheet visible={panel === "notifications"} onClose={close} onLogin={() => navigation.navigate("Login")} />
      <EmergencyContactsSheet visible={panel === "contacts"} onClose={close} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  head: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingBottom: 16, backgroundColor: colors.inkwell, borderBottomWidth: 1, borderBottomColor: colors.line },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.mist, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.gold, fontFamily: type.bold, fontSize: 20 },
  headTitle: { color: colors.cream, fontFamily: type.semibold, fontSize: 18 },
  headSub: { marginTop: 2, color: colors.muted, fontFamily: type.regular, fontSize: 13 },
  student: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 22, borderWidth: 1, borderColor: colors.line },
  studentIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(18,6,13,0.5)", borderWidth: 1, borderColor: colors.gold, alignItems: "center", justifyContent: "center" },
  studentTitle: { color: colors.cream, fontFamily: type.semibold, fontSize: 15.5 },
  studentSub: { marginTop: 3, color: colors.muted, fontFamily: type.regular, fontSize: 12.5 },
  studentCta: { color: colors.gold, fontFamily: type.semibold, fontSize: 14 },
  group: { borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 14 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line },
  rowBody: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, paddingRight: 14 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rowLabel: { color: colors.cream, fontFamily: type.medium, fontSize: 15 },
  rowSub: { marginTop: 2, color: colors.faint, fontFamily: type.regular, fontSize: 12.5 },
  version: { marginTop: 8, textAlign: "center", color: colors.faint, fontFamily: type.regular, fontSize: 11.5 },
  lead: { color: colors.muted, fontFamily: type.regular, fontSize: 14, lineHeight: 21, marginBottom: 8 },
  field: { height: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, paddingHorizontal: 14, color: colors.cream, fontFamily: type.medium, fontSize: 15 },
  upload: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 54, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: colors.gold },
  uploadText: { color: colors.gold, fontFamily: type.medium, fontSize: 14 },
});
