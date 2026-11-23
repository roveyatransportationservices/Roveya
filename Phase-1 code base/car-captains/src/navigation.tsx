import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator, type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { DefaultTheme, NavigationContainer, type NavigatorScreenParams, type Theme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Loader, Logo } from "./components/kit";
import { REQUIRED_DOCS } from "./docs";
import { AccountScreen, SeatEditorScreen } from "./screens/AccountScreens";
import { DocumentsScreen } from "./screens/DocumentsScreen";
import { EarningsScreen, PayoutPlanScreen } from "./screens/EarningsScreens";
import { HomeScreen } from "./screens/HomeScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { PublishScreen } from "./screens/PublishScreen";
import { RegisterScreen } from "./screens/RegisterScreen";
import { SupportScreen } from "./screens/SupportScreen";
import { TripScreen, TripsScreen } from "./screens/TripScreens";
import { useStore } from "./store";
import { colors, type } from "./theme";
import type { IconName } from "./types";

export type CaptainTabs = {
  Home: undefined;
  Trips: undefined;
  Earnings: undefined;
  Account: undefined;
};

export type CaptainStack = {
  Login: undefined;
  Register: undefined;
  Documents: undefined;
  Tabs: NavigatorScreenParams<CaptainTabs> | undefined;
  Publish: undefined;
  Trip: { id: string };
  SeatEditor: undefined;
  PayoutPlan: undefined;
  Support: undefined;
};

const Stack = createNativeStackNavigator<CaptainStack>();
const Tabs = createBottomTabNavigator<CaptainTabs>();

const navTheme: Theme = {
  ...DefaultTheme,
  dark: true,
  colors: { ...DefaultTheme.colors, background: colors.night, card: colors.inkwell, primary: colors.gold, text: colors.cream, border: colors.line, notification: colors.goldBright },
};

const tabIcons: Record<keyof CaptainTabs, [IconName, IconName, string]> = {
  Home: ["home", "home-outline", "Home"],
  Trips: ["car-sport", "car-sport-outline", "Trips"],
  Earnings: ["wallet", "wallet-outline", "Earnings"],
  Account: ["person", "person-outline", "Account"],
};

function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.tabStage, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.tabBar}>
        {state.routes.map((route, index) => {
          const name = route.name as keyof CaptainTabs;
          const on = state.index === index;
          const [active, idle, label] = tabIcons[name];
          return (
            <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => navigation.navigate(route.name)} style={[styles.tab, on && styles.tabOn]}>
              <Ionicons name={on ? active : idle} size={20} color={on ? colors.gold : colors.faint} />
              <Text style={[styles.tabText, on && { color: colors.cream }]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function MainTabs() {
  return (
    <Tabs.Navigator tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Trips" component={TripsScreen} />
      <Tabs.Screen name="Earnings" component={EarningsScreen} />
      <Tabs.Screen name="Account" component={AccountScreen} />
    </Tabs.Navigator>
  );
}

function Boot() {
  const store = useStore();
  return (
    <View style={styles.boot}>
      <Logo size={56} />
      {store.bootError ? (
        <>
          <Text style={styles.bootText}>{store.bootError}</Text>
          <Button label="Try again" onPress={store.retry} style={{ alignSelf: "stretch", marginHorizontal: 40 }} />
        </>
      ) : (
        <Loader label="Opening ROVEYA Captain…" />
      )}
    </View>
  );
}

export function CaptainNavigation() {
  const store = useStore();
  if (store.phase === "boot") return <Boot />;
  const docsLeft = REQUIRED_DOCS.some((kind) => !store.profile?.documents.some((doc) => doc.kind === kind));
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        key={store.phase}
        initialRouteName={store.phase === "signedOut" ? "Login" : store.phase === "register" ? "Register" : docsLeft && store.profile?.captain.status === "review" ? "Documents" : "Tabs"}
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.night }, animation: "slide_from_right" }}
      >
        {store.phase === "signedOut" ? <Stack.Screen name="Login" component={LoginScreen} options={{ animation: "fade" }} /> : null}
        {store.phase === "register" ? <Stack.Screen name="Register" component={RegisterScreen} options={{ animation: "fade" }} /> : null}
        {store.phase === "ready" ? (
          <>
            <Stack.Screen name="Tabs" component={MainTabs} options={{ animation: "fade" }} />
            <Stack.Screen name="Documents" component={DocumentsScreen} />
            <Stack.Screen name="Publish" component={PublishScreen} options={{ animation: "slide_from_bottom" }} />
            <Stack.Screen name="Trip" component={TripScreen} />
            <Stack.Screen name="SeatEditor" component={SeatEditorScreen} />
            <Stack.Screen name="PayoutPlan" component={PayoutPlanScreen} />
            <Stack.Screen name="Support" component={SupportScreen} />
          </>
        ) : null}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabStage: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingTop: 8 },
  tabBar: { flexDirection: "row", borderRadius: 26, backgroundColor: "rgba(28,10,20,0.97)", borderWidth: 1, borderColor: colors.line, padding: 6 },
  tab: { flex: 1, alignItems: "center", gap: 3, paddingVertical: 7, borderRadius: 20 },
  tabOn: { backgroundColor: colors.plum },
  tabText: { color: colors.faint, fontFamily: type.medium, fontSize: 10.5 },
  boot: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18, backgroundColor: colors.night },
  bootText: { color: colors.muted, fontFamily: type.regular, fontSize: 14, textAlign: "center", paddingHorizontal: 30 },
});
