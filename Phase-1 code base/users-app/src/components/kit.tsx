import { useEffect, useRef, useState, type DependencyList, type ReactNode } from "react";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, Animated, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, type DimensionValue, type ImageSourcePropType, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScreenWidth } from "../layout";
import { colors, type } from "../theme";
import type { Glyph, Offer } from "../types";

// Ionicons by default; "mc:" picks MaterialCommunityIcons for glyphs Ionicons draws poorly (women, seats, cars).
export function Icon({ name, size = 18, color = colors.gold }: { name: Glyph; size?: number; color?: string }) {
  if (name.startsWith("mc:")) return <MaterialCommunityIcons name={name.slice(3) as keyof typeof MaterialCommunityIcons.glyphMap} size={size} color={color} />;
  return <Ionicons name={name as keyof typeof Ionicons.glyphMap} size={size} color={color} />;
}

// Simulated network wait for the static build: true for `ms` after mount and whenever deps change.
export function useLoading(ms: number, deps: DependencyList = []) {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => setLoading(false), ms);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return loading;
}

export function Skeleton({ width = "100%", height = 14, radius = 8, style }: { width?: DimensionValue; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: colors.mist, opacity: pulse }, style]} />;
}

// Placeholder shaped like a list card while data loads.
export function SkeletonCard({ lines = 3, style }: { lines?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.card, { gap: 10 }, style]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Skeleton width={40} height={40} radius={12} />
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton width="60%" height={13} />
          <Skeleton width="40%" height={10} />
        </View>
      </View>
      {Array.from({ length: lines - 1 }, (_, index) => (
        <Skeleton key={index} width={index % 2 ? "70%" : "100%"} height={11} />
      ))}
    </View>
  );
}

export function Loader({ label }: { label?: string }) {
  return (
    <View style={styles.loader}>
      <ActivityIndicator color={colors.gold} />
      {label ? <Text style={styles.loaderText}>{label}</Text> : null}
    </View>
  );
}

// The one ROVEYA mark, shared with the website, admin panel and print: Phase-1 code base/brand/roveya-mark.svg
const MARK = require("../../assets/roveya-mark.png") as ImageSourcePropType;

export function Logo({ size = 40 }: { size?: number }) {
  return <Image source={MARK} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel="ROVEYA" />;
}

export function Wordmark({ size = 18, kicker = "Transportation Services Private Limited" }: { size?: number; kicker?: string }) {
  return (
    <View>
      <Text style={{ color: colors.cream, fontFamily: type.semibold, fontSize: size, letterSpacing: 4 }}>ROVEYA</Text>
      {kicker ? <Text style={styles.wordKicker}>{kicker}</Text> : null}
    </View>
  );
}

export function Header({ title, subtitle, onBack, right }: { title: string; subtitle?: string; onBack?: () => void; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 4 }]}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={onBack} style={({ pressed }) => [styles.circle, pressed && { backgroundColor: colors.plum }]}>
          <Ionicons name="arrow-back" size={18} color={colors.cream} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.headerSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

// The centred-title header used by Account's inner pages.
export function PageTitle({ title, onBack }: { title: string; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.pageTitle, { paddingTop: Math.max(insets.top, 12) + 6 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={onBack} style={styles.pageBack}>
        <Ionicons name="chevron-back" size={22} color={colors.cream} />
      </Pressable>
      <Text style={styles.pageTitleText} numberOfLines={1}>{title}</Text>
      <View style={{ width: 44 }} />
    </View>
  );
}

export function Accordion({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <View style={[styles.accordion, open && { borderColor: colors.gold }]}>
      <Pressable onPress={onToggle} style={styles.accordionHead}>
        <Text style={styles.accordionTitle}>{title}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.gold} />
      </Pressable>
      {open ? <View style={styles.accordionBody}>{children}</View> : null}
    </View>
  );
}

export function Button({ label, onPress, icon, disabled, loading, tone = "gold", style, trailing }: { label: string; onPress: () => void; icon?: Glyph; disabled?: boolean; loading?: boolean; tone?: "gold" | "ghost" | "burgundy"; style?: StyleProp<ViewStyle>; trailing?: string }) {
  const solid = tone === "gold";
  const ink = solid ? colors.night : colors.cream;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.button, tone === "ghost" && styles.buttonGhost, tone === "burgundy" && styles.buttonBurgundy, disabled && !loading && { opacity: 0.45 }, pressed && { opacity: 0.85 }, style]}
    >
      {loading ? <ActivityIndicator size="small" color={ink} /> : icon ? <Icon name={icon} size={17} color={ink} /> : null}
      <Text style={[styles.buttonText, !solid && { color: colors.cream }]}>{label}</Text>
      {trailing && !loading ? <Text style={[styles.buttonTrail, !solid && { color: colors.gold }]}>{trailing}</Text> : null}
    </Pressable>
  );
}

