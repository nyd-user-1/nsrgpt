import { useState, useCallback, useRef } from "react";
import { useChatPersistence } from "./useChatPersistence";
import type { SearchBackend } from "@/lib/search-backends";
import type { PersistedMessage } from "./useChatPersistence";

export interface MessageSources {
  nsr: Array<{
    key_number: string;
    title: string;
    doi?: string | null;
    similarity: number;
  }>;
  s2: Array<{
    title: string;
    url: string;
    authors: string;
    citations: number;
  }>;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  sources?: MessageSources;
  pdfUrl?: string;
  /** The answer a signed-out reader gets instead of a 402 (Brendan, 2026-11-10): what I hold and do, and the way in. */
  signup?: boolean;
}

/** Opens the chat's sign-up dialog (components/chat/SignUpDialog.tsx); the sign-up message's link sends it. */
export const SIGN_UP_EVENT = "nsrgpt:sign-up";

/** The reply to a signed-out reader's question: the chat API answers 402 until they sign in. */
export const SIGN_UP_TEXT =
  "I can answer that once you're signed in. I hold the Nuclear Science References, ENSDF, XUNDL and EXFOR, the thirteen evaluated libraries (ENDF/B from II to VIII.1, JEFF-3.3, JENDL-5, TENDL-2023 and CENDL-3.2) and ICRP 107's decay data. In chat I answer from those records and cite each one I read. A citation opens the paper, the nuclide or the dataset behind it, so you can check every number. I've kept your question, and I'll answer it the moment you're in. [Sign up and ask me again.](#sign-up)";

/** A question kept while its reader signs up, sent again once they're in. */
type Pending = { userId: string; assistantId: string; args: [string, string?, string?, string?, (File | null)?, SearchBackend?] };

/** A PDF as the chat route takes it: its name and its bytes in base64. */
function readPdf(file: File): Promise<{ name: string; data: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, data: String(r.result).split(",")[1] ?? "" });
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function toPersistedMessages(msgs: Message[]): PersistedMessage[] {
  return msgs
    .filter((m) => m.content && !m.isStreaming)
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: new Date().toISOString(),
      ...(m.pdfUrl ? { pdfUrl: m.pdfUrl } : {}),
      ...(m.sources ? { sources: m.sources } : {}),
    }));
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // When the paper search last answered from Lambda (the composer's warm countdown).
  const [lambdaLastCall, setLambdaLastCall] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;
  // The question a 402 held back, and when its sign-up message landed (ChatPage opens the dialog 2.5 s after).
  const pendingRef = useRef<Pending | null>(null);
  const [signupAt, setSignupAt] = useState<number | null>(null);
  const persistence = useChatPersistence();

  const sendMessage = useCallback(
    async (userText: string, systemContext?: string, pdfUrl?: string, modelId?: string, pdf?: File | null, backend?: SearchBackend) => {
      const userMsg: Message = {
        id: makeId(),
        role: "user",
        content: userText,
      };

      const assistantMsg: Message = {
        id: makeId(),
        role: "assistant",
        content: "",
        isStreaming: true,
        ...(pdfUrl ? { pdfUrl } : {}),
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsLoading(true);

      // Create session on first message
      let sessionId = persistence.currentSessionId;
      if (!sessionId) {
        const title = userText.slice(0, 80);
        try {
          sessionId = await persistence.createSession(title, [
            {
              id: userMsg.id,
              role: "user",
              content: userText,
              timestamp: new Date().toISOString(),
            },
          ]);
        } catch {
          // continue without persistence
        }
      }

      // Build conversation history for the Edge Function
      const historyMessages = messagesRef.current.slice(-10).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      try {
        abortRef.current = new AbortController();

        const res = await fetch(
          // NSRgpt's chat route: Bedrock, with the NSR data tools when they are wired.
          `/api/chat`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messages: [...historyMessages, { role: "user", content: userText }],
              systemContext: systemContext || undefined,
              // The picker's choice. Omitted → the route falls back to its default.
              model: modelId || undefined,
              document: pdf ? await readPdf(pdf) : undefined,
              searchBackend: backend || undefined,
            }),
            signal: abortRef.current.signal,
          }
        );

        // Signed out: my answer is the way in, and the question waits for it (Brendan, 2026-11-10).
        if (res.status === 402) {
          pendingRef.current = { userId: userMsg.id, assistantId: assistantMsg.id, args: [userText, systemContext, pdfUrl, modelId, pdf, backend] };
          setMessages((prev) => prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: SIGN_UP_TEXT, isStreaming: false, signup: true } : m)));
          setSignupAt(Date.now());
          return;
        }

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Chat error ${res.status}: ${err}`);
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";
        // The route runs the paper search before it answers and sends the papers in a header.
        let parsedSources: MessageSources | undefined;
        try {
          const raw = res.headers.get("x-nsr-sources");
          if (raw) parsedSources = { nsr: JSON.parse(decodeURIComponent(raw)), s2: [] };
        } catch {}
        if (res.headers.get("x-nsr-backend") === "lambda") setLambdaLastCall(Date.now());

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            accumulated += decoder.decode(value, { stream: true });
            const current = accumulated;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id
                  ? { ...m, content: current, isStreaming: true }
                  : m
              )
            );
          }
        }

        // Mark streaming complete
        const finalContent = accumulated;
        const finalSources = parsedSources;
        setMessages((prev) => {
          const updated = prev.map((m) =>
            m.id === assistantMsg.id
              ? {
                  ...m,
                  content: finalContent,
                  isStreaming: false,
                  sources: finalSources,
                }
              : m
          );

          // Persist completed messages, after this update: the save is a server action, which updates the Router, and an
          // updater runs while ChatPage renders (brief 50: "Cannot update Router while rendering ChatPage").
          if (sessionId) {
            setTimeout(() => persistence.updateMessages(sessionId, toPersistedMessages(updated)), 0);
          }

          return updated;
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? {
                  ...m,
                  content: `Error: ${(err as Error).message}`,
                  isStreaming: false,
                }
              : m
          )
        );
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [persistence]
  );

  const loadSession = useCallback(
    async (sessionId: string) => {
      const session = await persistence.loadSession(sessionId);
      if (session) {
        persistence.setCurrentSessionId(session.id);
        setMessages(
          session.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            ...(m.pdfUrl ? { pdfUrl: m.pdfUrl } : {}),
            ...(m.sources ? { sources: m.sources as MessageSources } : {}),
          }))
        );
        return session;
      }
      return null;
    },
    [persistence]
  );

  const stopGeneration = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsLoading(false);
    // Mark any streaming messages as complete
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
    );
  }, []);

  const clearMessages = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setMessages([]);
    setIsLoading(false);
    persistence.setCurrentSessionId(null);
  }, [persistence]);

  /** Signed in now: the kept question and its sign-up message leave the thread, and the question is asked again. */
  const resendPending = useCallback(() => {
    const p = pendingRef.current;
    if (!p) return;
    pendingRef.current = null;
    setSignupAt(null);
    setMessages((prev) => prev.filter((m) => m.id !== p.userId && m.id !== p.assistantId));
    void sendMessage(...p.args);
  }, [sendMessage]);

  return {
    messages,
    isLoading,
    sendMessage,
    signupAt,
    resendPending,
    stopGeneration,
    clearMessages,
    loadSession,
    sessionId: persistence.currentSessionId,
    lambdaLastCall,
  };
}
