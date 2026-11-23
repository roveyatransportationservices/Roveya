import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { DragSheet } from "./DragSheet";
import { Button } from "./kit";
import { inbox } from "../data";
import { useStore, type AlertKey } from "../store";
import { colors, type } from "../theme";

type Tab = "all" | "travel";

const tabs: [Tab, string][] = [
  ["all", "All"],
  ["travel", "Travel"],
];

const alertRows: { key: AlertKey; label: string; sub: string }[] = [
  { key: "trip", label: "Trip alerts", sub: "Captain details, boarding reminders, and delays" },
  { key: "email", label: "Email", sub: "Sign-in and account mail" },
];

export function NotificationsSheet({ visible, onClose, onLogin }: { visible: boolean; onClose: () => void; onLogin: () => void }) {
  const store = useStore();
  const [tab, setTab] = useState<Tab>("all");
  const [read, setRead] = useState<string[]>([]);
  const [settings, setSettings] = useState(false);
  const signedIn = Boolean(store.user);
  const list = signedIn ? inbox.filter((item) => tab === "all" || item.kind === tab) : [];
  const unread = signedIn ? inbox.filter((item) => !read.includes(item.id)).length : 0;

  return (
    <DragSheet visible={visible} onClose={onClose} title={settings ? "Notification settings" : "Notifications"}>
      {settings ? (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
          {alertRows.map((item) => (
            <View key={item.key} style={styles.setting}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>{item.label}</Text>
                <Text style={styles.settingSub}>{item.sub}</Text>
              </View>
              <Switch value={store.alerts[item.key]} onValueChange={(on) => store.setAlert(item.key, on)} trackColor={{ true: colors.gold, false: colors.mist }} thumbColor={colors.cream} />
            </View>
          ))}
          <Button label="Back to notifications" tone="ghost" icon="arrow-back" onPress={() => setSettings(false)} style={{ marginTop: 10 }} />
        </ScrollView>
      ) : (
        <>
          {signedIn ? (
            <View style={styles.bar}>
              <View style={styles.tabs}>
                {tabs.map(([key, label]) => (
                  <Pressable key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabOn]}>
                    <Text style={[styles.tabText, tab === key && styles.tabTextOn]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable accessibilityLabel="Notification settings" hitSlop={8} onPress={() => setSettings(true)} style={styles.gear}>
                <Ionicons name="settings-outline" size={18} color={colors.gold} />
              </Pressable>
            </View>
          ) : null}

          {list.length ? (
            <ScrollView contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
              {unread ? (
                <Pressable onPress={() => setRead(inbox.map((item) => item.id))} style={styles.markAll}>
                  <Text style={styles.markAllText}>Mark all as read · {unread}</Text>
                </Pressable>
              ) : null}
              {list.map((item) => {
                const fresh = !read.includes(item.id);
                return (
                  <Pressable key={item.id} onPress={() => setRead((ids) => (ids.includes(item.id) ? ids : [...ids, item.id]))} style={[styles.item, fresh && styles.itemFresh]}>
                    <View style={[styles.itemIcon, item.kind === "offer" && { borderColor: "rgba(229,138,168,0.45)" }]}>
                      <Ionicons name={item.icon} size={18} color={item.kind === "offer" ? colors.rose : colors.gold} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.itemHead}>
                        <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
                        {fresh ? <View style={styles.dot} /> : null}
                      </View>
                      <Text style={styles.itemBody}>{item.body}</Text>
                      <Text style={styles.itemAt}>{item.at}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={40} color={colors.faint} />
              <Text style={styles.emptyText}>No messages to show</Text>
              {!signedIn ? (
                <>
                  <Text style={styles.emptySub}>Log in to get trip updates and captain details here.</Text>
                  <Button
                    label="Login"
                    onPress={() => {
                      onClose();
                      onLogin();
                    }}
                    style={{ marginTop: 16, alignSelf: "stretch" }}
                  />
                </>
              ) : null}
            </View>
          )}
        </>
      )}
    </DragSheet>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.inkwell },
  tabs: { flex: 1, flexDirection: "row", padding: 4, borderRadius: 18, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line },
  tab: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 14 },
  tabOn: { backgroundColor: colors.gold },
  tabText: { color: colors.cream, fontFamily: type.medium, fontSize: 13.5 },
  tabTextOn: { color: colors.night, fontFamily: type.semibold },
  gear: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, alignItems: "center", justifyContent: "center" },
  markAll: { alignSelf: "flex-end", paddingHorizontal: 16, paddingVertical: 10 },
  markAllText: { color: colors.gold, fontFamily: type.medium, fontSize: 12.5 },
  item: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  itemFresh: { backgroundColor: "rgba(214,160,0,0.05)" },
  itemIcon: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell, alignItems: "center", justifyContent: "center" },
  itemHead: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  itemTitle: { flex: 1, color: colors.cream, fontFamily: type.semibold, fontSize: 14.5 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold, marginTop: 6 },
  itemBody: { marginTop: 3, color: colors.muted, fontFamily: type.regular, fontSize: 13, lineHeight: 19 },
  itemAt: { marginTop: 6, color: colors.faint, fontFamily: type.regular, fontSize: 11.5 },
  empty: { alignItems: "center", paddingTop: 48, paddingHorizontal: 28 },
  emptyText: { marginTop: 14, color: colors.cream, fontFamily: type.medium, fontSize: 16 },
  emptySub: { marginTop: 6, textAlign: "center", color: colors.muted, fontFamily: type.regular, fontSize: 13, lineHeight: 19 },
  setting: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  settingLabel: { color: colors.cream, fontFamily: type.semibold, fontSize: 14.5 },
  settingSub: { marginTop: 2, color: colors.faint, fontFamily: type.regular, fontSize: 12 },
});
