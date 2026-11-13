import { useRef, useState, type ReactNode } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "../theme";

export function DragSheet({
  children,
  peek = 140,
  style,
  onSnap,
  onHeight,
}: {
  children: ReactNode;
  peek?: number;
  style?: StyleProp<ViewStyle>;
  onSnap?: (collapsed: boolean) => void;
  onHeight?: (height: number) => void;
}) {
  const [height, setHeight] = useState(0);
  const snapRef = useRef(onSnap);
  snapRef.current = onSnap;
  const offset = useRef(new Animated.Value(0)).current;
  const rest = useRef(0);
  const start = useRef(0);
  const travel = Math.max(0, height - peek);
  const travelRef = useRef(travel);
  travelRef.current = travel;

  const settle = (to: number) => {
    if ((rest.current > 0) !== (to > 0)) snapRef.current?.(to > 0);
    rest.current = to;
    Animated.spring(offset, { toValue: to, useNativeDriver: false, speed: 16, bounciness: 3 }).start();
  };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        offset.stopAnimation((value) => {
          start.current = value;
        });
      },
      onPanResponderMove: (_, g) => {
        const max = travelRef.current;
        const next = start.current + g.dy;
        const eased = next < 0 ? next / 4 : next > max ? max + (next - max) / 4 : next;
        offset.setValue(eased);
      },
      onPanResponderRelease: (_, g) => {
        const max = travelRef.current;
        const at = start.current + g.dy;
        if (g.vy > 0.5) settle(max);
        else if (g.vy < -0.5) settle(0);
        else settle(at > max / 2 ? max : 0);
      },
      onPanResponderTerminate: () => settle(rest.current),
    }),
  ).current;

  const toggle = () => settle(rest.current > 0 ? 0 : travelRef.current);

  return (
    <Animated.View
      onLayout={(event) => {
        setHeight(event.nativeEvent.layout.height);
        onHeight?.(event.nativeEvent.layout.height);
      }}
      style={[styles.sheet, style, { transform: [{ translateY: offset }] }]}
      {...pan.panHandlers}
    >
      <Pressable accessibilityRole="button" accessibilityLabel="Expand or collapse" onPress={toggle} hitSlop={12} style={styles.grip}>
        <View style={styles.handle} />
      </Pressable>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: colors.sheet, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: colors.line, paddingHorizontal: 16, paddingBottom: 16, gap: 10, shadowColor: "#000000", shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: -6 }, elevation: 18 },
  grip: { alignSelf: "stretch", alignItems: "center", paddingTop: 10, paddingBottom: 6 },
  handle: { width: 44, height: 4, borderRadius: 2, backgroundColor: "rgba(214,160,0,0.5)" },
});
