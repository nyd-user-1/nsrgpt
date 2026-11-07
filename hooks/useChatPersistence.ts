import { useCallback, useState } from "react";
import { openChat, saveChat } from "@/app/chat-actions";

/** A chat message as kept by the chat store (lib/chats.ts, via app/chat-actions.ts). */
export interface PersistedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  pdfUrl?: string;
  sources?: {
    nsr: Array<{ key_number: string; title: string; doi?: string | null; similarity: number }>;
    s2: Array<{ title: string; url: string; authors: string; citations: number }>;
  };
}

export interface ChatSessionData {
  id: string;
  title: string;
  messages: PersistedMessage[];
}

// The sidebar's chat list listens for this after every save.
const announce = () => window.dispatchEvent(new Event("pax2:chats"));

export function useChatPersistence() {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const createSession = useCallback(async (_title: string, initialMessages: PersistedMessage[] = []) => {
    setIsSaving(true);
    try {
      const id = crypto.randomUUID();
      if (initialMessages.length) await saveChat(id, initialMessages);
      setCurrentSessionId(id);
      announce();
      return id;
    } finally {
      setIsSaving(false);
    }
  }, []);

  const updateMessages = useCallback(async (sessionId: string, messages: PersistedMessage[]) => {
    setIsSaving(true);
    try {
      const saved = await saveChat(sessionId, messages);
      announce();
      return !!saved;
    } catch {
      return false;
    } finally {
      setIsSaving(false);
    }
  }, []);

  const loadSession = useCallback(async (sessionId: string): Promise<ChatSessionData | null> => {
    const chat = await openChat(sessionId);
    if (!chat) return null;
    return { id: chat.meta.id, title: chat.meta.title, messages: chat.messages.map((m) => ({ ...m, timestamp: chat.meta.updatedAt })) };
  }, []);

  return { currentSessionId, setCurrentSessionId, isSaving, createSession, updateMessages, loadSession };
}
