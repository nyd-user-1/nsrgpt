"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import { ChatInputContainer } from "@/components/chat/ChatInput";
import { DetailBody, type EntityType } from "@/components/chat/EntityDetail";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { EASE_OUT } from "@/lib/ease";
import { SIGN_UP_EVENT, useChat } from "@/hooks/useChat";
import { SignUpDialog } from "@/components/chat/SignUpDialog";
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
  const { messages, isLoading, sendMessage, stopGeneration, clearMessages, loadSession, sessionId, lambdaLastCall, signupAt, resendPending } =
    useChat();
  // A signed-out reader's question (hooks/useChat.ts): my sign-up message, then 2.5 s on, or on its link, the dialog.
  const [signupOpen, setSignupOpen] = useState(false);
  useEffect(() => {
    if (signupAt === null) return;
    const t = window.setTimeout(() => setSignupOpen(true), 2500);
    return () => window.clearTimeout(t);
  }, [signupAt]);
  useEffect(() => {
    const open = () => setSignupOpen(true);
    window.addEventListener(SIGN_UP_EVENT, open);
    return () => window.removeEventListener(SIGN_UP_EVENT, open);
  }, []);
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

  // Follow the stream only while the reader is already at the end (pax-trinity's chat.tsx); scrolled up to read, the page
  // holds still and the round arrow is the way back down. A new question sends the reader back to following.
  const stickRef = useRef(true);
  const [atEnd, setAtEnd] = useState(true);
  useEffect(() => {
    if (stickRef.current) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  const toEnd = () => {
    stickRef.current = true;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

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
  const askNext = (q: string) => {
    stickRef.current = true;
    sendMessage(q, seedRef.current ?? undefined);
  };

  // Two follow-ups (Brendan, 2026-11-19): once the newest answer has finished and the reader has reached its end, two next
  // prompts float into place above the input; one click asks it. Fetched once per answer from the orb's endpoint
  // (/api/chat/follow-ups), the first two of its three.
  const [followUps, setFollowUps] = useState<Record<string, string[] | "loading" | "none">>({});
  const last = messages[messages.length - 1];
  const done = !!last && last.role === "assistant" && !last.isStreaming && !isLoading && !!last.content && !last.signup;
  useEffect(() => {
    if (!done || !atEnd || !last || followUps[last.id]) return;
    const id = last.id;
    setFollowUps((f) => ({ ...f, [id]: "loading" }));
    fetch("/api/chat/follow-ups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: turns }) })
      .then((r) => (r.ok ? (r.json() as Promise<{ suggestions?: string[] }>) : null))
      .then((d) => setFollowUps((f) => ({ ...f, [id]: d?.suggestions?.length ? d.suggestions.slice(0, 2) : "none" })))
      .catch(() => setFollowUps((f) => ({ ...f, [id]: "none" })));
    // turns is rebuilt every render; the answer's id is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, atEnd, last?.id]);
  const next = done && atEnd && last && Array.isArray(followUps[last.id]) ? (followUps[last.id] as string[]) : null;

  return (
    <div className="flex h-full min-h-0">
    <div className="relative flex h-full min-w-0 flex-1 flex-col">
      {hasMessages ? (
        <>
          {/* Messages — scrollable */}
          <div
            className="flex-1 overflow-y-auto"
            onScroll={(e) => {
              const el = e.currentTarget;
              const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
              stickRef.current = gap < 120;
              setAtEnd(gap < 120);
            }}
          >
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

          {/* Scrolled up from the end, while it streams or after, the round arrow brings the reader back to it. */}
          {!atEnd && (
            <button
              type="button"
              onClick={toEnd}
              aria-label="Back to the latest"
              className="absolute bottom-28 left-1/2 z-20 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-[var(--paper-rule)] bg-[var(--paper)] text-[var(--paper-muted)] shadow-lg transition-colors hover:text-[var(--paper-text)]"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
          )}

          {/* Input pinned to bottom */}
          <div className="px-2 md:px-4 py-3 md:py-4 shrink-0 bg-[var(--paper)]">
            <AnimatePresence>
              {next && (
                <motion.div
                  key={last!.id}
                  className="mx-auto mb-2 flex w-full max-w-[720px] flex-wrap gap-2"
                  initial="hidden"
                  animate="shown"
                  exit={{ opacity: 0, y: 6, transition: { duration: 0.15 } }}
                  variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.08 } } }}
                >
                  {next.map((q) => (
                    <motion.button
                      key={q}
                      type="button"
                      onClick={() => askNext(q)}
                      variants={{ hidden: { opacity: 0, y: 14 }, shown: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE_OUT } } }}
                      className="rounded-xl border border-[var(--paper-rule)] bg-[var(--paper)] px-3.5 py-2 text-left text-sm text-[var(--paper-text)] shadow-sm transition-colors hover:bg-[var(--paper-quiet)]"
                    >
                      {q}
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            <ChatInputContainer
              onSubmit={(text, modelId, pdf, backend) => {
                stickRef.current = true;
                sendMessage(text, seedRef.current ?? undefined, undefined, modelId, pdf, backend);
              }}
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
    <SignUpDialog
      open={signupOpen}
      onClose={() => setSignupOpen(false)}
      onSignedIn={() => {
        setSignupOpen(false);
        resendPending();
      }}
    />
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
