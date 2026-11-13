import { useCallback, useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SAFETY_DESK, deskCallback, finishCall } from "../safety";
import { deskOpen, listConversations, loadConversation, rateDesk, sendMessage, startConversation, watchConversation, type Conversation, type DeskTicket } from "../support";
import { colors, type } from "../theme";
import { Logo, Skeleton } from "./kit";

export type Topic = { label: string; hint?: string };

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

// A chat with a real person at the ROVEYA desk. Quick topics give the agent context at once.
export function DeskChat({ topics, extras, bottomInset = 0, email, onBack }: { topics: Topic[]; extras?: { tripCode?: string; pnr?: string }; bottomInset?: number; email: string; onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  const scroller = useRef<ScrollView>(null);
  const [tickets, setTickets] = useState<DeskTicket[] | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [calling, setCalling] = useState(false);
  const [notice, setNotice] = useState("");
  const open = deskOpen();

  useEffect(() => {
    listConversations()
      .then(setTickets)
      .catch((error: Error) => {
        setTickets([]);
        setNotice(error.message);
      });
  }, []);

  const refresh = useCallback(() => {
    if (!conversation) return;
    loadConversation(conversation.ticket.id)
      .then(setConversation)
      .catch(() => undefined);
  }, [conversation?.ticket.id]);

  useEffect(() => {
    if (!conversation) return;
    return watchConversation(conversation.ticket.id, refresh);
  }, [conversation?.ticket.id, refresh]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    setNotice("");
    try {
      setConversation(conversation ? await sendMessage(conversation.ticket.id, text) : await startConversation(topic ?? "Other", text, extras));
      setDraft("");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const callMe = async () => {
    setCalling(true);
    try {
      setNotice(finishCall(await deskCallback()));
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setCalling(false);
    }
  };

  const agent = conversation?.messages.filter((message) => message.from === "desk").at(-1)?.agent;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        {onBack || conversation ? (
          <Pressable onPress={() => (conversation ? setConversation(null) : onBack?.())} hitSlop={8} style={styles.headBtn} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={18} color={colors.cream} />
          </Pressable>
        ) : null}
        <View style={styles.avatar}>
          <Logo size={30} />
          <View style={[styles.online, !open && { backgroundColor: colors.faint }]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{agent ? `${agent} · ROVEYA desk` : "ROVEYA desk"}</Text>
          <Text style={styles.subtitle}>{open ? "Real people · replies in about 2 minutes" : "Back at 5 AM · safety line open 24×7"}</Text>
        </View>
        <Pressable onPress={() => void callMe()} hitSlop={8} style={styles.headBtn} accessibilityLabel="Call the desk">
          {calling ? <ActivityIndicator size="small" color={colors.gold} /> : <Ionicons name="call-outline" size={18} color={colors.gold} />}
        </Pressable>
        <Pressable onPress={() => void Linking.openURL(`mailto:${email}`)} hitSlop={8} style={styles.headBtn} accessibilityLabel="Email the desk">
          <Ionicons name="mail-outline" size={18} color={colors.gold} />
        </Pressable>
      </View>

      <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={styles.thread} keyboardShouldPersistTaps="handled" onContentSizeChange={() => conversation && scroller.current?.scrollToEnd({ animated: true })}>
        {conversation ? (
          <>
            <Text style={styles.day}>
              {conversation.ticket.code} · {conversation.ticket.topic}
            </Text>
            {conversation.messages.map((message) =>
              message.from === "you" ? (
                <View key={message.id} style={styles.mineWrap}>
                  <View style={styles.mine}>
                    <Text style={styles.mineText}>{message.body}</Text>
                  </View>
                  <Text style={styles.time}>{clock(message.at)}</Text>
                </View>
              ) : (
                <View key={message.id} style={styles.theirs}>
                  <Text style={styles.agent}>
                    {message.agent ?? "ROVEYA desk"} · {clock(message.at)}
                  </Text>
                  <Text style={styles.theirsText}>{message.body}</Text>
                </View>
              ),
            )}
            {conversation.messages.at(-1)?.from === "you" ? (
              <View style={styles.waiting}>
                <ActivityIndicator size="small" color={colors.gold} />
                <Text style={styles.waitingText}>{open ? "An agent will reply shortly. You also get a notification." : "The desk replies from 5 AM. For anything unsafe, use SOS on your trip."}</Text>
              </View>
            ) : null}
            {conversation.ticket.status === "resolved" || conversation.ticket.status === "closed" ? (
              <>
                <Text style={styles.day}>Marked resolved. Reply if you still need help.</Text>
                <RateDesk key={conversation.ticket.id} conversation={conversation} onSaved={setConversation} />
              </>
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.intro}>
              <Text style={styles.introTitle}>Talk to a real person</Text>
              <Text style={styles.introLine}>Pick what it is about and write a line. A ROVEYA agent picks it up and stays with you until it is solved, by chat, call or email.</Text>
            </View>
            <View style={styles.topics}>
              {topics.map((item) => (
                <Pressable key={item.label} onPress={() => setTopic(item.label)} style={[styles.topic, topic === item.label && styles.topicOn]}>
                  <Text style={[styles.topicText, topic === item.label && { color: colors.night }]}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
            {topic ? <Text style={styles.hint}>{topics.find((item) => item.label === topic)?.hint ?? "Type your message below."}</Text> : null}
            <Text style={styles.section}>YOUR CONVERSATIONS</Text>
            {!tickets ? (
              <Skeleton height={60} radius={14} />
            ) : tickets.length ? (
              tickets.map((ticket) => (
                <Pressable key={ticket.id} onPress={() => void loadConversation(ticket.id).then(setConversation)} style={styles.ticket}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ticketTitle}>{ticket.topic}</Text>
                    <Text style={styles.ticketSub}>
                      {ticket.code} · {ticket.status === "pending" ? "Desk replied" : ticket.status === "open" ? "Waiting for the desk" : "Resolved"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.faint} />
                </Pressable>
              ))
            ) : (
              <Text style={styles.hint}>No conversations yet.</Text>
            )}
            <Pressable onPress={() => void Linking.openURL(`tel:${SAFETY_DESK}`)} style={styles.safety}>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.danger} />
              <Text style={styles.safetyText}>Unsafe right now? Use SOS on your trip or call the 24×7 safety line.</Text>
            </Pressable>
          </>
        )}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      </ScrollView>

      <View style={[styles.composer, { marginBottom: bottomInset }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={conversation ? "Write a message" : topic ? `About ${topic.toLowerCase()}…` : "Pick a topic, then write here"}
          placeholderTextColor={colors.faint}
          selectionColor={colors.gold}
          multiline
          style={styles.input}
        />
        <Pressable onPress={() => void send()} disabled={!draft.trim() || busy || (!conversation && !topic)} style={[styles.send, (!draft.trim() || (!conversation && !topic)) && { opacity: 0.4 }]} accessibilityLabel="Send">
          {busy ? <ActivityIndicator size="small" color={colors.night} /> : <Ionicons name="send" size={17} color={colors.night} />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// The person rates the help they got. The Support Desk sees it under Reviews and Ratings.
function RateDesk({ conversation, onSaved }: { conversation: Conversation; onSaved: (conversation: Conversation) => void }) {
  const given = conversation.feedback ?? null;
  const [stars, setStars] = useState(given?.stars ?? 0);
  const [note, setNote] = useState(given?.note ?? "");
  const [editing, setEditing] = useState(!given);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      onSaved(await rateDesk(conversation.ticket.id, stars, note.trim()));
      setEditing(false);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!editing && given) {
    return (
      <Pressable onPress={() => setEditing(true)} style={styles.rateDone}>
        <Text style={styles.rateStars}>
          {"★".repeat(given.stars)}
          {"☆".repeat(5 - given.stars)}
        </Text>
        <Text style={styles.waitingText}>Thanks for rating the ROVEYA desk. Tap to change.</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.rateCard}>
      <Text style={styles.section}>HOW DID THE ROVEYA DESK DO?</Text>
      <View style={styles.starRow}>
        {[1, 2, 3, 4, 5].map((value) => (
          <Pressable key={value} accessibilityLabel={`${value} star${value > 1 ? "s" : ""}`} onPress={() => setStars(value)} hitSlop={6}>
            <Ionicons name={value <= stars ? "star" : "star-outline"} size={28} color={colors.gold} />
          </Pressable>
        ))}
      </View>
      <TextInput value={note} onChangeText={(text) => setNote(text.slice(0, 400))} placeholder="Anything we should know? (optional)" placeholderTextColor={colors.faint} selectionColor={colors.gold} multiline style={styles.rateInput} />
      <Pressable disabled={!stars || saving} onPress={() => void save()} style={[styles.rateBtn, (!stars || saving) && { opacity: 0.5 }]}>
        {saving ? <ActivityIndicator size="small" color={colors.night} /> : <Text style={styles.rateBtnText}>Send rating</Text>}
      </Pressable>
      {error ? <Text style={styles.notice}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rateCard: { gap: 10, padding: 14, borderRadius: 16, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  rateDone: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.line },
  rateStars: { color: colors.gold, fontSize: 16, letterSpacing: 2 },
  starRow: { flexDirection: "row", gap: 10 },
  rateInput: { minHeight: 46, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.night, color: colors.cream, fontFamily: type.regular, fontSize: 14 },
  rateBtn: { height: 44, borderRadius: 22, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  rateBtnText: { color: colors.night, fontFamily: type.semibold, fontSize: 14 },
  screen: { flex: 1, backgroundColor: colors.night },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingBottom: 12, backgroundColor: colors.inkwell, borderBottomWidth: 1, borderBottomColor: colors.line },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.plum, borderWidth: 1, borderColor: colors.line },
  online: { position: "absolute", right: 0, bottom: 1, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success, borderWidth: 2, borderColor: colors.inkwell },
  title: { color: colors.cream, fontFamily: type.semibold, fontSize: 16 },
  subtitle: { marginTop: 1, color: colors.gold, fontFamily: type.regular, fontSize: 11.5 },
  headBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.mist, borderWidth: 1, borderColor: colors.line },
  thread: { padding: 14, gap: 12 },
  day: { alignSelf: "center", color: colors.faint, fontFamily: type.medium, fontSize: 11.5, textAlign: "center" },
  mineWrap: { alignSelf: "flex-end", alignItems: "flex-end", maxWidth: "82%" },
  mine: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, borderTopRightRadius: 6, backgroundColor: colors.burgundy },
  mineText: { color: colors.cream, fontFamily: type.medium, fontSize: 14, lineHeight: 20 },
  time: { marginTop: 3, color: colors.faint, fontFamily: type.regular, fontSize: 10.5 },
  theirs: { alignSelf: "flex-start", maxWidth: "86%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, borderTopLeftRadius: 6, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.hairline },
  agent: { color: colors.gold, fontFamily: type.semibold, fontSize: 11.5, marginBottom: 3 },
  theirsText: { color: colors.cream, fontFamily: type.regular, fontSize: 14, lineHeight: 21 },
  waiting: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start" },
  waitingText: { flex: 1, color: colors.faint, fontFamily: type.regular, fontSize: 12, lineHeight: 17 },
  intro: { padding: 16, borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, gap: 6 },
  introTitle: { color: colors.cream, fontFamily: type.semibold, fontSize: 17 },
  introLine: { color: colors.muted, fontFamily: type.regular, fontSize: 13, lineHeight: 19 },
  topics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  topic: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 14, borderWidth: 1.5, borderColor: colors.gold, backgroundColor: "rgba(214,160,0,0.06)" },
  topicOn: { backgroundColor: colors.gold },
  topicText: { color: colors.goldBright, fontFamily: type.medium, fontSize: 13 },
  hint: { color: colors.faint, fontFamily: type.regular, fontSize: 12.5, lineHeight: 18 },
  section: { marginTop: 6, color: colors.gold, fontFamily: type.semibold, fontSize: 11, letterSpacing: 2 },
  ticket: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 16, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  ticketTitle: { color: colors.cream, fontFamily: type.medium, fontSize: 14 },
  ticketSub: { marginTop: 2, color: colors.faint, fontFamily: type.regular, fontSize: 12 },
  safety: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6, padding: 12, borderRadius: 14, backgroundColor: "rgba(232,133,127,0.08)", borderWidth: 1, borderColor: "rgba(232,133,127,0.3)" },
  safetyText: { flex: 1, color: colors.cream, fontFamily: type.regular, fontSize: 12.5, lineHeight: 18 },
  notice: { color: colors.gold, fontFamily: type.medium, fontSize: 12.5, textAlign: "center" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 10, marginHorizontal: 12, marginTop: 6, marginBottom: 8, paddingLeft: 16, paddingRight: 6, paddingVertical: 6, minHeight: 52, borderRadius: 26, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  input: { flex: 1, maxHeight: 110, paddingVertical: 8, color: colors.cream, fontFamily: type.regular, fontSize: 14.5 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.gold },
});
