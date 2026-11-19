"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { ChatResponseFooter } from "./ChatResponseFooter";
import { EChartBlock, StreamingContext, VideoChartBlock } from "./ChartBlocks";
import { AnswerOrb } from "@/components/agents/answer-orb";
import type { ChatTurn } from "@/lib/chat-stream";
import { cn } from "@/lib/utils";

// Inline citations: NSR key numbers in the response become live chips that
// open the entity panel (a scientific corpus answers with receipts).
const KEY_RE = /\b((?:19|20)\d{2}[A-Z]{2}\d{2})\b(?!\]|\))/g;
// Fenced blocks are left alone: a chart block's JSON (ChartBlocks.tsx) must reach its chart as written.
const citeMarkdown = (md: string) =>
  md
    .split(/(```[\s\S]*?(?:```|$))/)
    .map((part, i) => (i % 2 ? part : part.replace(KEY_RE, (m) => `[${m}](#cite:paper:${m})`)))
    .join("");

import { SIGN_UP_EVENT, type MessageSources } from "@/hooks/useChat";

/** The type scale per place (brief 50): /chat's column, a side panel, a canvas card. */
const SCALE = {
  base: { p: "mb-3 leading-relaxed", h1: "text-xl mb-3", h2: "text-lg mb-2", h3: "text-base mb-2", h4: "text-sm mb-1", ul: "pl-5 mb-3 space-y-1", ol: "pl-6 my-2 space-y-1", li: "text-sm", table: "text-sm" },
  sm: { p: "mb-2 text-sm leading-relaxed", h1: "text-base mb-2", h2: "text-sm mb-1.5", h3: "text-sm mb-1", h4: "text-xs mb-1", ul: "pl-5 mb-2 space-y-0.5", ol: "pl-5 my-1.5 space-y-0.5", li: "text-sm", table: "text-xs" },
  xs: { p: "mb-1 text-[10px] leading-snug", h1: "text-[11px] mb-1", h2: "text-[10px] mb-1", h3: "text-[10px] mb-0.5", h4: "text-[10px] mb-0.5", ul: "pl-3 mb-1", ol: "pl-3 mb-1", li: "text-[10px]", table: "text-[10px]" },
} as const;
export type ChatMarkdownSize = keyof typeof SCALE;

function components(size: ChatMarkdownSize): Components {
  const s = SCALE[size];
  const ink = "text-[var(--paper-text)]";
  return {
    p: ({ children }) => <p className={cn(s.p, ink)}>{children}</p>,
    strong: ({ children }) => <strong className={cn("font-semibold", ink)}>{children}</strong>,
    h1: ({ children }) => <h1 className={cn("font-semibold", s.h1, ink)}>{children}</h1>,
    h2: ({ children }) => <h2 className={cn("font-semibold", s.h2, ink)}>{children}</h2>,
    h3: ({ children }) => <h3 className={cn("font-semibold", s.h3, ink)}>{children}</h3>,
    h4: ({ children }) => <h4 className={cn("font-semibold", s.h4, ink)}>{children}</h4>,
    ul: ({ children }) => <ul className={cn("list-disc", s.ul)}>{children}</ul>,
    ol: ({ children }) => <ol className={cn("list-decimal", s.ol)}>{children}</ol>,
    li: ({ children }) => <li className={cn(s.li, ink)}>{children}</li>,
    hr: () => <hr className="my-3 border-[var(--paper-rule)]" />,
    // A fenced chart block draws as its chart (ChartBlocks.tsx); any other code block stays code.
    pre: ({ children }) => {
      const code = Array.isArray(children) ? children[0] : children;
      const props = (code as { props?: { className?: string; children?: unknown } } | null)?.props;
      const lang = props?.className ?? "";
      const text = String(props?.children ?? "");
      if (lang.includes("language-nsr-chart")) return <EChartBlock text={text} />;
      if (lang.includes("language-nsr-video")) return <VideoChartBlock text={text} />;
      return <pre className="mb-3 overflow-x-auto rounded-lg bg-[var(--paper-quiet)] p-3 text-sm">{children}</pre>;
    },
    table: ({ children }) => (
      <div className="mb-3 max-w-full overflow-x-auto">
        <table className={cn("w-full border-collapse", s.table, ink)}>{children}</table>
      </div>
    ),
    th: ({ children }) => <th className="border-b border-[var(--paper-rule)] px-2 py-1 text-left font-semibold">{children}</th>,
    td: ({ children }) => <td className="border-b border-[var(--paper-rule-soft)] px-2 py-1 align-top">{children}</td>,
    a: ({ href, children }) => {
      // The sign-up message's way in (hooks/useChat.ts SIGN_UP_TEXT): opens the dialog on the page.
      if (href === "#sign-up") {
        return (
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(SIGN_UP_EVENT))} className="link-wipe text-blue-500">
            {children}
          </button>
        );
      }
      if (href?.startsWith("#cite:")) {
        const [, type, id] = href.slice(1).split(":");
        return (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("open-entity", { detail: { type, id } }))}
            className="mx-0.5 inline-flex items-center rounded border bg-[var(--paper-quiet)] px-1 font-mono text-[0.85em] font-semibold text-nuclear transition-colors hover:bg-[var(--paper-quiet)]"
            title={`Open ${id}`}
          >
            {children}
          </button>
        );
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="link-wipe break-all text-blue-500">
          {children}
        </a>
      );
    },
  };
}
const COMPONENTS = { base: components("base"), sm: components("sm"), xs: components("xs") };