export function Chip({ label, on, onPress, icon }: { label: string; on?: boolean; onPress?: () => void; icon?: Glyph }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && { opacity: 0.85 }]}>
      {icon ? <Icon name={icon} size={15} color={on ? colors.night : colors.gold} /> : null}
      <Text style={[styles.chipText, on && { color: colors.night }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { borderColor: colors.gold }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Section({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <Pressable hitSlop={8} onPress={onAction} style={styles.sectionAction}>
          <Text style={styles.sectionActionText}>{action}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.gold} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Rating({ value, count }: { value: number; count?: number }) {
  return (
    <View style={styles.rating}>
      <View style={styles.ratingStar}>
        <Ionicons name="star" size={11} color={colors.night} />
        <Text style={styles.ratingValue}>{value.toFixed(1)}</Text>
      </View>
      {count !== undefined ? (
        <View style={styles.ratingCount}>
          <Ionicons name="person-outline" size={11} color={colors.muted} />
          <Text style={styles.ratingCountText}>{count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function Tag({ label, icon }: { label: string; icon?: Glyph }) {
  return (
    <View style={styles.tag}>
      {icon ? <Icon name={icon} size={12} color={colors.gold} /> : null}
      <Text style={styles.tagText}>{label}</Text>
    </View>
  );
}

export function Sheet({ visible, onClose, title, children, footer }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetStage}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          <View style={styles.grabber} />
          {title ? (
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{title}</Text>
              <Pressable hitSlop={10} onPress={onClose}>
                <Ionicons name="close" size={20} color={colors.faint} />
              </Pressable>
            </View>
          ) : null}
          <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <View style={{ paddingTop: 10 }}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const offerTones: Record<Offer["tone"], [string, string]> = {
  gold: [colors.cherry, colors.inkwell],
  plum: [colors.plum, colors.night],
  burgundy: [colors.burgundy, colors.cherry],
};

export function OfferCard({ offer, width, onPress }: { offer: Offer; width: number; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ width }}>
      <LinearGradient colors={offerTones[offer.tone]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.offer}>
        <Text style={styles.offerKicker}>{offer.kicker}</Text>
        <Text style={styles.offerTitle}>{offer.title}</Text>
        <Text style={styles.offerLine}>{offer.line}</Text>
        <View style={styles.offerCode}>
          <Text style={styles.offerCodeLabel}>CODE</Text>
          <Text style={styles.offerCodeValue}>{offer.code}</Text>
        </View>
        <Ionicons name="pricetags" size={64} color="rgba(214,160,0,0.14)" style={styles.offerArt} />
      </LinearGradient>
    </Pressable>
  );
}

export type Slide = { image: ImageSourcePropType; kicker: string; title: string; cta?: string; onPress?: () => void };

// Paged photo banners that move on by themselves every few seconds.
export function Banners({ slides, height = 150, inset = 16 }: { slides: Slide[]; height?: number; inset?: number }) {
  const width = useScreenWidth() - inset * 2;
  const scroller = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (slides.length < 2) return;
    const timer = setInterval(() => {
      setIndex((current) => {
        const next = (current + 1) % slides.length;
        scroller.current?.scrollTo({ x: next * (width + 10), animated: true });
        return next;
      });
    }, 4200);
    return () => clearInterval(timer);
  }, [slides.length, width]);
  return (
    <View>
      <ScrollView
        ref={scroller}
        horizontal
        snapToInterval={width + 10}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: inset, gap: 10 }}
        onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / (width + 10)))}
      >
        {slides.map((slide) => (
          <Pressable key={slide.title} onPress={slide.onPress} style={[styles.banner, { width, height }]}>
            <Image source={slide.image} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <LinearGradient colors={["rgba(18,6,13,0.92)", "rgba(18,6,13,0.35)", "rgba(18,6,13,0)"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
            <View style={styles.bannerText}>
              <Text style={styles.bannerKicker}>{slide.kicker}</Text>
              <Text style={styles.bannerTitle}>{slide.title}</Text>
              {slide.cta ? (
                <View style={styles.bannerCta}>
                  <Text style={styles.bannerCtaText}>{slide.cta}</Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        ))}
      </ScrollView>
      {slides.length > 1 ? (
        <View style={styles.dots}>
          {slides.map((slide, position) => (
            <View key={slide.title} style={[styles.dot, position === index && styles.dotOn]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "gold" | "success" }) {
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, strong && styles.lineStrong]}>{label}</Text>
      <Text style={[styles.lineValue, strong && styles.lineStrong, tone === "gold" && { color: colors.gold }, tone === "success" && { color: colors.success }]}>{value}</Text>
    </View>
  );
}

export const inr = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;

const styles = StyleSheet.create({
  wordKicker: { color: colors.gold, fontFamily: type.medium, fontSize: 10, letterSpacing: 1.2, marginTop: 3, textTransform: "uppercase" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: colors.night, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  circle: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.cream, fontFamily: type.semibold, fontSize: 17 },
  headerSub: { marginTop: 2, color: colors.muted, fontFamily: type.regular, fontSize: 12.5 },
  pageTitle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingBottom: 12, backgroundColor: colors.night, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  pageBack: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  pageTitleText: { flex: 1, textAlign: "center", color: colors.cream, fontFamily: type.semibold, fontSize: 18 },
  accordion: { borderRadius: 16, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  accordionHead: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
  accordionTitle: { flex: 1, color: colors.cream, fontFamily: type.medium, fontSize: 15, lineHeight: 21 },
  accordionBody: { paddingHorizontal: 16, paddingBottom: 14, gap: 10, borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: 12 },
  loader: { alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 40 },
  loaderText: { color: colors.muted, fontFamily: type.regular, fontSize: 13 },
  button: { height: 50, borderRadius: 15, backgroundColor: colors.gold, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 18 },
  buttonGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.line },
  buttonBurgundy: { backgroundColor: colors.burgundy },
  buttonText: { color: colors.night, fontFamily: type.semibold, fontSize: 15.5 },
  buttonTrail: { color: colors.night, fontFamily: type.bold, fontSize: 15.5, opacity: 0.8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  chipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipText: { color: colors.cream, fontFamily: type.medium, fontSize: 13 },
  card: { borderRadius: 20, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, padding: 16 },
  section: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 26, marginBottom: 12, paddingHorizontal: 16 },
  sectionTitle: { color: colors.cream, fontFamily: type.semibold, fontSize: 17 },
  sectionAction: { flexDirection: "row", alignItems: "center", gap: 2 },
  sectionActionText: { color: colors.gold, fontFamily: type.medium, fontSize: 13 },
  rating: { flexDirection: "row", alignItems: "center", gap: 6 },
  ratingStar: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.gold, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  ratingValue: { color: colors.night, fontFamily: type.bold, fontSize: 12 },
  ratingCount: { flexDirection: "row", alignItems: "center", gap: 2 },
  ratingCountText: { color: colors.muted, fontFamily: type.medium, fontSize: 11.5 },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: "rgba(214,160,0,0.1)" },
  tagText: { color: colors.goldBright, fontFamily: type.medium, fontSize: 11.5 },
  sheetStage: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: { backgroundColor: colors.inkwell, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16, paddingTop: 8, width: "100%", maxWidth: 430, alignSelf: "center" },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.faint, marginBottom: 10 },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sheetTitle: { color: colors.cream, fontFamily: type.semibold, fontSize: 18 },
  offer: { borderRadius: 20, padding: 16, minHeight: 150, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  offerKicker: { color: colors.gold, fontFamily: type.semibold, fontSize: 10, letterSpacing: 2 },
  offerTitle: { marginTop: 8, color: colors.cream, fontFamily: type.semibold, fontSize: 18, lineHeight: 23, maxWidth: "80%" },
  offerLine: { marginTop: 4, color: colors.muted, fontFamily: type.regular, fontSize: 12.5 },
  offerCode: { marginTop: 14, flexDirection: "row", alignSelf: "flex-start", borderRadius: 10, borderWidth: 1, borderStyle: "dashed", borderColor: colors.gold, overflow: "hidden" },
  offerCodeLabel: { backgroundColor: colors.gold, color: colors.night, fontFamily: type.bold, fontSize: 10.5, paddingHorizontal: 7, paddingVertical: 5 },
  offerCodeValue: { color: colors.gold, fontFamily: type.bold, fontSize: 12, letterSpacing: 1, paddingHorizontal: 9, paddingVertical: 5 },
  offerArt: { position: "absolute", right: -6, bottom: -8 },
  banner: { borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell },
  bannerText: { flex: 1, justifyContent: "center", padding: 18, maxWidth: "70%" },
  bannerKicker: { color: colors.gold, fontFamily: type.semibold, fontSize: 10, letterSpacing: 2 },
  bannerTitle: { marginTop: 6, color: colors.cream, fontFamily: type.semibold, fontSize: 19, lineHeight: 24 },
  bannerCta: { marginTop: 12, alignSelf: "flex-start", backgroundColor: colors.gold, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  bannerCtaText: { color: colors.night, fontFamily: type.semibold, fontSize: 12.5 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(246,241,220,0.25)" },
  dotOn: { width: 18, backgroundColor: colors.gold },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingVertical: 6 },
  lineLabel: { flexShrink: 1, color: colors.muted, fontFamily: type.regular, fontSize: 14 },
  lineValue: { color: colors.cream, fontFamily: type.medium, fontSize: 14 },
  lineStrong: { color: colors.cream, fontFamily: type.semibold, fontSize: 16 },
});
