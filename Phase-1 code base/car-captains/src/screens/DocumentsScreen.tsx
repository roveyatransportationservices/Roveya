import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button, Icon, PageTitle } from "../components/kit";
import { DOCS, REQUIRED_DOCS, pickPhoto } from "../docs";
import { service } from "../service";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { DocKind } from "../types";
import type { CaptainStack } from "../navigation";

export function DocumentsScreen({ navigation }: NativeStackScreenProps<CaptainStack, "Documents">) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<DocKind | null>(null);
  const [error, setError] = useState("");
  const docs = store.profile?.documents ?? [];
  const statusOf = (kind: DocKind) => docs.find((doc) => doc.kind === kind);
  const done = REQUIRED_DOCS.filter((kind) => statusOf(kind)).length;

  const upload = async (kind: DocKind) => {
    setError("");
    try {
      const uri = await pickPhoto(kind);
      if (!uri) return;
      setBusy(kind);
      await service.upload(kind, uri);
      await store.refresh();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const leave = () => (navigation.canGoBack() ? navigation.goBack() : navigation.replace("Tabs"));

  return (
    <View style={styles.screen}>
      <PageTitle title="Documents" onBack={leave} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130, gap: 12 }} showsVerticalScrollIndicator={false}>
        <View style={styles.progressCard}>
          <Text style={styles.progressTitle}>
            {done} of {REQUIRED_DOCS.length} required documents added
          </Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${(done / REQUIRED_DOCS.length) * 100}%` }]} />
          </View>
          <Text style={styles.progressLine}>Clear photos with all four corners in view get approved fastest, usually within 24 hours.</Text>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {(["You", "Car"] as const).map((group) => (
          <View key={group} style={{ gap: 10 }}>
            <Text style={styles.section}>{group === "You" ? "ABOUT YOU" : "YOUR CAR"}</Text>
            <View style={styles.list}>
              {DOCS.filter((doc) => doc.group === group).map((doc, index, all) => {
                const status = statusOf(doc.kind);
                const working = busy === doc.kind;
                const tone = status?.status === "verified" ? colors.success : status?.status === "rejected" ? colors.danger : status ? colors.gold : colors.faint;
                return (
                  <Pressable key={doc.kind} disabled={Boolean(busy)} onPress={() => void upload(doc.kind)} style={({ pressed }) => [styles.row, index < all.length - 1 && styles.rowLine, pressed && { backgroundColor: colors.mist }]}>
                    <View style={styles.rowIcon}>
                      <Icon name={doc.icon} size={19} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>
                        {doc.title}
                        {doc.required ? "" : " · optional"}
                      </Text>
                      <Text style={[styles.rowLine2, status?.status === "rejected" && { color: colors.danger }]} numberOfLines={2}>
                        {status?.status === "rejected"
                          ? (status.review_note ?? "Add a clearer photo.")
                          : status?.status === "verified" && status.expires_on
                            ? `Valid until ${new Date(`${status.expires_on}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                            : doc.line}
                      </Text>
                    </View>
                    {working ? (
                      <ActivityIndicator size="small" color={colors.gold} />
                    ) : (
                      <View style={[styles.badge, { borderColor: tone }]}>
                        <Text style={[styles.badgeText, { color: tone }]}>{status?.status === "verified" ? "Verified" : status?.status === "rejected" ? "Redo" : status ? "In review" : "Add"}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Button label={done === REQUIRED_DOCS.length ? "Done" : `Add ${REQUIRED_DOCS.length - done} more to finish`} icon={done === REQUIRED_DOCS.length ? "checkmark-circle-outline" : undefined} disabled={done < REQUIRED_DOCS.length} onPress={leave} />
        {done < REQUIRED_DOCS.length ? (
          <Pressable onPress={leave} hitSlop={8}>
            <Text style={styles.later}>I'll finish later</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  progressCard: { padding: 16, borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, gap: 10 },
  progressTitle: { color: colors.cream, fontFamily: type.semibold, fontSize: 15 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.mist, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.gold },
  progressLine: { color: colors.muted, fontFamily: type.regular, fontSize: 12.5, lineHeight: 18 },
  error: { color: colors.danger, fontFamily: type.regular, fontSize: 13 },
  section: { color: colors.gold, fontFamily: type.semibold, fontSize: 11, letterSpacing: 2, marginTop: 6 },
  list: { borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rowIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line },
  rowTitle: { color: colors.cream, fontFamily: type.medium, fontSize: 14 },
  rowLine2: { marginTop: 2, color: colors.faint, fontFamily: type.regular, fontSize: 12, lineHeight: 16 },
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  badgeText: { fontFamily: type.semibold, fontSize: 11 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.inkwell, borderTopWidth: 1, borderTopColor: colors.line, alignItems: "stretch" },
  later: { textAlign: "center", color: colors.gold, fontFamily: type.medium, fontSize: 13 },
});
