"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowUp, Square, ChevronDown, Search, FileText, X } from "lucide-react";
import { PlusMenu } from "@/components/chat/PlusMenu";
import { useRouter } from "next/navigation";
import { MODEL_OPTIONS, DEFAULT_MODEL_ID, modelById } from "@/lib/model-options";
import { DEFAULT_SEARCH_BACKEND, LAMBDA_WARM_MS, type SearchBackend } from "@/lib/search-backends";
import { WarmCountdown } from "@/components/chat/WarmCountdown";
import { BorderLight } from "@/components/border-light";
import { chartForward } from "@/lib/viz-grow";

/* ------------------------------------------------------------------ */
/*  Model selector — the roster lives in lib/model-options.ts             */
/* ------------------------------------------------------------------ */
/*  Every id there was verified callable against this AWS account, and
 *  the SELECTION IS REAL now: it rides the request body to the chat
 *  edge function, which passes it to Bedrock. It used to be decorative
 *  ("visual only — we always use GPT-4o"), so picking Claude changed
 *  the label and nothing else.                                        */

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface ChatInputProps {
  /** The chosen Bedrock model id rides along — see lib/model-options.ts. */
  onSubmit: (message: string, modelId: string, pdf: File | null, backend: SearchBackend) => void;
  /** When the paper search last ran on Lambda, for the warm countdown. */
  lambdaLastCall?: number | null;
  onStop?: () => void;
  isLoading?: boolean;
  initialValue?: string;
  /** Show the magnifier next to "+" — switches to search mode (/search). Only the /chat page sets this. */
  searchToggle?: boolean;
  /** pax-trinity's light (components/chat/chat.tsx): before a chat starts, the cursor in the box lights its border. */
  beam?: boolean;
}

