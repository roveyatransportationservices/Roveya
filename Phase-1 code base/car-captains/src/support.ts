import { api, live, watch } from "./backend";

const APP = "captain";

export type DeskTicket = { id: string; code: string; topic: string; status: "open" | "pending" | "resolved" | "closed"; tripCode: string | null; createdAt: string; lastMessageAt: string };
export type DeskMessage = { id: string | number; from: "you" | "desk"; agent: string | null; body: string; at: string };
export type DeskFeedback = { stars: number; note: string | null };
export type Conversation = { ticket: DeskTicket; messages: DeskMessage[]; feedback?: DeskFeedback | null };

// The desk answers chat from 5 AM to 11 PM; the safety line and SOS run all night.
export function deskOpen(at = new Date()) {
  const hour = new Date(at.getTime() + 330 * 60000).getUTCHours();
  return hour >= 5 && hour < 23;
}

// ---------------------------------------------------------------------------
// Preview: an agent answers on the phone so the flow can be tried offline
// ---------------------------------------------------------------------------

const preview = new Map<string, Conversation>();
const previewListeners = new Map<string, Set<() => void>>();

function previewReply(id: string, text: string) {
  setTimeout(() => {
    const conversation = preview.get(id);
    if (!conversation) return;
    conversation.messages.push({ id: Date.now(), from: "desk", agent: "Priya", body: text, at: new Date().toISOString() });
    conversation.ticket = { ...conversation.ticket, status: "pending", lastMessageAt: new Date().toISOString() };
    previewListeners.get(id)?.forEach((listener) => listener());
  }, 3500);
}

// ---------------------------------------------------------------------------

export async function listConversations(): Promise<DeskTicket[]> {
  if (!live) return [...preview.values()].map((item) => item.ticket).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  return (await api<{ tickets: DeskTicket[] }>(`/support/tickets?app=${APP}`)).tickets;
}

export async function startConversation(topic: string, message: string, extras: { tripCode?: string; pnr?: string } = {}): Promise<Conversation> {
  if (!live) {
    const id = `preview-${Date.now()}`;
    const now = new Date().toISOString();
    const conversation: Conversation = {
      ticket: { id, code: `ST-${1000 + preview.size + 1}`, topic, status: "open", tripCode: extras.tripCode ?? extras.pnr ?? null, createdAt: now, lastMessageAt: now },
      messages: [{ id: 1, from: "you", agent: null, body: message, at: now }],
    };
    preview.set(id, conversation);
    previewReply(id, `Hi, this is Priya from the ROVEYA desk. I have your message about "${topic.toLowerCase()}" and I'm checking it now.`);
    return structuredClone(conversation);
  }
  const { ticket } = await api<{ ticket: DeskTicket }>("/support/tickets", { body: { app: APP, topic, message, ...extras } });
  return loadConversation(ticket.id);
}

export async function loadConversation(id: string): Promise<Conversation> {
  if (!live) return structuredClone(preview.get(id)!);
  return api<Conversation>(`/support/tickets/${id}`);
}

export async function sendMessage(id: string, message: string): Promise<Conversation> {
  if (!live) {
    const conversation = preview.get(id)!;
    conversation.messages.push({ id: Date.now(), from: "you", agent: null, body: message, at: new Date().toISOString() });
    conversation.ticket = { ...conversation.ticket, status: "open", lastMessageAt: new Date().toISOString() };
    previewReply(id, "Thanks, noted. Give me a minute while I sort this out for you.");
    return structuredClone(conversation);
  }
  return api<Conversation>(`/support/tickets/${id}`, { body: { message } });
}

// Once the desk resolves a request, the person rates the help they got.
export async function rateDesk(id: string, stars: number, note: string): Promise<Conversation> {
  if (!live) {
    const conversation = preview.get(id)!;
    conversation.feedback = { stars, note: note || null };
    return structuredClone(conversation);
  }
  return api<Conversation>(`/support/tickets/${id}/feedback`, { body: { stars, note: note || undefined } });
}

export function watchConversation(id: string, onChange: () => void) {
  if (!live) {
    const set = previewListeners.get(id) ?? new Set();
    set.add(onChange);
    previewListeners.set(id, set);
    return () => {
      set.delete(onChange);
    };
  }
  const stop = watch("support_messages", `ticket_id=eq.${id}`, onChange);
  // Realtime is a bonus; a slow poll keeps the chat moving without it.
  const timer = setInterval(onChange, 8000);
  return () => {
    stop();
    clearInterval(timer);
  };
}
