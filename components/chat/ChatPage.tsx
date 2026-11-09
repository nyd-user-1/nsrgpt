"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import { ChatInputContainer } from "@/components/chat/ChatInput";
import { DetailBody, type EntityType } from "@/components/chat/EntityDetail";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { useChat } from "@/hooks/useChat";
import { SEED_PREFIX } from "@/lib/pane";

// pax-trinity's typewriter over the empty chat (components/text-type.tsx, brought back 2026-11-07), with NSR's own lines.
// It types each line, then the next, and stops on the last.
const TextType = dynamic(() => import("@/components/text-type"), { loading: () => <span className="block h-[65px]" /> });
const READY = ["NSR from 1857 to now.", "Half-lives, decay modes, Q-values.", "303,568 Nuclear Science References.", "ENSDF, XUNDL, EXFOR and NSR.", "Let's begin."];

// ChatMessage drags in react-markdown + KaTeX (~200 KB gz). A fresh landing
// renders zero messages, so that weight loads only once a conversation exists.
const ChatMessage = lazy(() =>
  import("@/components/chat/ChatMessage").then((m) => ({ default: m.ChatMessage })),
);

export function ChatPage() {
  const searchParams = useSearchParams();
  const routeSessionId = searchParams.get("c") ?? undefined;
  const router = useRouter();
  const navigate = (to: string) => router.push(to);
  const { messages, isLoading, sendMessage, stopGeneration, clearMessages, loadSession, sessionId, lambdaLastCall } =
    useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [entity, setEntity] = useState<{ type: EntityType; id: string } | null>(null);
  const [entityDetail, setEntityDetail] = useState<Record<string, unknown> | null>(null);
  // The second panel's chat, opened by askAbout (components/shell.tsx): ?seed= names the context it stored, which rides
  // every message of this chat (brief 50).
  const seedRef = useRef<string | null>(null);

  // Inline citations dispatch open-entity; the panel shows the record.
  useEffect(() => {
    function onOpen(e: Event) {
      const d = (e as CustomEvent).detail as { type: EntityType; id: string };
      setEntity(d);
      setEntityDetail(null);
      fetch(`/api/graph?op=node&type=${d.type}&id=${encodeURIComponent(d.id)}`)
        .then((r) => r.json())
        .then(setEntityDetail)
        .catch(() => setEntityDetail({ error: true }));
    }
    window.addEventListener("open-entity", onOpen);
    return () => window.removeEventListener("open-entity", onOpen);
  }, []);
  const loadedSessionRef = useRef<string | null>(null);

  // Wake both search backends the moment the page opens, so the encoder is loading while the reader types.
  useEffect(() => {
    fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wake: true }), keepalive: true }).catch(() => {});
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Cmd+Shift+O → new chat
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        clearMessages();
        router.push("/chat");
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [clearMessages, router]);

  // Load existing session from route param, or clear for new chat
  useEffect(() => {
    if (routeSessionId && routeSessionId !== loadedSessionRef.current) {
      loadedSessionRef.current = routeSessionId;
      loadSession(routeSessionId);
    } else if (!routeSessionId && loadedSessionRef.current) {
      // Navigated to "/" or "/new-chat" from a session — start fresh
      loadedSessionRef.current = null;
      clearMessages();
    }
  }, [routeSessionId, loadSession, clearMessages]);

  // Update URL when session is created (without remounting)
  useEffect(() => {
    if (sessionId && !routeSessionId && messages.length > 0 && !isLoading) {
      window.history.replaceState(null, "", `/chat?c=${sessionId}`);
    }
  }, [sessionId, routeSessionId, messages.length, isLoading]);

  // Listen for "new-chat" event from Sidebar (handles replaceState URL mismatch)
  useEffect(() => {
    function handler() {
      loadedSessionRef.current = null;
      setAutoSubmitted(false);
      clearMessages();
    }
    window.addEventListener("new-chat", handler);
    return () => window.removeEventListener("new-chat", handler);
  }, [clearMessages]);

  // Auto-submit from URL params (from reference card click)
  useEffect(() => {
    const seed = searchParams.get("seed");
    if (seed && seedRef.current === null) {
      try { seedRef.current = localStorage.getItem(SEED_PREFIX + seed); } catch {}
    }
    if (autoSubmitted || routeSessionId) return;

    const prompt = searchParams.get("prompt");
    const context = searchParams.get("context");
    const url = searchParams.get("url");

    if (prompt) {
      setAutoSubmitted(true);

      let systemContext =
        "You are NSRgpt, an AI research assistant specializing in nuclear science. " +
        "You help researchers explore Nuclear Science References (NSR) from the " +
        "National Nuclear Data Center (NNDC) at Brookhaven National Laboratory.";

      if (context) {
        systemContext +=
          "\n\nThe user is asking about a specific nuclear science reference. " +
          "Here is the record data:\n" +
          context;
      } else if (seedRef.current) {
        systemContext += "\n\n" + seedRef.current;
      }

      if (url) {
        systemContext +=
          "\n\nThe paper is available at: " +
          url +
          "\nPlease reference this DOI link in your response and provide a thorough " +
          "analysis of the paper's content, methodology, and significance.";
      }

      systemContext +=
        "\n\nProvide a detailed, expert-level analysis. Include relevant nuclear physics " +
        "context, explain the significance of the research, and highlight connections " +
        "to related work in the field.";

      sendMessage(prompt, systemContext, url || undefined);
      router.replace("/chat");
    }
  }, [searchParams, autoSubmitted, routeSessionId, sendMessage, router]);

  const hasMessages = messages.length > 0;
  // The orb stands under the newest answer (brief 50, components/agents/answer-orb.tsx).
  const orbAt = [...messages].reverse().find((m) => m.role === "assistant")?.id;
  const turns = messages.map((m) => ({ role: m.role, content: m.content }));
  const askNext = (q: string) => sendMessage(q, seedRef.current ?? undefined);

  return (
    <div className="flex h-full min-h-0">
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {hasMessages ? (
        <>
          {/* Messages — scrollable */}
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[720px] px-2 md:px-4 py-4 md:py-8">
              {messages.map((msg) => (
                <Suspense key={msg.id} fallback={<div className="mb-6 h-16 animate-pulse rounded-lg bg-[var(--paper-quiet)]" />}>
                <ChatMessage
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                  isStreaming={msg.isStreaming}
                  sources={msg.sources}
                  pdfUrl={msg.pdfUrl}
                  orb={msg.id === orbAt ? { messages: turns, onAsk: askNext } : undefined}
                />
                </Suspense>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input pinned to bottom */}
          <div className="px-2 md:px-4 py-3 md:py-4 shrink-0 bg-[var(--paper)]">
            <ChatInputContainer
              onSubmit={(text, modelId, pdf, backend) => sendMessage(text, seedRef.current ?? undefined, undefined, modelId, pdf, backend)}
              lambdaLastCall={lambdaLastCall}
              onStop={stopGeneration}
              isLoading={isLoading}
              searchToggle
            />
          </div>
        </>
      ) : (
        /* Empty state — input vertically centered */
        <div className="flex flex-1 flex-col items-center justify-center px-4">
          <div className="flex w-full max-w-[720px] flex-col gap-6">
          <div className="flex h-[65px] flex-col items-center justify-center">
            <span style={{ fontFamily: "var(--font-display), Georgia, serif" }}>
              <TextType as="span" text={READY} loop={false} typingSpeed={70} className="text-2xl font-normal text-[#2563eb] md:text-3xl" />
            </span>
          </div>
          <ChatInputContainer
            beam
            onSubmit={(text, modelId, pdf, backend) => sendMessage(text, seedRef.current ?? undefined, undefined, modelId, pdf, backend)}
              lambdaLastCall={lambdaLastCall}
            isLoading={isLoading}
            searchToggle
          />
          </div>
        </div>
      )}
    </div>
    {entity && (
      <div className="hidden w-80 shrink-0 overflow-y-auto border-l bg-[var(--paper)] p-4 md:block">
        <div className="mb-2 flex items-start justify-between">
          <Badge variant="secondary" className="text-[10px]">{entity.type}</Badge>
          <button onClick={() => setEntity(null)} className="text-[var(--paper-muted)] hover:text-[var(--paper-text)]"><X className="h-4 w-4" /></button>
        </div>
        <h2 className="font-mono text-sm font-semibold text-nuclear">{entity.id}</h2>
        {!entityDetail && <p className="mt-3 text-xs text-[var(--paper-muted)]">Loading…</p>}
        {entityDetail && !entityDetail.error && (
          <DetailBody type={entity.type} detail={entityDetail} navigate={navigate} />
        )}
        {entityDetail?.error === true && <p className="mt-3 text-xs text-[var(--paper-muted)]">Not found in the corpus.</p>}
      </div>
    )}
    </div>
  );
}
