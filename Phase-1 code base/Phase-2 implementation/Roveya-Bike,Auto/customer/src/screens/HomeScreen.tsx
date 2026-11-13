import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useIsFocused, type CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CoverPhoto } from "../components/CoverPhoto";
import { fallbackHere } from "../data";
import { distanceKm } from "../geo";
import { useScreenWidth } from "../layout";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { CustomerStack, CustomerTabs } from "../navigation";

type Props = CompositeScreenProps<BottomTabScreenProps<CustomerTabs, "Home">, NativeStackScreenProps<CustomerStack>>;

const explore: { icon: keyof typeof Ionicons.glyphMap; label: string; go: "Lounge" | "ParcelFlow" | "Search" | "More" }[] = [
  { icon: "game-controller-outline", label: "Play &\nEarn", go: "Lounge" },
  { icon: "cube-outline", label: "Parcel\non Bike", go: "ParcelFlow" },
  { icon: "bicycle-outline", label: "Scooty", go: "Search" },
  { icon: "grid-outline", label: "More", go: "More" },
];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "GOOD MORNING";
  if (hour < 17) return "GOOD AFTERNOON";
  return "GOOD EVENING";
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export function HomeScreen({ navigation }: Props) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const here = store.pickup ?? fallbackHere;
  const cardWidth = useScreenWidth() - 32;
  const [saved, setSaved] = useState<string[]>([]);
  const recent = store.recentDrops.slice(0, 3);
  const name = store.session?.name ?? "";
  const firstName = name.trim().split(/\s+/)[0] || "rider";
  const focused = useIsFocused();

  // An open ride restored from the server takes the passenger straight back to it.
  useEffect(() => {
    if (focused && store.trip?.serverId) navigation.navigate("Trip");
  }, [focused, store.trip?.serverId]);

  useEffect(() => {
    if (store.pickup) return;
    let alive = true;
    void (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!alive) return;
        if (!permission.granted) {
          store.setPickup(fallbackHere);
          return;
        }
        const position = await Location.getCurrentPositionAsync({});
        if (!alive) return;
        store.setPickup({
          id: "gps",
          name: "Current location",
          subtitle: "From this phone",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      } catch {
        if (alive) store.setPickup(fallbackHere);
      }
    })();
    return () => {
      alive = false;
    };
  }, [store.pickup]);

  const toSearch = () => navigation.navigate("Search", { target: "drop" });

  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 12) + 8 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>{greeting()}</Text>
            <Text style={styles.hello}>Where to, {firstName}?</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Profile" onPress={() => navigation.navigate("Account")} style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(name) || "R"}</Text>
          </Pressable>
        </View>

        <Pressable style={styles.pickup} onPress={() => navigation.navigate("Search", { target: "pickup" })}>
          <View style={styles.pickupDot} />
          <Text style={styles.pickupLabel}>Pickup</Text>
          <Text style={styles.pickupPlace} numberOfLines={1}>{here.name}</Text>
          <Ionicons name="chevron-down" size={14} color={colors.gold} />
        </Pressable>

        <Pressable style={({ pressed }) => [styles.search, pressed && { borderColor: colors.gold }]} onPress={toSearch}>
          <Ionicons name="search" size={19} color={colors.gold} />
          <Text style={styles.searchText} numberOfLines={1}>Where do you want to go?</Text>
          <View style={styles.now}>
            <Ionicons name="time-outline" size={13} color={colors.gold} />
            <Text style={styles.nowText}>Now</Text>
          </View>
        </Pressable>

        {recent.length ? <View style={styles.recents}>
          {recent.map((place, index) => {
            const isSaved = saved.includes(place.id);
            return (
              <Pressable key={place.id} style={({ pressed }) => [styles.recent, index < recent.length - 1 && styles.recentLine, pressed && { backgroundColor: colors.mist }]} onPress={() => {
                  store.rememberDrop(place);
                  navigation.navigate("Options", { drop: place });
                }}>
                <View style={styles.recentIcon}>
                  <Ionicons name="time-outline" size={16} color={colors.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.place} numberOfLines={1}>{place.name}</Text>
                  <Text style={styles.address} numberOfLines={1}>
                    {distanceKm(here, place).toFixed(1)} km · {place.subtitle}
                  </Text>
                </View>
                <Pressable hitSlop={10} onPress={() => setSaved((current) => (isSaved ? current.filter((id) => id !== place.id) : [...current, place.id]))}>
                  <Ionicons name={isSaved ? "heart" : "heart-outline"} size={19} color={isSaved ? colors.gold : colors.faint} />
                </Pressable>
              </Pressable>
            );
          })}
        </View> : null}

        <View style={styles.sectionHead}>
          <Text style={styles.kicker}>RIDE</Text>
          <Text style={styles.section}>Everything in minutes</Text>
        </View>
        <View style={[styles.promoRow, { height: Math.round(cardWidth * 0.66) }]}>
          <Pressable style={{ flex: 1.35 }} onPress={toSearch}>
            <CoverPhoto source={require("../../assets/hero-bike.jpg")} ratio={0.75} focus={0.45} style={styles.photoCard}>
              <LinearGradient colors={["rgba(18,6,13,0)", "rgba(18,6,13,0.92)"]} locations={[0.35, 1]} style={styles.fillAbs} />
              <View style={styles.badge}>
                <Ionicons name="bicycle" size={13} color={colors.night} />
                <Text style={styles.badgeText}>Starts at ₹35</Text>
              </View>
              <View style={styles.photoCopy}>
                <Text style={styles.photoTitle}>Bike</Text>
                <Text style={styles.photoLine}>Affordable rides across the city.</Text>
              </View>
            </CoverPhoto>
          </Pressable>
          <View style={styles.sideCol}>
            <Pressable style={{ flex: 1 }} onPress={toSearch}>
              <CoverPhoto source={require("../../assets/hero-auto.jpg")} ratio={0.75} focus={0.5} style={styles.photoCard}>
                <LinearGradient colors={["rgba(18,6,13,0)", "rgba(18,6,13,0.9)"]} locations={[0.3, 1]} style={styles.fillAbs} />
                <View style={styles.photoCopySmall}>
                  <Text style={styles.photoTitleSmall}>Auto</Text>
                  <Text style={styles.photoLineSmall}>Door to door</Text>
                </View>
              </CoverPhoto>
            </Pressable>
          </View>
        </View>

        <Pressable onPress={() => navigation.navigate("Pool")}>
          <CoverPhoto source={require("../../assets/cust-pool-group.jpg")} ratio={0.75} focus={0.42} style={[styles.banner, { height: Math.max(170, Math.round(cardWidth * 0.52)) }]}>
            <LinearGradient colors={["rgba(18,6,13,0.94)", "rgba(18,6,13,0.6)", "rgba(18,6,13,0.05)"]} locations={[0, 0.5, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.fillAbs} />
            <View style={styles.bannerCopy}>
              <Text style={styles.kicker}>TAXIPOOL · CITY TO CITY</Text>
              <Text style={styles.bannerTitle}>A seat of{"\n"}your own.</Text>
              <Text style={styles.bannerLine}>Khammam, Vijayawada, and Warangal from Hyderabad.</Text>
              <View style={styles.bannerCta}>
                <Text style={styles.bannerCtaText}>Book a seat</Text>
                <Ionicons name="arrow-forward" size={14} color={colors.night} />
              </View>
            </View>
          </CoverPhoto>
        </Pressable>

        <View style={styles.exploreHead}>
          <View>
            <Text style={styles.kicker}>MORE FROM ROVEYA</Text>
            <Text style={styles.section}>Explore</Text>
          </View>
          <Pressable style={styles.viewAll} onPress={() => navigation.navigate("Services")}>
            <Text style={styles.viewAllText}>View all</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.gold} />
          </Pressable>
        </View>
        <View style={styles.tiles}>
          {explore.map((item) => (
            <Pressable
              key={item.label}
              style={styles.tile}
              onPress={() => {
                if (item.go === "Search") toSearch();
                else if (item.go === "More") navigation.navigate("Services");
                else navigation.navigate(item.go);
              }}
            >
              {({ pressed }) => (
                <>
                  <View style={[styles.tileIcon, pressed && { borderColor: colors.gold, backgroundColor: colors.mist }]}>
                    <Ionicons name={item.icon} size={24} color={colors.gold} />
                  </View>
                  <Text style={styles.tileLabel}>{item.label}</Text>
                </>
              )}
            </Pressable>
          ))}
        </View>

        <View style={styles.footer}>
          <View style={styles.footerRule} />
          <Text style={styles.hash}>#goROVEYA</Text>
          <Text style={styles.footerLine}>Made for India · Crafted in Hyderabad</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.night },
  content: { paddingHorizontal: 16, paddingBottom: 28 },
  fillAbs: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  kicker: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 10, letterSpacing: 2.4 },
  hello: { marginTop: 4, color: colors.cream, fontFamily: type.display, fontSize: 25, lineHeight: 30, letterSpacing: -0.4 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.gold, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15, letterSpacing: 1 },
  pickup: { marginTop: 14, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, maxWidth: "100%" },
  pickupDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold },
  pickupLabel: { color: colors.faint, fontFamily: type.label, fontSize: 12 },
  pickupPlace: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 12.5, flexShrink: 1 },
  search: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.inkwell, borderRadius: 30, paddingLeft: 18, paddingRight: 8, height: 58, borderWidth: 1, borderColor: "rgba(214,160,0,0.4)" },
  searchText: { flex: 1, color: colors.cream, fontFamily: type.label, fontSize: 16 },
  now: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, height: 40, borderRadius: 20, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line },
  nowText: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 13 },
  recents: { marginTop: 14, backgroundColor: colors.inkwell, borderRadius: 22, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  recent: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 14 },
  recentLine: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  recentIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  place: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15 },
  address: { marginTop: 2, color: colors.faint, fontFamily: type.body, fontSize: 12.5 },
  sectionHead: { marginTop: 26, marginBottom: 12 },
  section: { marginTop: 3, color: colors.cream, fontFamily: type.display, fontSize: 20, lineHeight: 25, letterSpacing: -0.3 },
  promoRow: { flexDirection: "row", gap: 10 },
  sideCol: { flex: 1, gap: 10 },
  photoCard: { flex: 1, borderRadius: 20, borderWidth: 1, borderColor: colors.line },
  badge: { position: "absolute", top: 12, left: 12, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.gold, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5 },
  badgeText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 11.5 },
  photoCopy: { position: "absolute", left: 14, right: 14, bottom: 14 },
  photoTitle: { color: colors.cream, fontFamily: type.display, fontSize: 22, lineHeight: 26, letterSpacing: -0.3 },
  photoLine: { marginTop: 2, color: colors.muted, fontFamily: type.body, fontSize: 12.5, lineHeight: 16 },
  photoCopySmall: { position: "absolute", left: 12, right: 12, bottom: 10 },
  soonTag: { position: "absolute", top: 10, left: 10, backgroundColor: colors.gold, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  soonTagText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 10.5 },
  photoTitleSmall: { color: colors.cream, fontFamily: type.display, fontSize: 17, lineHeight: 21 },
  photoLineSmall: { color: colors.muted, fontFamily: type.body, fontSize: 11 },
  banner: { marginTop: 12, borderRadius: 22, borderWidth: 1, borderColor: colors.line },
  bannerCopy: { position: "absolute", top: 0, bottom: 0, left: 18, width: "62%", justifyContent: "center" },
  bannerTitle: { marginTop: 6, color: colors.cream, fontFamily: type.display, fontSize: 21, lineHeight: 25, letterSpacing: -0.3 },
  bannerLine: { marginTop: 6, color: colors.muted, fontFamily: type.body, fontSize: 12, lineHeight: 16 },
  bannerCta: { marginTop: 12, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.gold, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  bannerCtaText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 12.5 },
  exploreHead: { marginTop: 26, marginBottom: 12, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  viewAll: { flexDirection: "row", alignItems: "center", gap: 2, paddingBottom: 4 },
  viewAllText: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 13 },
  tiles: { flexDirection: "row", justifyContent: "space-between" },
  tile: { width: "23%", alignItems: "center", gap: 8 },
  tileIcon: { width: "100%", aspectRatio: 1, borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  tileLabel: { color: colors.cream, fontFamily: type.label, fontSize: 12, textAlign: "center", lineHeight: 15 },
  footer: { alignItems: "center", paddingTop: 30, paddingBottom: 8, gap: 6 },
  footerRule: { width: 36, height: 1.5, backgroundColor: colors.gold, marginBottom: 6 },
  hash: { color: "rgba(246,241,220,0.32)", fontFamily: type.display, fontSize: 24 },
  footerLine: { color: colors.faint, fontFamily: type.body, fontSize: 12.5 },
});
