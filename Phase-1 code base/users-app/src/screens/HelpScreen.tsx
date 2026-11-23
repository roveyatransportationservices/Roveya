import { Ionicons } from "@expo/vector-icons";
import { Linking, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { DeskChat, type Topic } from "../components/DeskChat";
import { Button, Header } from "../components/kit";
import { SAFETY_DESK } from "../safety";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { UserStack, UserTabs } from "../navigation";

type Props = CompositeScreenProps<BottomTabScreenProps<UserTabs, "Help">, NativeStackScreenProps<UserStack>>;

const topics: Topic[] = [
  { label: "My booking or seats", hint: "Add your PNR if you have it, like RVY482100." },
  { label: "Refund or cancellation", hint: "Tell us the PNR and what you expected back." },
  { label: "Payment issue", hint: "Add the amount and the UPI or card reference if money left your account." },
  { label: "Captain or car", hint: "What happened, and on which trip." },
  { label: "Safety concern", hint: "If you are in danger right now, use SOS on your ticket or call 112." },
  { label: "Women Zone", hint: "Tell us about the seat or trip." },
  { label: "App problem", hint: "What you tapped and what went wrong." },
  { label: "Something else" },
];

// Help is a chat with real people at the ROVEYA desk, plus call and email from the header.
export function HelpScreen({ navigation }: Props) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const tabSpace = 74 + Math.max(insets.bottom, 10);

  if (store.live && !store.user) {
    return (
      <View style={styles.screen}>
        <Header title="ROVEYA desk" subtitle="Real people, 5 AM to 11 PM" />
        <View style={styles.card}>
          <Ionicons name="chatbubbles-outline" size={40} color={colors.gold} />
          <Text style={styles.title}>Log in to chat with the desk</Text>
          <Text style={styles.line}>Your chats stay linked to your bookings, so an agent sees everything at once.</Text>
          <Button label="Login with OTP" onPress={() => navigation.navigate("Login")} style={{ alignSelf: "stretch", marginTop: 8 }} />
          <Button label="Call the desk" icon="call-outline" tone="ghost" onPress={() => void Linking.openURL(`tel:${SAFETY_DESK}`)} style={{ alignSelf: "stretch" }} />
          <Button label="Email hello@roveya.com" icon="mail-outline" tone="ghost" onPress={() => void Linking.openURL("mailto:hello@roveya.com")} style={{ alignSelf: "stretch" }} />
        </View>
      </View>
    );
  }

  return <DeskChat topics={topics} email="hello@roveya.com" bottomInset={tabSpace} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  card: { margin: 16, padding: 22, gap: 10, alignItems: "center", borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  title: { color: colors.cream, fontFamily: type.semibold, fontSize: 18, textAlign: "center" },
  line: { color: colors.muted, fontFamily: type.regular, fontSize: 13.5, lineHeight: 20, textAlign: "center" },
});
