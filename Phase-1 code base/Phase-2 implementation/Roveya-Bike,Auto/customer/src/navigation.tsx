import { useState } from "react";
import { createNavigationContainerRef, NavigationContainer, DefaultTheme, StackActions, type NavigatorScreenParams, type Theme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text, View } from "react-native";
import { AppTabBar, type AppTab } from "./components/AppTabBar";
import type { Place } from "./types";
import { NameScreen, OtpScreen, PhoneScreen, WelcomeScreen } from "./screens/AuthScreens";
import { HomeScreen } from "./screens/HomeScreen";
import { SearchScreen } from "./screens/SearchScreen";
import { OptionsScreen } from "./screens/OptionsScreen";
import { TripScreen } from "./screens/TripScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { ActivityScreen, ParcelsScreen, ReceiptScreen } from "./screens/BookingScreens";
import { LanguageScreen, NotificationsScreen, PersonalScreen, PlacesScreen, WalletScreen } from "./screens/AccountScreens";
import { AboutScreen, ClaimsScreen, DeskScreen, DetailScreen, SafetyScreen, SupportScreen, TermsScreen } from "./screens/HelpScreens";
import { ServicesScreen } from "./screens/ServiceScreens";
import { ParcelFlowScreen } from "./screens/ParcelScreens";
import { useStore } from "./store";
import { colors, type } from "./theme";
import { PoolScreen } from "./screens/PoolScreen";

export type CustomerStack = {
  Welcome: undefined;
  Phone: undefined;
  Otp: { phone: string; email?: string };
  Name: { phone: string };
  Tabs: NavigatorScreenParams<CustomerTabs> | undefined;
  Search: { target: "pickup" | "drop" };
  Options: { drop: Place };
  Trip: undefined;
  Receipt: { id: string };
  Support: undefined;
  Safety: undefined;
  Activity: undefined;
  Wallet: undefined;
  Detail: { title: string; body: string };
  Parcels: undefined;
  Personal: undefined;
  Places: undefined;
  Notifications: undefined;
  Language: undefined;
  Claims: { rideId?: string } | undefined;
  Desk: undefined;
  About: undefined;
  Terms: { tab?: "terms" | "privacy" } | undefined;
  Services: undefined;
  ComingSoon: { service: SoonService };
  ParcelFlow: undefined;
};

export type SoonService = "pool" | "cab" | "rental";

export type CustomerTabs = {
  Home: undefined;
  Account: undefined;
};

const Stack = createNativeStackNavigator<CustomerStack>();
const Tabs = createBottomTabNavigator<CustomerTabs>();

const navTheme: Theme = {
  ...DefaultTheme,
  fonts: {
    regular: { fontFamily: type.regular, fontWeight: "400" },
    medium: { fontFamily: type.medium, fontWeight: "500" },
    bold: { fontFamily: type.bold, fontWeight: "700" },
    heavy: { fontFamily: type.bold, fontWeight: "700" },
  },
  dark: true,
  colors: { ...DefaultTheme.colors, background: colors.night, card: colors.inkwell, primary: colors.gold, text: colors.cream, border: colors.line, notification: colors.goldBright },
};

function MainTabs() {
  return (
    <Tabs.Navigator tabBar={() => null} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Account" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

const sectionOf: Partial<Record<string, AppTab>> = {
  Home: "Home",
  Search: "Home",
  Options: "Home",
  Trip: "Home",
  Services: "Home",
  ParcelFlow: "Parcel",
  Account: "Account",
  Activity: "Account",
  Receipt: "Account",
  Wallet: "Account",
  Parcels: "Account",
  Personal: "Account",
  Places: "Account",
  Notifications: "Account",
  Language: "Account",
  Support: "Account",
  Claims: "Account",
  Desk: "Account",
  About: "Account",
  Terms: "Account",
};

const navRef = createNavigationContainerRef<CustomerStack>();

function openTab(tab: AppTab) {
  if (!navRef.isReady()) return;
  const top = navRef.getRootState()?.routes.at(-1)?.name;
  if (tab === "Pool") {
    if (top === "ComingSoon") return;
    if (top !== "Tabs") navRef.dispatch(StackActions.popToTop());
    navRef.navigate("ComingSoon", { service: "pool" });
    return;
  }
  if (tab === "Parcel") {
    if (top === "ParcelFlow") return;
    if (top !== "Tabs") navRef.dispatch(StackActions.popToTop());
    navRef.navigate("ParcelFlow");
    return;
  }
  if (top !== "Tabs") navRef.dispatch(StackActions.popToTop());
  navRef.navigate("Tabs", { screen: tab });
}

export function CustomerNavigation() {
  const { session, known } = useStore();
  const [active, setActive] = useState<AppTab>("Home");
  const sync = () => {
    const current = navRef.getCurrentRoute();
    const root = navRef.getRootState();
    const top = root?.routes[root.index]?.name;
    if (top === "Pool") {
      setActive("Pool");
      return;
    }
    const name = navRef.getCurrentRoute()?.name;
    const next = name ? sectionOf[name] : undefined;
    if (next) setActive(next);
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.night }}>
      <View style={{ flex: 1 }}>
        <NavigationContainer ref={navRef} theme={navTheme} onReady={sync} onStateChange={sync}>
          <Stack.Navigator initialRouteName={session ? "Tabs" : known ? "Phone" : "Welcome"} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.night } }}>
        {session ? (
          <>
            <Stack.Screen name="Tabs" component={MainTabs} />
            <Stack.Screen name="Search" component={SearchScreen} />
            <Stack.Screen name="Options" component={OptionsScreen} />
            <Stack.Screen name="Trip" component={TripScreen} />
            <Stack.Screen name="Receipt" component={ReceiptScreen} />
            <Stack.Screen name="Support" component={SupportScreen} />
            <Stack.Screen name="Safety" component={SafetyScreen} />
            <Stack.Screen name="Activity" component={ActivityScreen} />
            <Stack.Screen name="Wallet" component={WalletScreen} />
            <Stack.Screen name="Detail" component={DetailScreen} />
            <Stack.Screen name="Parcels" component={ParcelsScreen} />
            <Stack.Screen name="Personal" component={PersonalScreen} />
            <Stack.Screen name="Places" component={PlacesScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="Language" component={LanguageScreen} />
            <Stack.Screen name="Claims" component={ClaimsScreen} />
            <Stack.Screen name="Desk" component={DeskScreen} />
            <Stack.Screen name="About" component={AboutScreen} />
            <Stack.Screen name="Terms" component={TermsScreen} />
            <Stack.Screen name="Services" component={ServicesScreen} />
            <Stack.Screen name="Pool" component={PoolScreen} options={{ animation: "fade" }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="Phone" component={PhoneScreen} />
            <Stack.Screen name="Otp" component={OtpScreen} />
            <Stack.Screen name="Name" component={NameScreen} />
            <Stack.Screen name="Terms" component={TermsScreen} />
          </>
        )}
          </Stack.Navigator>
        </NavigationContainer>
      </View>
      {session ? <AppTabBar active={active} onPress={openTab} /> : null}
    </View>
  );
}

export function TabLabel({ children }: { children: string }) {
  return <Text>{children}</Text>;
}
