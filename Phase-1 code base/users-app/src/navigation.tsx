import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator, type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { DefaultTheme, NavigationContainer, type NavigatorScreenParams, type Theme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Loader, Logo } from "./components/kit";
import { AboutScreen, ContactScreen, FaqsScreen, FeedbackScreen, PolicyScreen } from "./screens/AccountPages";
import { AccountScreen } from "./screens/AccountScreen";
import { NewsScreen } from "./screens/NewsScreen";
import { BookingsScreen, TicketScreen } from "./screens/BookingsScreens";
import { CancelBookingScreen } from "./screens/CancelBookingScreen";
import { CashScreen } from "./screens/CashScreen";
import { CitySearchScreen } from "./screens/CitySearchScreen";
import { ConfirmedScreen, PaymentScreen } from "./screens/PaymentScreens";
import { HelpScreen } from "./screens/HelpScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { OffersScreen, WomenZoneScreen } from "./screens/InfoScreens";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { PointsScreen } from "./screens/PointsScreen";
import { ReferScreen } from "./screens/ReferScreen";
import { ResultsScreen } from "./screens/ResultsScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { SeatsScreen } from "./screens/SeatsScreen";
import { SelectCityScreen } from "./screens/SelectCityScreen";
import { TrackScreen } from "./screens/TrackScreen";
import { useStore } from "./store";
import { colors, type } from "./theme";
import type { IconName } from "./types";

export type UserTabs = {
  Home: undefined;
  Cash: undefined;
  Bookings: undefined;
  Help: undefined;
  Account: undefined;
};

export type UserStack = {
  Onboarding: undefined;
  Login: { next?: "Points" } | undefined;
  Tabs: NavigatorScreenParams<UserTabs> | undefined;
  CitySearch: { field: "from" | "to" };
  Results: undefined;
  Seats: { tripId: string };
  Points: undefined;
  Review: undefined;
  Payment: undefined;
  Confirmed: { pnr: string };
  Ticket: { pnr: string };
  Track: { pnr: string };
  Offers: undefined;
  WomenZone: undefined;
  SelectCity: undefined;
  CancelBooking: undefined;
  Refer: undefined;
  News: undefined;
  Feedback: undefined;
  Faqs: undefined;
  Policy: { kind: "terms" | "privacy" };
  About: undefined;
  Contact: undefined;
};

const Stack = createNativeStackNavigator<UserStack>();
const Tabs = createBottomTabNavigator<UserTabs>();

const navTheme: Theme = {
  ...DefaultTheme,
  dark: true,
  colors: { ...DefaultTheme.colors, background: colors.night, card: colors.inkwell, primary: colors.gold, text: colors.cream, border: colors.line, notification: colors.goldBright },
};

const tabIcons: Record<keyof UserTabs, [IconName, IconName, string]> = {
  Home: ["home", "home-outline", "Home"],
  Cash: ["wallet", "wallet-outline", "ROVEYA Cash"],
  Bookings: ["ticket", "ticket-outline", "Bookings"],
  Help: ["chatbubbles", "chatbubbles-outline", "Help"],
  Account: ["person", "person-outline", "Account"],
};

function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const signedIn = Boolean(useStore().user);
  return (
    <View style={[styles.tabStage, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.tabBar}>
        {state.routes.map((route, index) => {
          const name = route.name as keyof UserTabs;
          const on = state.index === index;
          const [active, idle, label] = tabIcons[name];
          return (
            <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => navigation.navigate(route.name)} style={[styles.tab, on && styles.tabOn]}>
              <Ionicons name={on ? active : idle} size={20} color={on ? colors.gold : colors.faint} />
              <Text style={[styles.tabText, on && { color: colors.cream }]} numberOfLines={1}>
                {name === "Account" && !signedIn ? "Login" : label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

let embeddedInRiders = false;

function MainTabs() {
  return (
    <Tabs.Navigator tabBar={embeddedInRiders ? () => null : (props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Cash" component={CashScreen} />
      <Tabs.Screen name="Bookings" component={BookingsScreen} />
      <Tabs.Screen name="Help" component={HelpScreen} />
      <Tabs.Screen name="Account" component={AccountScreen} />
    </Tabs.Navigator>
  );
}

export function UserNavigation({ embedded = false }: { embedded?: boolean }) {
  embeddedInRiders = embedded;
  const store = useStore();
  if (!store.ready) {
    return (
      <View style={styles.boot}>
        <Logo size={56} />
        <Loader label="Opening ROVEYA…" />
      </View>
    );
  }
  const stack = (
      <Stack.Navigator initialRouteName={embedded || store.onboarded ? "Tabs" : "Onboarding"} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.night }, animation: "slide_from_right" }}>
        <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ animation: "fade" }} />
        <Stack.Screen name="Tabs" component={MainTabs} options={{ animation: "fade" }} />
        <Stack.Screen name="Login" component={LoginScreen} options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="CitySearch" component={CitySearchScreen} options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="Results" component={ResultsScreen} />
        <Stack.Screen name="Seats" component={SeatsScreen} />
        <Stack.Screen name="Points" component={PointsScreen} />
        <Stack.Screen name="Review" component={ReviewScreen} />
        <Stack.Screen name="Payment" component={PaymentScreen} />
        <Stack.Screen name="Confirmed" component={ConfirmedScreen} options={{ animation: "fade", gestureEnabled: false }} />
        <Stack.Screen name="Ticket" component={TicketScreen} />
        <Stack.Screen name="Track" component={TrackScreen} />
        <Stack.Screen name="Offers" component={OffersScreen} />
        <Stack.Screen name="WomenZone" component={WomenZoneScreen} />
        <Stack.Screen name="SelectCity" component={SelectCityScreen} />
        <Stack.Screen name="CancelBooking" component={CancelBookingScreen} />
        <Stack.Screen name="Refer" component={ReferScreen} />
        <Stack.Screen name="News" component={NewsScreen} />
        <Stack.Screen name="Feedback" component={FeedbackScreen} />
        <Stack.Screen name="Faqs" component={FaqsScreen} />
        <Stack.Screen name="Policy" component={PolicyScreen} />
        <Stack.Screen name="About" component={AboutScreen} />
        <Stack.Screen name="Contact" component={ContactScreen} />
      </Stack.Navigator>
  );
  if (embedded) return <View style={{ flex: 1, backgroundColor: colors.night }}>{stack}</View>;
  return <NavigationContainer theme={navTheme}>{stack}</NavigationContainer>;
}

const styles = StyleSheet.create({
  tabStage: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingTop: 8 },
  tabBar: { flexDirection: "row", borderRadius: 26, backgroundColor: "rgba(28,10,20,0.97)", borderWidth: 1, borderColor: colors.line, padding: 6 },
  tab: { flex: 1, alignItems: "center", gap: 3, paddingVertical: 7, borderRadius: 20 },
  tabOn: { backgroundColor: colors.plum },
  tabText: { color: colors.faint, fontFamily: type.medium, fontSize: 10.5 },
  boot: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18, backgroundColor: colors.night },
});
