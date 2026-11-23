import { useEffect, useState } from "react";
import { createNavigationContainerRef, DefaultTheme, NavigationContainer, StackActions, type NavigatorScreenParams, type Theme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View } from "react-native";
import { AppTabBar, type AppTab } from "./components/AppTabBar";
import { onPushTap } from "./push";
import { DutyScreen } from "./screens/DutyScreen";
import { RegisterScreen, ServiceScreen, VerificationScreen } from "./screens/JoinScreens";
import { OtpScreen, PhoneScreen, WelcomeScreen } from "./screens/AuthScreens";
import { JobScreen } from "./screens/JobScreen";
import { EarningsScreen, OrderDetailScreen, OrdersScreen } from "./screens/EarningsScreens";
import { IncentivesScreen } from "./screens/IncentivesScreen";
import { RedeemScreen, WalletScreen } from "./screens/WalletScreens";
import { BankScreen, DocumentsScreen, PersonalScreen, ProfileScreen, RatingsScreen, VehicleScreen } from "./screens/ProfileScreens";
import { HelpScreen, InsuranceScreen, LanguageScreen, ReferScreen, SafetyScreen, SettingsScreen, TermsScreen } from "./screens/SupportScreens";
import { useStore } from "./store";
import { colors, type } from "./theme";
import { CarGate } from "./screens/CarGate";

export type CaptainTabs = {
  Duty: undefined;
  Earnings: undefined;
  Incentives: undefined;
  Wallet: undefined;
  Account: undefined;
};

export type CaptainStack = {
  Welcome: undefined;
  Phone: { mode?: "login" | "register" } | undefined;
  Service: { phone?: string } | undefined;
  Phone: { mode?: "login" | "register"; vehicle?: VehicleKind; phone?: string } | undefined;
  Verification: undefined;
  Tabs: NavigatorScreenParams<CaptainTabs> | undefined;
  Job: undefined;
  Orders: undefined;
  OrderDetail: { id: string };
  Ratings: undefined;
  Documents: undefined;
  Vehicle: undefined;
  Bank: undefined;
  Personal: undefined;
  Refer: undefined;
  Insurance: undefined;
  Help: undefined;
  Safety: undefined;
  Settings: undefined;
  Language: undefined;
  Terms: undefined;
  Redeem: undefined;
};

const Stack = createNativeStackNavigator<CaptainStack>();
const Tabs = createBottomTabNavigator<CaptainTabs>();

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
      <Tabs.Screen name="Duty" component={DutyScreen} />
      <Tabs.Screen name="Earnings" component={EarningsScreen} />
      <Tabs.Screen name="Incentives" component={IncentivesScreen} />
      <Tabs.Screen name="Wallet" component={WalletScreen} />
      <Tabs.Screen name="Account" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

const sectionOf: Partial<Record<string, AppTab>> = {
  Duty: "Duty",
  Earnings: "Earnings",
  Orders: "Earnings",
  OrderDetail: "Earnings",
  Incentives: "Incentives",
  Wallet: "Wallet",
  Redeem: "Wallet",
  Account: "Account",
  Ratings: "Account",
  Documents: "Account",
  Vehicle: "Account",
  Bank: "Account",
  Personal: "Account",
  Refer: "Account",
  Insurance: "Account",
  Help: "Account",
  Safety: "Account",
  Settings: "Account",
  Language: "Account",
  Terms: "Account",
};

const navRef = createNavigationContainerRef<CaptainStack>();

function openTab(tab: AppTab) {
  if (!navRef.isReady()) return;
  const top = navRef.getRootState()?.routes.at(-1)?.name;
  if (top !== "Tabs") navRef.dispatch(StackActions.popToTop());
  navRef.navigate("Tabs", { screen: tab });
}

export function CaptainNavigation() {
  const store = useStore();
  const carpool = store.signedIn && store.captain?.vehicle === "cab" && store.captain.status === "active";
  const [active, setActive] = useState<AppTab>("Duty");
  const [route, setRoute] = useState<string | undefined>();
  const inside = Boolean(store.captain && store.signedIn);
  const working = inside && store.captain?.status === "active";
  useEffect(
    () =>
      onPushTap((data) => {
        if (working && data.kind === "offer") openTab("Duty");
        if (working && data.kind === "payout") openTab("Wallet");
      }),
    [working],
  );
  const sync = () => {
    const name = navRef.getCurrentRoute()?.name;
    setRoute(name);
    const next = name ? sectionOf[name] : undefined;
    if (next) setActive(next);
  };
  if (carpool) return <CarGate />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.night }}>
      <View style={{ flex: 1 }}>
        <NavigationContainer ref={navRef} theme={navTheme} onReady={sync} onStateChange={sync}>
          <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.night } }}>
            {working ? (
              <>
                <Stack.Screen name="Tabs" component={MainTabs} options={{ animation: "none" }} />
                <Stack.Screen name="Job" component={JobScreen} options={{ animation: "slide_from_bottom", gestureEnabled: false }} />
                <Stack.Screen name="Orders" component={OrdersScreen} />
                <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
                <Stack.Screen name="Redeem" component={RedeemScreen} />
                <Stack.Screen name="Ratings" component={RatingsScreen} />
                <Stack.Screen name="Documents" component={DocumentsScreen} />
                <Stack.Screen name="Vehicle" component={VehicleScreen} />
                <Stack.Screen name="Bank" component={BankScreen} />
                <Stack.Screen name="Personal" component={PersonalScreen} />
                <Stack.Screen name="Refer" component={ReferScreen} />
                <Stack.Screen name="Insurance" component={InsuranceScreen} />
                <Stack.Screen name="Help" component={HelpScreen} />
                <Stack.Screen name="Safety" component={SafetyScreen} />
                <Stack.Screen name="Settings" component={SettingsScreen} />
                <Stack.Screen name="Language" component={LanguageScreen} />
                <Stack.Screen name="Terms" component={TermsScreen} />
              </>
            ) : inside ? (
              <>
                <Stack.Screen name="Verification" component={VerificationScreen} />
                <Stack.Screen name="Documents" component={DocumentsScreen} />
                <Stack.Screen name="Help" component={HelpScreen} />
                <Stack.Screen name="Terms" component={TermsScreen} />
              </>
            ) : (
              <>
                <Stack.Screen name="Phone" component={PhoneScreen} initialParams={{ mode: "login" }} />
                <Stack.Screen name="Otp" component={OtpScreen} />
                <Stack.Screen name="Register" component={RegisterScreen} />
                <Stack.Screen name="Terms" component={TermsScreen} />
              </>
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </View>
      {working && route !== "Job" ? <AppTabBar active={active} onPress={openTab} /> : null}
    </View>
  );
}
