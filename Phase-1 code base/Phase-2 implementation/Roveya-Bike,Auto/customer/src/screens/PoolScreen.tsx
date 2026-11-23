import "../../../../../users-app/src/typeface";
import { View } from "react-native";
import { UserNavigation } from "../../../../../users-app/src/navigation";
import { StoreProvider } from "../../../../../users-app/src/store";
import { colors } from "../../../../../users-app/src/theme";

export function PoolScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.night }}>
      <StoreProvider>
        <UserNavigation embedded />
      </StoreProvider>
    </View>
  );
}
