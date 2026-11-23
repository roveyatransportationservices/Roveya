import { Platform, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold, useFonts } from "@expo-google-fonts/outfit";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PHONE_MAX_WIDTH } from "./src/layout";
import { CaptainNavigation } from "./src/navigation";
import { StoreProvider } from "./src/store";
import { colors } from "./src/theme";

const styles = StyleSheet.create({
  stage: { flex: 1, backgroundColor: Platform.OS === "web" ? "#08030A" : colors.night, alignItems: "center" },
  phone: {
    flex: 1,
    width: "100%",
    maxWidth: Platform.OS === "web" ? PHONE_MAX_WIDTH : undefined,
    backgroundColor: colors.night,
    overflow: "hidden",
    ...(Platform.OS === "web" ? { borderLeftWidth: 1, borderRightWidth: 1, borderColor: "rgba(214,160,0,0.12)" } : null),
  },
});

export default function App() {
  const [fontsLoaded, fontError] = useFonts({ Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold });
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={styles.stage}>
        <View style={styles.phone}>
          {fontsLoaded || fontError ? (
            <StoreProvider>
              <CaptainNavigation />
            </StoreProvider>
          ) : null}
        </View>
      </View>
    </SafeAreaProvider>
  );
}
