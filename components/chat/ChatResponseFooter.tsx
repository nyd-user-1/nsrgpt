"use client";

import { TexText } from "./TexText";
import { useState, useRef } from "react";
import { ThumbsUp, ThumbsDown, Copy, Check, BookOpen, ExternalLink, FileText } from "lucide-react";
import { CitationList } from "@/components/agents/citations";
import { toast } from "sonner";
import type { MessageSources } from "@/hooks/useChat";
import { usePaperLookup } from "@/hooks/usePaperLookup";
import { TextSearch } from "./TextSearch";

interface ChatResponseFooterProps {
  content: string;
  isStreaming?: boolean;
  sources?: MessageSources;
  pdfUrl?: string;
}

export function ChatResponseFooter({
  content,
  isStreaming = false,
  sources,
  pdfUrl,
}: ChatResponseFooterProps) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"good" | "bad" | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [abstractOpen, setAbstractOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const sourcesRef = useRef<HTMLDivElement>(null);
  const abstractRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<HTMLDivElement>(null);

  const { data: paperData } = usePaperLookup(pdfUrl);

  // Use S2 open-access PDF when available, otherwise fall back to direct .pdf URLs
  const effectivePdfUrl =
    paperData?.openAccessPdfUrl ??
    (pdfUrl && pdfUrl.toLowerCase().endsWith(".pdf") ? pdfUrl : undefined);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  if (isStreaming) return null;

  const totalCount = sources
    ? sources.nsr.length + sources.s2.length
    : 0;

  return (
    <div className="pt-3 border-t animate-in fade-in duration-300">
      <div className="flex items-center gap-1">
        {/* Sources (Book icon) */}
        {totalCount > 0 && (
          <button
            onClick={() => {
              setSourcesOpen(!sourcesOpen);
              if (!sourcesOpen) {
                setTimeout(() => sourcesRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100);
              }
            }}
            className={`inline-flex items-center justify-center h-10 w-10 md:h-8 md:w-8 rounded-md transition-colors ${
              sourcesOpen
                ? "text-[var(--paper-text)] bg-[var(--paper-quiet)]"
                : "text-[var(--paper-muted)] hover:text-[var(--paper-text)] hover:bg-[var(--paper-quiet)]"
            }`}
            title={`${totalCount} source${totalCount !== 1 ? "s" : ""}`}
          >
            <BookOpen className="h-4 w-4" />
          </button>
        )}

        {/* Abstract (TextSearch icon) — visible when S2 paper data is available */}
        {paperData && (
          <button
            onClick={() => {
              setAbstractOpen(!abstractOpen);
              if (!abstractOpen) {
                setTimeout(() => abstractRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100);
              }
            }}
            className={`inline-flex items-center justify-center h-10 w-10 md:h-8 md:w-8 rounded-md transition-colors ${
              abstractOpen
                ? "text-[var(--paper-text)] bg-[var(--paper-quiet)]"
                : "text-[var(--paper-muted)] hover:text-[var(--paper-text)] hover:bg-[var(--paper-quiet)]"
            }`}
            title="View abstract"
          >
            <TextSearch className="h-4 w-4" />
          </button>
        )}

        {/* PDF viewer */}
        {effectivePdfUrl && (
          <button
            onClick={() => {
              setPdfOpen(!pdfOpen);
              if (!pdfOpen) {
                setTimeout(() => pdfRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100);
              }
            }}
            className={`inline-flex items-center justify-center h-10 w-10 md:h-8 md:w-8 rounded-md transition-colors ${
              pdfOpen
                ? "text-[var(--paper-text)] bg-[var(--paper-quiet)]"
                : "text-[var(--paper-muted)] hover:text-[var(--paper-text)] hover:bg-[var(--paper-quiet)]"
            }`}
            title="View PDF"
          >
            <FileText className="h-4 w-4" />
          </button>
        )}

        {/* Copy */}
        <button
          onClick={handleCopy}
          className="inline-flex items-center justify-center h-10 w-10 md:h-8 md:w-8 rounded-md text-[var(--paper-muted)] hover:text-[var(--paper-text)] hover:bg-[var(--paper-quiet)] transition-colors"
          title="Copy response"
        >
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>

        {/* Thumbs Up / Down */}
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => setFeedback(feedback === "good" ? null : "good")}
            className={`inline-flex items-center justify-center h-10 w-10 md:h-8 md:w-8 rounded-md transition-colors ${
              feedback === "good"
                ? "text-green-600 hover:text-green-600 hover:bg-green-50"
                : "text-[var(--paper-muted)] hover:text-[var(--paper-text)] hover:bg-[var(--paper-quiet)]"
            }`}
            title="Good response"
          >
            <ThumbsUp className="h-4 w-4" />
          </button>
          <button
            onClick={() => setFeedback(feedback === "bad" ? null : "bad")}
            className={`inline-flex items-center justify-center h-10 w-10 md:h-8 md:w-8 rounded-md transition-colors ${
              feedback === "bad"
                ? "text-red-500 hover:text-red-500 hover:bg-red-50"
                : "text-[var(--paper-muted)] hover:text-[var(--paper-text)] hover:bg-[var(--paper-quiet)]"
            }`}
            title="Bad response"
          >
            <ThumbsDown className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Sources dropdown */}
      {sourcesOpen && sources && (
        <div ref={sourcesRef} className="mt-2">
          {/* govblock's citations (components/agents/citations.tsx, ported 2026-11-10): one numbered, animated list. An NSR
              record opens its entity panel (open-entity, as the inline chips do); a Semantic Scholar paper opens its page. */}
          <CitationList
            citations={[
              ...sources.nsr.map((r) => ({
                id: `nsr-${r.key_number}`,
                title: <TexText text={r.title} />,
                domain: r.key_number,
                url: r.doi ? `https://doi.org/${r.doi}` : undefined,
                onOpen: () => window.dispatchEvent(new CustomEvent("open-entity", { detail: { type: "paper", id: r.key_number } })),
              })),
              ...sources.s2.map((p, i) => ({
                id: `s2-${i}`,
                title: <TexText text={p.title} />,
                domain: `${p.authors} · ${p.citations} citations`,
                url: p.url || undefined,
              })),
            ]}
            className="rounded-xl bg-[var(--paper-quiet)] p-2"
          />
        </div>
      )}

      {/* Abstract panel */}
      {abstractOpen && paperData && (
        <div ref={abstractRef} className="mt-2 border rounded-lg overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="px-3 py-2 bg-[var(--paper-quiet)] border-b">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {paperData.title && (
                  <p className="text-sm font-semibold text-[var(--paper-text)] leading-snug">
                    <TexText text={paperData.title} />
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-[var(--paper-muted)]">
                  {paperData.authors.length > 0 && (
                    <span>{paperData.authors.join(", ")}</span>
                  )}
                  {paperData.year && <span>&middot; {paperData.year}</span>}
                  {paperData.venue && <span>&middot; {paperData.venue}</span>}
                  {paperData.citationCount != null && (
                    <span>&middot; {paperData.citationCount} citations</span>
                  )}
                </div>
              </div>
              {pdfUrl && (
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs text-[var(--paper-muted)] hover:text-[var(--paper-text)] flex items-center gap-1 transition-colors"
                >
                  Open DOI
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
          {paperData.abstract && (
            <div className="px-3 py-2">
              <p className="text-xs leading-relaxed text-[var(--paper-muted)]">
                {paperData.abstract}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Inline PDF viewer */}
      {pdfOpen && effectivePdfUrl && (
        <div ref={pdfRef} className="mt-2 border rounded-lg overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center justify-between px-3 py-2 bg-[var(--paper-quiet)] border-b">
            <span className="text-xs font-medium text-[var(--paper-muted)] flex items-center gap-1.5">
              <FileText className="h-3 w-3" />
              {paperData ? "Paper PDF" : "ENDF Report PDF"}
            </span>
            <a
              href={effectivePdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--paper-muted)] hover:text-[var(--paper-text)] flex items-center gap-1 transition-colors"
            >
              Open in new tab
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <iframe
            src={`https://docs.google.com/gview?url=${encodeURIComponent(effectivePdfUrl)}&embedded=true`}
            title={paperData ? "Paper PDF" : "ENDF Report PDF"}
            className="w-full h-[50vh] md:h-[600px] bg-[var(--paper)]"
          />
        </div>
      )}
    </div>
  );
}
