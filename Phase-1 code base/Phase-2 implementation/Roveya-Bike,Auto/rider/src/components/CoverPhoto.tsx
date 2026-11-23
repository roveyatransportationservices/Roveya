import { useState, type ReactNode } from "react";
import { Image, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "../theme";

export function CoverPhoto({
  source,
  ratio,
  focus = 0.5,
  focusX = 0.5,
  style,
  children,
}: {
  source: ImageSourcePropType;
  ratio: number;
  focus?: number;
  focusX?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const [box, setBox] = useState({ width: 0, height: 0 });
  const byWidth = box.width / ratio;
  const height = Math.max(box.height, byWidth);
  const width = height === byWidth ? box.width : box.height * ratio;
  const top = Math.min(0, Math.max(box.height - height, box.height / 2 - height * focus));
  const left = Math.min(0, Math.max(box.width - width, box.width / 2 - width * focusX));
  return (
    <View style={[styles.frame, style]} onLayout={(event) => setBox(event.nativeEvent.layout)}>
      {box.width ? <Image source={source} style={{ position: "absolute", width, height, top, left }} resizeMode="cover" /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: "hidden", backgroundColor: colors.paper },
});