/** An answer's text as /chat renders it (brief 50): markdown with tables, TeX and the NSR-key citation chips, which open
 *  the entity through the open-entity event. The one renderer for assistant text; ChatMessage adds the chrome. */
export function ChatMarkdown({ content, size = "base", className, streaming = false }: { content: string; size?: ChatMarkdownSize; className?: string; streaming?: boolean }) {
  return (
    <StreamingContext.Provider value={streaming}>
      <div className={cn("min-w-0", size === "base" ? "space-y-3 text-base" : undefined, className)}>
        <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]} components={COMPONENTS[size]}>
          {citeMarkdown(content)}
        </ReactMarkdown>
      </div>
    </StreamingContext.Provider>
  );
}

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  sources?: MessageSources;
  pdfUrl?: string;
  /** A side panel's scale and width (brief 50); /chat's column by default. */
  size?: ChatMarkdownSize;
  /** The newest answer wears the orb (brief 50): its conversation, for the follow-ups, and how a follow-up is sent. */
  orb?: { messages: ChatTurn[]; onAsk: (q: string) => void };
}

export function ChatMessage({
  role,
  content,
  isStreaming,
  sources,
  pdfUrl,
  size = "base",
  orb,
}: ChatMessageProps) {
  if (role === "user") {
    if (size !== "base")
      return (
        <div className="mb-3 flex justify-end">
          <div className="max-w-[85%] rounded-lg bg-[var(--paper-quiet)] px-3 py-2">
            <p className="text-sm leading-relaxed text-[var(--paper-text)]">{content}</p>
          </div>
        </div>
      );
    return (
      <div className="flex justify-end mb-6">
        <div className="bg-[var(--paper-quiet)] rounded-lg p-3 md:p-4 border-0 max-w-[90%] md:max-w-[70%]">
          <p className="text-base leading-relaxed">{content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={size === "base" ? "mb-6 max-w-[720px]" : "mb-4"}>
      <ChatMarkdown content={content} size={size} streaming={!!isStreaming} />
      {isStreaming && !content && !orb && (
        <span className="inline-block w-1.5 h-4 bg-foreground animate-pulse" />
      )}
      <ChatResponseFooter content={content} isStreaming={isStreaming} sources={sources} pdfUrl={pdfUrl} />
      {orb && <AnswerOrb content={content} streaming={!!isStreaming} messages={orb.messages} onAsk={orb.onAsk} />}
    </div>
  );
}
