import { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { CoverPhoto } from "./CoverPhoto";
import { colors, type } from "../theme";

export type Banner = { image: number; ratio: number; focus?: number; kicker: string; title: string; cta?: string; onPress?: () => void };

const INTERVAL = 4200;

export function BannerCarousel({ slides, height = 108, style }: { slides: Banner[]; height?: number; style?: StyleProp<ViewStyle> }) {
  const scroller = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const current = useRef(0);

  useEffect(() => {
    if (!width || held || slides.length < 2) return;
    const timer = setTimeout(() => scroller.current?.scrollTo({ x: ((current.current + 1) % slides.length) * width, animated: true }), INTERVAL);
    return () => clearTimeout(timer);
  }, [width, index, held, slides.length]);

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const at = Math.min(slides.length - 1, Math.max(0, Math.round(event.nativeEvent.contentOffset.x / width)));
    if (at !== current.current) {
      current.current = at;
      setIndex(at);
    }
  };

  return (
    <View style={[styles.frame, { height }, style]} onLayout={onLayout}>
      {width ? (
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          onScrollBeginDrag={() => setHeld(true)}
          onScrollEndDrag={() => setHeld(false)}
          scrollEventThrottle={16}
        >
          {slides.map((slide) => (
            <Pressable key={slide.title} accessibilityRole={slide.onPress ? "button" : undefined} disabled={!slide.onPress} onPress={slide.onPress} style={{ width, height }}>
              <CoverPhoto source={slide.image} ratio={slide.ratio} focus={slide.focus ?? 0.4} style={StyleSheet.absoluteFill} />
              <LinearGradient colors={["rgba(18,6,13,0.96)", "rgba(18,6,13,0.78)", "rgba(18,6,13,0)"]} locations={[0, 0.42, 0.78]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
              <View style={styles.copy}>
                <Text style={styles.kicker}>{slide.kicker}</Text>
                <Text style={styles.title} numberOfLines={2}>{slide.title}</Text>
                {slide.cta ? (
                  <View style={styles.cta}>
                    <Text style={styles.ctaText}>{slide.cta}</Text>
                    <Ionicons name="arrow-forward" size={11} color={colors.gold} />
                  </View>
                ) : null}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {slides.length > 1 ? (
        <View style={styles.dots} pointerEvents="none">
          {slides.map((slide, at) => (
            <View key={slide.title} style={[styles.dot, at === index && styles.dotOn]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  copy: { position: "absolute", left: 16, top: 0, bottom: 0, width: "62%", justifyContent: "center" },
  kicker: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 9.5, letterSpacing: 1.8 },
  title: { marginTop: 4, color: colors.cream, fontFamily: type.display, fontSize: 15, lineHeight: 19 },
  cta: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 4 },
  ctaText: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 11.5 },
  dots: { position: "absolute", right: 12, bottom: 10, flexDirection: "row", gap: 4 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "rgba(246,241,220,0.35)" },
  dotOn: { width: 14, backgroundColor: colors.gold },
});