export function ChatInput({ onSubmit, onStop, isLoading, initialValue, searchToggle, lambdaLastCall = null, beam = false }: ChatInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const lit = beam && isFocused;
  // One search backend since Hugging Face was dropped, so no picker (Brendan, 2026-11-07).
  const backend = DEFAULT_SEARCH_BACKEND;
  const router = useRouter();
  const [value, setValue] = useState(initialValue ?? "");
  // A PDF from the + menu rides every question until it's removed.
  const [pdf, setPdf] = useState<File | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Model selector state
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [modelMenuAbove, setModelMenuAbove] = useState(true);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL_ID);
  const modelRef = useRef<HTMLDivElement>(null);
  const modelBtnRef = useRef<HTMLButtonElement>(null);

  // A new chat opens with the cursor already in the box, so its light is on from the start (Brendan, 2026-11-07).
  useEffect(() => {
    if (beam) textareaRef.current?.focus({ preventScroll: true });
  }, [beam]);

  // ---- textarea auto-resize ----
  useEffect(() => {
    if (initialValue) setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const maxHeight = 144;
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, maxHeight) + "px";
      textareaRef.current.style.overflowY =
        textareaRef.current.scrollHeight > maxHeight ? "auto" : "hidden";
    }
  }, [value]);

  // ---- close model menu on outside click ----
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setModelMenuOpen(false);
      }
    }
    if (modelMenuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [modelMenuOpen]);

  // ---- helpers ----
  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    onSubmit(trimmed, selectedModel, pdf, backend);
    setValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSelectPrompt = (prompt: string) => {
    setValue(prompt);
    textareaRef.current?.focus();
  };

  return (
    <div className="max-w-[720px] mx-auto w-full">
      {/* pax-trinity's composer light (Brendan, 2026-11-07): with the cursor in an empty chat's box, the border turns
          blue, a blue glow rises and a light travels the border (components/border-light.tsx). */}
      <div
        onFocus={() => setIsFocused(true)}
        onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setIsFocused(false)}
        className={`relative rounded-2xl bg-[var(--paper)] border p-3 shadow-lg transition-all ${lit ? "border-[#2563eb]" : "border-[var(--paper-rule)]"} ${isFocused ? "shadow-[0_8px_24px_rgba(0,0,0,0.08)]" : ""}`}
      >
        {lit && <BorderLight />}
        {pdf && (
          <div className="mb-2 inline-flex max-w-full items-center gap-2 rounded-lg border border-[var(--paper-rule)] bg-[var(--paper)] px-2.5 py-1.5 text-xs text-[var(--paper-text)]">
            <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--paper-muted)]" />
            <span className="truncate">{pdf.name}</span>
            <button type="button" onClick={() => setPdf(null)} className="text-[var(--paper-muted)] hover:text-[var(--paper-text)]" aria-label="Remove PDF">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Chat with the NSRdb"
          rows={1}
          className="flex-1 min-h-[40px] w-full resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 p-0 placeholder:text-[var(--paper-faint)] text-base text-[var(--paper-text)] outline-none"
        />

        {/* Bottom row: + button, model label, send button */}
        <div className="flex items-center justify-between pt-1">
          {/* + button with popup, and (on /chat) the search-mode toggle */}
          <div className="flex items-center gap-1">
            <PlusMenu
              mode="chat"
              onSelect={handleSelectPrompt}
              onAttach={(f) => (f.size > 3_500_000 ? alert("That PDF is over 3.5 MB.") : setPdf(f))}
            />
            {searchToggle && (
              <button
                type="button"
                onClick={() => chartForward(() => router.push("/search"))}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--paper-muted)] hover:text-[var(--paper-text)] hover:bg-[var(--paper-quiet)] transition-colors"
                aria-label="Search mode"
                title="Search mode"
              >
                <Search className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <WarmCountdown lastCall={lambdaLastCall} ttlMs={LAMBDA_WARM_MS} />
            {/* Model selector */}
            <div className="relative" ref={modelRef}>
              <button
                ref={modelBtnRef}
                type="button"
                onClick={() => {
                  if (!modelMenuOpen && modelBtnRef.current) {
                    const rect = modelBtnRef.current.getBoundingClientRect();
                    setModelMenuAbove(rect.top > 350);
                  }
                  setModelMenuOpen(!modelMenuOpen);
                }}
                className="inline-flex items-center gap-1.5 text-sm text-[var(--paper-muted)] hover:text-[var(--paper-text)] transition-colors rounded-lg px-2 py-1"
              >
                <img src={modelById(selectedModel).logo} alt="" width={16} height={16} className="rounded-sm" />
                <span className="font-medium">{modelById(selectedModel).label}</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${modelMenuOpen ? "rotate-180" : ""}`} />
              </button>

              {modelMenuOpen && (
                <div className={`absolute right-0 w-[calc(100vw-2rem)] md:w-[260px] rounded-xl border border-[var(--paper-rule)] bg-[var(--paper)] shadow-e3 animate-in fade-in duration-150 overflow-y-auto max-h-[min(60vh,420px)] py-1 ${
                  modelMenuAbove ? "bottom-full mb-2 slide-in-from-bottom-2" : "top-full mt-2 slide-in-from-top-2"
                }`}>
                  {MODEL_OPTIONS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setSelectedModel(m.id);
                        setModelMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-sm hover:bg-[var(--paper-quiet)] transition-colors"
                    >
                      <img src={m.logo} alt="" width={16} height={16} className="shrink-0 rounded-sm" />
                      <div className="flex-1 text-left">
                        <span className="font-medium text-[var(--paper-text)]">{m.label}</span>
                        <span className="block text-xs text-[var(--paper-muted)]">{m.description}</span>
                      </div>
                      {m.id === selectedModel && (
                        <svg className="h-4 w-4 shrink-0 text-[var(--paper-text)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Send / Stop button */}
            <button
              type="button"
              onClick={isLoading ? onStop : handleSubmit}
              disabled={!isLoading && !value.trim()}
              className={`h-10 w-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                isLoading
                  ? "bg-destructive hover:bg-destructive/90 text-white"
                  : "bg-[var(--paper-text)] hover:opacity-85 text-[var(--paper)]"
              }`}
            >
              {isLoading ? (
                <Square className="h-4 w-4" fill="currentColor" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
