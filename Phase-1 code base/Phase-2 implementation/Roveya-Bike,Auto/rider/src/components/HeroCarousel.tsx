import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, type ImageSourcePropType, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { CoverPhoto } from "./CoverPhoto";
import { Logo } from "./Logo";
import { colors, type } from "../theme";

type Slide = { image: ImageSourcePropType; ratio: number; focus: number; kicker: string; title: string; line: string };

const slides: Slide[] = [
  { image: require("../../assets/cap-hero.jpg"), ratio: 0.75, focus: 0.32, kicker: "BIKE CAPTAINS", title: "Drive with pride.\nEarn with ROVEYA.", line: "Premium rides across Telangana, on hours you choose." },
  { image: require("../../assets/hero-auto.jpg"), ratio: 0.75, focus: 0.45, kicker: "AUTO CAPTAINS", title: "Steady rides, all day long.", line: "Passengers near you, fares shown before every trip." },
  { image: require("../../assets/hero-car.jpg"), ratio: 0.75, focus: 0.5, kicker: "CAB CAPTAINS", title: "Premium passengers. Premium trips.", line: "City rides and taxipool journeys between cities." },
];

const interval = 4200;

export function HeroCarousel() {
  const scroller = useRef<ScrollView>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const current = useRef(0);
  const width = box.width;

  useEffect(() => {
    if (!width || held) return;
    progress.setValue(0);
    const run = Animated.timing(progress, { toValue: 1, duration: interval, easing: Easing.linear, useNativeDriver: false });
    run.start(({ finished }) => {
      if (finished) scroller.current?.scrollTo({ x: ((current.current + 1) % slides.length) * width, animated: true });
    });
    return () => run.stop();
  }, [width, index, held, progress]);

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [index, fade]);

  const onLayout = (event: LayoutChangeEvent) => setBox(event.nativeEvent.layout);
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const at = Math.min(slides.length - 1, Math.max(0, Math.round(event.nativeEvent.contentOffset.x / width)));
    if (at !== current.current) {
      current.current = at;
      setIndex(at);
    }
  };
  const jump = (to: number) => scroller.current?.scrollTo({ x: to * width, animated: true });
  const slide = slides[index];

  return (
    <View style={styles.frame} onLayout={onLayout}>
      {width ? (
        <ScrollView ref={scroller} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} onScrollBeginDrag={() => setHeld(true)} onScrollEndDrag={() => setHeld(false)} scrollEventThrottle={16}>
          {slides.map((item) => (
            <View key={item.kicker} style={{ width, height: box.height }}>
              <CoverPhoto source={item.image} ratio={item.ratio} focus={item.focus} style={StyleSheet.absoluteFill} />
              <LinearGradient colors={["rgba(18,6,13,0.85)", "rgba(18,6,13,0.35)", "rgba(18,6,13,0)"]} locations={[0, 0.16, 0.32]} style={styles.shade} />
              <LinearGradient colors={["rgba(18,6,13,0)", "rgba(18,6,13,0.7)", "rgba(18,6,13,0.96)"]} locations={[0.46, 0.74, 1]} style={styles.shade} />
            </View>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.top} pointerEvents="none">
        <View style={styles.brand}>
          <Logo size={30} />
          <View>
            <Text style={styles.word}>ROVEYA</Text>
            <Text style={styles.tag}>CAPTAIN</Text>
          </View>
        </View>
        <Text style={styles.count}>
          {String(index + 1).padStart(2, "0")}
          <Text style={styles.countOf}> / {String(slides.length).padStart(2, "0")}</Text>
        </Text>
      </View>

      <View style={styles.copy} pointerEvents="box-none">
        <Animated.View pointerEvents="none" style={{ opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
          <View style={styles.kickerRow}>
            <View style={styles.kickerRule} />
            <Text style={styles.kicker}>{slide.kicker}</Text>
          </View>
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.line}>{slide.line}</Text>
        </Animated.View>
        <View style={styles.bars}>
          {slides.map((item, bar) => (
            <Pressable key={item.kicker} accessibilityRole="button" accessibilityLabel={`Show ${item.kicker.toLowerCase()}`} hitSlop={10} onPress={() => jump(bar)} style={styles.bar}>
              <Animated.View style={[styles.fill, { width: bar < index ? "100%" : bar === index ? progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) : "0%" }]} />
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, minHeight: 240, borderRadius: 28, overflow: "hidden", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night },
  shade: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  top: { position: "absolute", top: 16, left: 18, right: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  word: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 14, letterSpacing: 5 },
  tag: { marginTop: 2, color: colors.gold, fontFamily: type.label, fontSize: 8, letterSpacing: 1.8 },
  count: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 12, letterSpacing: 1.2 },
  countOf: { color: colors.faint, fontFamily: type.label },
  copy: { position: "absolute", left: 20, right: 20, bottom: 18 },
  kickerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  kickerRule: { width: 20, height: 1.5, backgroundColor: colors.gold },
  kicker: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 10.5, letterSpacing: 3 },
  title: { marginTop: 8, color: colors.cream, fontFamily: type.display, fontSize: 25, lineHeight: 30, letterSpacing: -0.4 },
  line: { marginTop: 6, color: colors.muted, fontFamily: type.body, fontSize: 13.5, lineHeight: 19 },
  bars: { marginTop: 14, flexDirection: "row", gap: 6 },
  bar: { width: 30, height: 2.5, borderRadius: 2, overflow: "hidden", backgroundColor: "rgba(246,241,220,0.22)" },
  fill: { height: "100%", borderRadius: 2, backgroundColor: colors.gold },
});
