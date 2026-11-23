import { useWindowDimensions } from "react-native";

export const PHONE_MAX_WIDTH = 430;

export function useScreenWidth() {
  const { width } = useWindowDimensions();
  return Math.min(width, PHONE_MAX_WIDTH);
}
