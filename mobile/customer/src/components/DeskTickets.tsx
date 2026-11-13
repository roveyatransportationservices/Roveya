import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../backend";
import { Pill, SectionTitle, page } from "./PageShell";
import { colors, type } from "../theme";

type Ticket = { id: string; code: string; topic: string; status: "open" | "pending" | "resolved" | "closed"; tripCode: string | null; createdAt: string };
type Message = { id: number; from: "you" | "desk"; body: string; at: string };

const statusLabel: Record<Ticket["status"], string> = { open: "With the desk", pending: "Desk replied", resolved: "Resolved", closed: "Closed" };

function when(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

// The passenger's or captain's requests to the ROVEYA desk, with the desk's replies.
export function DeskTickets({ app, refresh, title = "YOUR REQUESTS" }: { app: "rider" | "captain"; refresh: number; title?: string }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    void api<{ tickets: Ticket[] }>(`/support/tickets?app=${app}`)
      .then((result) => setTickets(result.tickets))
      .catch(() => undefined);
  }, [refresh]);

  if (!tickets.length) return null;
  return (
    <>
      <SectionTitle>{title}</SectionTitle>
      <View style={{ gap: 10 }}>
        {tickets.map((ticket) => (
          <View key={ticket.id} style={page.card}>
            <Pressable onPress={() => setOpen(open === ticket.id ? null : ticket.id)} style={styles.head}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={page.name}>{ticket.topic}</Text>
                <Text style={[page.small, { marginTop: 3 }]}>
                  {ticket.code}
                  {ticket.tripCode ? ` · ${ticket.tripCode}` : ""} · {when(ticket.createdAt)}
                </Text>
              </View>
              <Pill label={statusLabel[ticket.status]} tone={ticket.status === "resolved" || ticket.status === "closed" ? "solid" : "gold"} />
              <Ionicons name={open === ticket.id ? "chevron-up" : "chevron-down"} size={16} color={colors.faint} />
            </Pressable>
            {open === ticket.id ? <Thread id={ticket.id} closed={ticket.status === "closed"} /> : null}
          </View>
        ))}
      </View>
    </>
  );
}

function Thread({ id, closed }: { id: string; closed: boolean }) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void api<{ messages: Message[] }>(`/support/tickets/${id}`)
      .then((result) => setMessages(result.messages))
      .catch(() => setMessages([]));
  }, [id]);

  const send = async () => {
    if (!reply.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      const result = await api<{ messages: Message[] }>(`/support/tickets/${id}`, { body: { message: reply.trim() } });
      setMessages(result.messages);
      setReply("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "We could not send that. Try again.");
    } finally {
      setSending(false);
    }
  };

  if (!messages) return <ActivityIndicator style={{ marginTop: 12 }} color={colors.gold} />;
  return (
    <View style={styles.thread}>
      {messages.map((message) => (
        <View key={message.id} style={[styles.bubble, message.from === "desk" ? styles.desk : styles.you]}>
          <Text style={styles.from}>{message.from === "desk" ? "ROVEYA DESK" : "YOU"} · {when(message.at)}</Text>
          <Text style={styles.body}>{message.body}</Text>
        </View>
      ))}
      {closed ? (
        <Text style={page.small}>This request is closed. Open a new one if you need more help.</Text>
      ) : (
        <View style={styles.replyRow}>
          <TextInput value={reply} onChangeText={(text) => setReply(text.slice(0, 1000))} placeholder="Write to the desk" placeholderTextColor={colors.faint} selectionColor={colors.gold} style={[page.input, { flex: 1, height: 46 }]} />
          <Pressable accessibilityLabel="Send" disabled={sending || !reply.trim()} onPress={() => void send()} style={[styles.send, (sending || !reply.trim()) && { opacity: 0.5 }]}>
            {sending ? <ActivityIndicator size="small" color={colors.night} /> : <Ionicons name="send" size={16} color={colors.night} />}
          </Pressable>
        </View>
      )}
      {error ? <Text style={[page.small, { color: colors.goldBright }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  thread: { marginTop: 12, gap: 8, borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: 12 },
  bubble: { padding: 10, borderRadius: 14, borderWidth: 1, maxWidth: "92%" },
  desk: { alignSelf: "flex-start", backgroundColor: colors.night, borderColor: colors.line },
  you: { alignSelf: "flex-end", backgroundColor: "rgba(214,160,0,0.1)", borderColor: "rgba(214,160,0,0.35)" },
  from: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 9.5, letterSpacing: 1.4 },
  body: { marginTop: 4, color: colors.cream, fontFamily: type.body, fontSize: 13.5, lineHeight: 19 },
  replyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
});
