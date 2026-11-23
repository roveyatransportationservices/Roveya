import { useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button, Icon, Logo, Wordmark } from "../components/kit";
import { useScreenWidth } from "../layout";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { Glyph } from "../types";
import type { UserStack } from "../navigation";

const slides: { image: number; kicker: string; title: string; line: string; icon: Glyph }[] = [
  { image: require("../../assets/hero-car.jpg"), kicker: "50+ ROUTES · 2,000+ VERIFIED CARS", title: "Book a seat, not the whole car", line: "AC cars between the cities you travel, at a seat price.", icon: "mc:car-side" },
  { image: require("../../assets/cust-pool-group.jpg"), kicker: "PICK YOUR SEAT", title: "Window, front, or middle. Your call.", line: "See the car layout and choose the exact seat you want.", icon: "mc:car-seat" },
  { image: require("../../assets/cust-car-woman.jpg"), kicker: "WOMEN ZONE", title: "Women sit next to women", line: "Women-only seats and women-friendly cars, marked in pink.", icon: "mc:face-woman-outline" },
  { image: require("../../assets/banner-cab.jpg"), kicker: "VERIFIED CAPTAINS", title: "Every captain checked and trained", line: "Live tracking, SOS, and the captain's details before you board.", icon: "mc:account-check-outline" },
  { image: require("../../assets/hero-car.jpg"), kicker: "INSTANT REFUNDS", title: "Plans change. Refunds are quick.", line: "Cancel online. Refunds land in ROVEYA Cash in minutes.", icon: "mc:lightning-bolt-outline" },
];

export function OnboardingScreen({ navigation }: NativeStackScreenProps<UserStack, "Onboarding">) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const width = useScreenWidth();
  const scroller = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((current) => {
        const next = (current + 1) % slides.length;
        scroller.current?.scrollTo({ x: next * width, animated: true });
        return next;
      });
    }, 3800);
    return () => clearInterval(timer);
  }, [width]);

  const leave = (login: boolean) => {
    store.finishOnboarding();
    navigation.reset({ index: login ? 1 : 0, routes: login ? [{ name: "Tabs" }, { name: "Login" }] : [{ name: "Tabs" }] });
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / width))}
        style={StyleSheet.absoluteFill}
      >
        {slides.map((slide) => (
          <View key={slide.title} style={{ width, flex: 1 }}>
            <Image source={slide.image} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <LinearGradient colors={["rgba(18,6,13,0.55)", "rgba(18,6,13,0.15)", "rgba(18,6,13,0.92)", colors.night]} locations={[0, 0.3, 0.62, 0.8]} style={StyleSheet.absoluteFill} />
          </View>
        ))}
      </ScrollView>

      <View style={[styles.top, { paddingTop: Math.max(insets.top, 14) + 6 }]} pointerEvents="box-none">
        <View style={styles.brand}>
          <Logo size={36} />
          <Wordmark size={16} kicker="" />
        </View>
        <Pressable accessibilityRole="button" onPress={() => leave(false)} style={styles.skip}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]} pointerEvents="box-none">
        <View style={styles.iconRing}>
          <Icon name={slides[index].icon} size={22} />
        </View>
        <Text style={styles.kicker}>{slides[index].kicker}</Text>
        <Text style={styles.title}>{slides[index].title}</Text>
        <Text style={styles.line}>{slides[index].line}</Text>
        <View style={styles.dots}>
          {slides.map((slide, position) => (
            <View key={slide.title} style={[styles.dot, position === index && styles.dotOn]} />
          ))}
        </View>
        <Button label="Login & Book Now" icon="arrow-forward" onPress={() => leave(true)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  top: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  skip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, backgroundColor: "rgba(18,6,13,0.6)", borderWidth: 1, borderColor: colors.line },
  skipText: { color: colors.cream, fontFamily: type.medium, fontSize: 13 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 22 },
  iconRing: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: colors.gold, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(18,6,13,0.6)" },
  kicker: { marginTop: 16, color: colors.gold, fontFamily: type.semibold, fontSize: 11, letterSpacing: 2 },
  title: { marginTop: 8, color: colors.cream, fontFamily: type.semibold, fontSize: 26, lineHeight: 32 },
  line: { marginTop: 8, color: colors.muted, fontFamily: type.regular, fontSize: 14.5, lineHeight: 21 },
  dots: { flexDirection: "row", gap: 6, marginTop: 22, marginBottom: 20 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "rgba(246,241,220,0.3)" },
  dotOn: { width: 22, backgroundColor: colors.gold },
});
