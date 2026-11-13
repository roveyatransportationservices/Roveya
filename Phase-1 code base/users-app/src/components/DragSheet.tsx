import { useEffect, useRef, type ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Animated, Dimensions, Easing, Modal, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, type } from "../theme";

const SCREEN = Dimensions.get("window").height;

// A tall bottom sheet that follows the finger and closes when dragged down far or fast enough.
export function DragSheet({ visible, onClose, title, children, heightRatio = 0.9 }: { visible: boolean; onClose: () => void; title: string; children: ReactNode; heightRatio?: number }) {
  const insets = useSafeAreaInsets();
  const height = Math.round(SCREEN * heightRatio);
  const offset = useRef(new Animated.Value(height)).current;
  const closing = useRef(false);

  useEffect(() => {
    if (!visible) return;
    closing.current = false;
    offset.setValue(height);
    Animated.timing(offset, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [visible]);

  const dismiss = () => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(offset, { toValue: height, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => onClose());
  };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => offset.setValue(Math.max(0, gesture.dy)),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > height * 0.22 || gesture.vy > 1.1) dismiss();
        else Animated.spring(offset, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
      },
    }),
  ).current;

  const backdrop = offset.interpolate({ inputRange: [0, height], outputRange: [0.6, 0], extrapolate: "clamp" });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={dismiss}>
      <View style={styles.stage}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: backdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View style={[styles.sheet, { height, paddingBottom: Math.max(insets.bottom, 12), transform: [{ translateY: offset }] }]}>
          <View {...pan.panHandlers} style={styles.grip}>
            <View style={styles.handle} />
            <View style={styles.head}>
              <View style={{ width: 40 }} />
              <Text style={styles.title}>{title}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={dismiss} style={styles.close}>
                <Ionicons name="close" size={20} color={colors.cream} />
              </Pressable>
            </View>
          </View>
          <View style={{ flex: 1 }}>{children}</View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, justifyContent: "flex-end" },
  sheet: { width: "100%", maxWidth: 430, alignSelf: "center", backgroundColor: colors.night, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  grip: { backgroundColor: colors.inkwell, borderBottomWidth: 1, borderBottomColor: colors.hairline, paddingBottom: 12 },
  handle: { alignSelf: "center", width: 42, height: 5, borderRadius: 3, backgroundColor: "rgba(246,241,220,0.3)", marginTop: 8, marginBottom: 6 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16 },
  title: { color: colors.cream, fontFamily: type.semibold, fontSize: 18 },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.mist, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
});
