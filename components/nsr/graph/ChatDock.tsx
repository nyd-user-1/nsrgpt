"use client";

import { lazy, Suspense, useRef, useState } from "react";
import { Loader2, MessageSquare, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatInput } from "@/components/chat/ChatInput";
import { ENTITY_MIME, type DragEntity, describeEntity, readDragEntity } from "@/lib/nsr-drag-entity";

const ChatMessage = lazy(() => import("@/components/chat/ChatMessage").then((m) => ({ default: m.ChatMessage })));

/**
 * The workspace's chat surface — docked on the canvas, aware of what's on it.
 * Answers carry the same NSR-key citation chips as /chat; clicking a chip
 * fires the global open-entity event, which the canvas answers by centering
 * that entity. Chat drives the graph; the graph feeds the chat.
 *
 * Drag a canvas card, rail row, or search hit onto the dock and it becomes the
 * ACTIVE CONTEXT: a banner tucked behind the input, its record prepended to
 * the system context of every message until cleared.
 */

interface Msg { role: "user" | "assistant"; content: string }

export function ChatDock({ context, open, onOpenChange, attached, onAttach, launcher = true }: {
  context: () => string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  attached: DragEntity | null;
  onAttach: (g: DragEntity | null) => void;
  /** The closed dock's own Chat button; /graph shows its diagram's title, Share and Copy there instead and opens the dock
   *  from a node's Ask (2026-11-08). */
  launcher?: boolean;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = async (text: string, modelId: string) => {
    if (!text || busy) return;
    const history = msgs;
    setMsgs((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const parts = [await describeEntity(attached), context()].filter(Boolean);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...history, { role: "user", content: text }], model: modelId, systemContext: parts.length ? parts.join("\n\n") : undefined }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`chat ${res.status}`);
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        const cur = acc;
        setMsgs((m) => {
          const n = [...m];
          n[n.length - 1] = { role: "assistant", content: cur };
          return n;
        });
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
      }
      if (!acc) {
        setMsgs((m) => {
          const n = [...m];
          n[n.length - 1] = { role: "assistant", content: "(no answer came back — try again)" };
          return n;
        });
      }
    } catch (e) {
      const aborted = (e as Error).name === "AbortError";
      setMsgs((m) => {
        const n = [...m];
        if (aborted && n[n.length - 1]?.content) return n;
        n[n.length - 1] = { role: "assistant", content: aborted ? "(stopped)" : `Error: ${(e as Error).message}` };
        return n;
      });
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  };

  if (!open) {
    if (!launcher) return null;
    return (
      <Button
        variant="outline"
        className={`absolute bottom-4 right-4 z-10 h-8 rounded-full bg-[var(--paper)] px-3.5 text-[13px] shadow-sm backdrop-blur-sm ${dragOver ? "border-2 border-dashed border-blue-400" : ""}`}
        onClick={() => onOpenChange(true)}
        onDragOver={(e) => { if (e.dataTransfer.types.includes(ENTITY_MIME)) { e.preventDefault(); e.stopPropagation(); setDragOver(true); } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          const g = readDragEntity(e.dataTransfer);
          if (!g) return;
          e.preventDefault(); e.stopPropagation();
          setDragOver(false); onAttach(g); onOpenChange(true);
        }}
      >
        <MessageSquare className="mr-1.5 h-4 w-4" /> Chat
      </Button>
    );
  }

  return (
    <div
      className={`absolute bottom-4 right-4 z-10 flex h-[32rem] w-[28rem] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-lg border border-[var(--paper-rule)] bg-[var(--paper)] shadow-lg transition-colors ${
        dragOver ? "border-2 border-dashed border-blue-400" : ""
      }`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes(ENTITY_MIME)) { e.preventDefault(); e.stopPropagation(); setDragOver(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false); }}
      onDrop={(e) => {
        const g = readDragEntity(e.dataTransfer);
        if (!g) return;
        e.preventDefault(); e.stopPropagation();
        setDragOver(false); onAttach(g);
      }}
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <p className="text-xs font-semibold text-[var(--paper-text)]">
          Chat <span className="font-normal text-[var(--paper-muted)]">· sees the canvas</span>
        </p>
        <button onClick={() => onOpenChange(false)} className="text-[var(--paper-muted)] hover:text-[var(--paper-text)]">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-3">
        {msgs.length === 0 && (
          <p className="text-xs leading-relaxed text-[var(--paper-muted)]">
            Ask about anything on the canvas — cited key numbers in the answer are live: click one and the
            canvas centers on that paper. Drag a card in here to make it the active context.
          </p>
        )}
        {dragOver && (
          <p className="mt-2 rounded-md border border-dashed border-blue-400 bg-blue-400/10 p-2 text-center text-xs text-blue-500">
            Drop to attach as context
          </p>
        )}
        <Suspense fallback={<Loader2 className="h-4 w-4 animate-spin text-[var(--paper-muted)]" />}>
          {msgs.map((m, i) => (
            <ChatMessage key={i} role={m.role} content={m.content} isStreaming={busy && i === msgs.length - 1} />
          ))}
        </Suspense>
      </div>
      <div className="relative px-2 pb-2">
        {attached && (
          // the attached-context banner tucks in behind the input container
          <div className="-mb-2 flex items-center gap-1.5 rounded-t-2xl border border-b-0 bg-[var(--paper-quiet)] px-4 pb-4 pt-2 text-[11px] text-[var(--paper-muted)]">
            <Paperclip className="h-3 w-3 shrink-0" />
            <span className="shrink-0 uppercase tracking-wide">{attached.type}</span>
            <span className="truncate font-mono text-[var(--paper-text)]">{attached.label}</span>
            {attached.title && <span className="truncate">— {attached.title}</span>}
            <button onClick={() => onAttach(null)} className="ml-auto shrink-0 hover:text-[var(--paper-text)]" title="clear context">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <div className="relative [&_.rounded-2xl]:p-2.5 [&_textarea]:text-sm">
          <ChatInput
            onSubmit={send}
            isLoading={busy}
            onStop={() => abortRef.current?.abort()}
          />
        </div>
      </div>
    </div>
  );
}
